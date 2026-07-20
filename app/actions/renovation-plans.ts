"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import { z } from "zod";
import { uuidSchema } from "@/lib/validations/enums";
import {
  generateScenariosSchema,
  selectScenarioSchema,
} from "@/lib/validations/workflow";
import {
  simulateActionPackage,
  type SimulationResult,
} from "@/app/actions/action-application";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export type RenovationPlan = {
  id: string;
  building_id: string | null;
  property_id: string | null;
  building_name: string | null;
  title: string;
  status: string;
  target_misalignment_year: number | null;
  target_meps_status: string | null;
  total_estimated_cost: number | null;
  currency: string;
  baseline_combined_score: number | null;
  projected_combined_score: number | null;
  notes: string | null;
  actions: RenovationPlanAction[];
};

export type RenovationPlanAction = {
  id: string;
  action_id: string;
  sort_order: number;
  expected_impact: {
    meps_gap?: number | null;
    misalignment_shift?: number | null;
    ped?: number | null;
  };
  action_title: string | null;
  investment_cost: number | null;
  status: string | null;
};

function toError(e: unknown): ActionResult<never> {
  const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
  if (message === "UNAUTHORIZED")
    return { success: false, error: "Inloggning krävs", code: "UNAUTHORIZED" };
  if (message === "FORBIDDEN" || message.startsWith("FORBIDDEN_ROLE"))
    return { success: false, error: "Otillräcklig behörighet", code: "FORBIDDEN" };
  return { success: false, error: message, code: "ERROR" };
}

async function loadPlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string
): Promise<RenovationPlan | null> {
  const { data: plan, error } = await supabase
    .from("renovation_plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();
  if (error || !plan) return null;

  let buildingName: string | null = null;
  if (plan.building_id) {
    const { data: b } = await supabase
      .from("buildings")
      .select("name")
      .eq("id", plan.building_id as string)
      .maybeSingle();
    buildingName = (b?.name as string) ?? null;
  }

  const { data: links } = await supabase
    .from("renovation_plan_actions")
    .select("id, action_id, sort_order, expected_impact")
    .eq("plan_id", planId)
    .order("sort_order");

  const actionIds = (links ?? []).map((l) => l.action_id as string);
  const actionMap = new Map<
    string,
    { title: string; investment_cost: number | null; status: string }
  >();
  if (actionIds.length > 0) {
    const { data: acts } = await supabase
      .from("actions")
      .select("id, title, investment_cost, status")
      .in("id", actionIds);
    for (const a of acts ?? []) {
      actionMap.set(a.id as string, {
        title: a.title as string,
        investment_cost: a.investment_cost as number | null,
        status: a.status as string,
      });
    }
  }

  return {
    id: plan.id as string,
    building_id: plan.building_id as string | null,
    property_id: plan.property_id as string | null,
    building_name: buildingName,
    title: plan.title as string,
    status: plan.status as string,
    target_misalignment_year: plan.target_misalignment_year as number | null,
    target_meps_status: plan.target_meps_status as string | null,
    total_estimated_cost: plan.total_estimated_cost as number | null,
    currency: (plan.currency as string) ?? "SEK",
    baseline_combined_score: plan.baseline_combined_score as number | null,
    projected_combined_score: plan.projected_combined_score as number | null,
    notes: plan.notes as string | null,
    actions: (links ?? []).map((l) => {
      const a = actionMap.get(l.action_id as string);
      const impact = (l.expected_impact ?? {}) as RenovationPlanAction["expected_impact"];
      return {
        id: l.id as string,
        action_id: l.action_id as string,
        sort_order: l.sort_order as number,
        expected_impact: impact,
        action_title: a?.title ?? null,
        investment_cost: a?.investment_cost ?? null,
        status: a?.status ?? null,
      };
    }),
  };
}

export async function generateRenovationPlan(raw: {
  building_id: string;
  year?: number;
  title?: string;
}): Promise<ActionResult<RenovationPlan>> {
  try {
    const schema = z.object({
      building_id: uuidSchema,
      year: z.number().int().optional(),
      title: z.string().max(200).optional(),
    });
    const input = schema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { data: planId, error } = await supabase.rpc(
      "generate_renovation_plan",
      {
        p_building_id: input.building_id,
        p_year: input.year ?? null,
        p_title: input.title ?? null,
      }
    );
    if (error) return { success: false, error: error.message };

    const plan = await loadPlan(supabase, planId as string);
    if (!plan) return { success: false, error: "Plan skapades men kunde inte laddas" };

    logger.info("renovation.generated", { userId: user.id, planId: plan.id });
    return { success: true, data: plan };
  } catch (e) {
    return toError(e);
  }
}

export async function listRenovationPlans(opts?: {
  buildingId?: string;
  status?: string;
}): Promise<ActionResult<RenovationPlan[]>> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    let q = supabase
      .from("renovation_plans")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(100);

    if (opts?.buildingId) q = q.eq("building_id", opts.buildingId);
    if (opts?.status && opts.status !== "all") q = q.eq("status", opts.status);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    const plans: RenovationPlan[] = [];
    for (const row of data ?? []) {
      const p = await loadPlan(supabase, row.id as string);
      if (p) plans.push(p);
    }
    return { success: true, data: plans };
  } catch (e) {
    return toError(e);
  }
}

export async function updateRenovationPlanStatus(raw: {
  plan_id: string;
  status: "draft" | "approved" | "in_progress" | "completed";
}): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { error } = await supabase
      .from("renovation_plans")
      .update({ status: raw.status })
      .eq("id", raw.plan_id);
    if (error) return { success: false, error: error.message };

    // Om completed – godkänn länade actions till completed via recalculate
    if (raw.status === "completed") {
      const { data: links } = await supabase
        .from("renovation_plan_actions")
        .select("action_id")
        .eq("plan_id", raw.plan_id);
      for (const l of links ?? []) {
        await supabase
          .from("actions")
          .update({
            status: "completed",
            completed_date: new Date().toISOString().slice(0, 10),
          })
          .eq("id", l.action_id as string)
          .neq("status", "completed");
      }
    }

    if (raw.status === "approved") {
      const { data: links } = await supabase
        .from("renovation_plan_actions")
        .select("action_id")
        .eq("plan_id", raw.plan_id);
      for (const l of links ?? []) {
        await supabase
          .from("actions")
          .update({ status: "approved" })
          .eq("id", l.action_id as string)
          .eq("status", "proposed");
      }
    }

    logger.info("renovation.status", {
      userId: user.id,
      planId: raw.plan_id,
      status: raw.status,
    });
    return { success: true, data: { id: raw.plan_id } };
  } catch (e) {
    return toError(e);
  }
}

export async function getRenovationPlan(
  planId: string
): Promise<ActionResult<RenovationPlan | null>> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);
    const plan = await loadPlan(supabase, planId);
    return { success: true, data: plan };
  } catch (e) {
    return toError(e);
  }
}

// ---------------------------------------------------------------------------
// Fas 9: A/B/C scenarios
// ---------------------------------------------------------------------------

export type ScenarioKey = "economy" | "balanced" | "aggressive";

export type RenovationScenario = {
  key: ScenarioKey;
  label: string;
  action_ids: string[];
  actions: Array<{
    id: string;
    title: string;
    cost: number | null;
    saving_kwh: number | null;
  }>;
  total_cost: number;
  total_saving_kwh: number;
  simulation: SimulationResult;
  meets_meps_2030: boolean;
  meets_misalign_2035: boolean;
  cost_per_risk_point: number | null;
};

type Candidate = {
  id: string;
  title: string;
  cost: number;
  saving_kwh: number;
  priority: number;
  efficiency: number;
};

function efficiencyOf(c: { saving_kwh: number; cost: number; priority: number }) {
  if (c.saving_kwh > 0) return c.saving_kwh / Math.max(c.cost, 1);
  return c.priority / Math.max(c.cost, 1);
}

function meetsFromSim(sim: SimulationResult) {
  const meps = sim.projected.meps_status === "compliant";
  const mis =
    sim.projected.crrem_stranding_year != null &&
    sim.projected.crrem_stranding_year >= 2035;
  return { meets_meps_2030: meps, meets_misalign_2035: mis };
}

function costPerRisk(cost: number, sim: SimulationResult): number | null {
  const drop = -(sim.delta.combined_score ?? 0);
  if (drop <= 0) return null;
  return cost / drop;
}

async function simulatePackageIds(
  buildingId: string,
  ids: string[],
  year?: number
): Promise<SimulationResult> {
  if (ids.length === 0) {
    throw new Error("Inga åtgärder i paketet");
  }
  const res = await simulateActionPackage({
    building_id: buildingId,
    action_ids: ids,
    year,
  });
  if (!res.success) {
    throw new Error(res.error);
  }
  return res.data;
}

/**
 * Build greedy package until stop condition.
 * stop: called after each addition with current simulation.
 */
async function greedyPackage(
  buildingId: string,
  sorted: Candidate[],
  year: number | undefined,
  opts: {
    maxActions: number;
    maxCost?: number;
    stop?: (sim: SimulationResult, ids: string[]) => boolean;
  }
): Promise<{ ids: string[]; sim: SimulationResult }> {
  const ids: string[] = [];
  let cost = 0;
  let lastSim: SimulationResult | null = null;

  for (const c of sorted) {
    if (ids.length >= opts.maxActions) break;
    if (opts.maxCost != null && cost + c.cost > opts.maxCost && ids.length > 0)
      break;

    const next = [...ids, c.id];
    const sim = await simulatePackageIds(buildingId, next, year);
    ids.push(c.id);
    cost += c.cost;
    lastSim = sim;

    if (opts.stop?.(sim, ids)) break;
  }

  if (!lastSim) {
    // No candidates — baseline-only via empty package RPC needs at least one id;
    // return zero-impact shape by simulating with first action of empty set impossible.
    // Callers handle empty candidates before calling.
    throw new Error("Inga åtgärder att simulera");
  }
  return { ids, sim: lastSim };
}

/** Generate economy / balanced / aggressive scenarios (no DB writes). */
export async function generateRenovationScenarios(
  raw: unknown
): Promise<ActionResult<RenovationScenario[]>> {
  try {
    const input = generateScenariosSchema.parse(raw);
    const supabase = await createClient();
    await requireUser(supabase);

    const { data: acts, error } = await supabase
      .from("actions")
      .select(
        "id, title, investment_cost, estimated_saving_kwh, priority_score, status"
      )
      .eq("building_id", input.building_id)
      .in("status", ["proposed", "approved", "in_progress"])
      .order("priority_score", { ascending: false, nullsFirst: false })
      .limit(40);

    if (error) return { success: false, error: error.message };

    const candidates: Candidate[] = (acts ?? []).map((a) => {
      const cost = Number(a.investment_cost ?? 0);
      const saving = Number(a.estimated_saving_kwh ?? 0);
      const priority = Number(a.priority_score ?? 0);
      return {
        id: a.id as string,
        title: (a.title as string) ?? "Åtgärd",
        cost,
        saving_kwh: saving,
        priority,
        efficiency: efficiencyOf({
          saving_kwh: saving,
          cost,
          priority,
        }),
      };
    });

    // Prefer candidates with savings; keep priority-only at end
    const withSaving = candidates
      .filter((c) => c.saving_kwh > 0)
      .sort((a, b) => b.efficiency - a.efficiency);
    const withoutSaving = candidates
      .filter((c) => c.saving_kwh <= 0)
      .sort((a, b) => b.priority - a.priority);
    const pool = [...withSaving, ...withoutSaving].slice(0, 12);

    if (pool.length === 0) {
      return {
        success: false,
        error:
          "Inga öppna åtgärder på byggnaden. Skapa eller importera åtgärder först.",
      };
    }

    const totalCostAll = pool.reduce((s, c) => s + c.cost, 0);
    const economyBudget = Math.max(
      pool[0]?.cost ?? 0,
      totalCostAll * 0.3
    );

    // A – economy: up to 3 actions within 30% budget
    const economy = await greedyPackage(
      input.building_id,
      pool,
      input.year,
      {
        maxActions: 3,
        maxCost: economyBudget > 0 ? economyBudget : undefined,
      }
    );

    // B – balanced: until MEPS or misalign≥2035, max 6
    const balanced = await greedyPackage(
      input.building_id,
      pool,
      input.year,
      {
        maxActions: 6,
        stop: (sim) => {
          const m = meetsFromSim(sim);
          return m.meets_meps_2030 || m.meets_misalign_2035;
        },
      }
    );

    // C – aggressive: both targets or max 8
    const aggressive = await greedyPackage(
      input.building_id,
      pool,
      input.year,
      {
        maxActions: 8,
        stop: (sim) => {
          const m = meetsFromSim(sim);
          return m.meets_meps_2030 && m.meets_misalign_2035;
        },
      }
    );

    const pack = (
      key: ScenarioKey,
      label: string,
      ids: string[],
      sim: SimulationResult
    ): RenovationScenario => {
      const actions = ids.map((id) => {
        const c = pool.find((x) => x.id === id)!;
        return {
          id,
          title: c.title,
          cost: c.cost || null,
          saving_kwh: c.saving_kwh || null,
        };
      });
      const total_cost = actions.reduce((s, a) => s + (a.cost ?? 0), 0);
      const total_saving_kwh = actions.reduce(
        (s, a) => s + (a.saving_kwh ?? 0),
        0
      );
      const flags = meetsFromSim(sim);
      return {
        key,
        label,
        action_ids: ids,
        actions,
        total_cost,
        total_saving_kwh,
        simulation: sim,
        ...flags,
        cost_per_risk_point: costPerRisk(total_cost, sim),
      };
    };

    const scenarios: RenovationScenario[] = [
      pack("economy", "Billig", economy.ids, economy.sim),
      pack("balanced", "Balanserad", balanced.ids, balanced.sim),
      pack("aggressive", "Aggressiv", aggressive.ids, aggressive.sim),
    ];

    // Deduplicate identical packages: keep first unique by action_ids signature
    const seen = new Set<string>();
    const unique = scenarios.filter((s) => {
      const sig = s.action_ids.slice().sort().join(",");
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });

    return {
      success: true,
      data: unique.length > 0 ? unique : scenarios.slice(0, 1),
    };
  } catch (e) {
    return toError(e);
  }
}

/** Persist chosen scenario as renovation_plans draft (engine projection). */
export async function selectRenovationScenario(
  raw: unknown
): Promise<ActionResult<RenovationPlan>> {
  try {
    const input = selectScenarioSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { data: planId, error } = await supabase.rpc(
      "create_renovation_plan_from_actions",
      {
        p_building_id: input.building_id,
        p_action_ids: input.action_ids,
        p_year: input.year ?? null,
        p_title: input.title ?? null,
        p_scenario_key: input.scenario_key ?? null,
      }
    );
    if (error) return { success: false, error: error.message };
    if (!planId) return { success: false, error: "Ingen plan-id returnerades" };

    const plan = await loadPlan(supabase, String(planId));
    if (!plan)
      return { success: false, error: "Plan skapades men kunde inte laddas" };

    logger.info("renovation.scenario_selected", {
      userId: user.id,
      planId: plan.id,
      scenario: input.scenario_key,
    });
    return { success: true, data: plan };
  } catch (e) {
    return toError(e);
  }
}

