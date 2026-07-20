"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import { z } from "zod";
import { uuidSchema } from "@/lib/validations/enums";
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
