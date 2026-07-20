"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import {
  completeActionSchema,
  revertApplicationSchema,
  simulateActionSchema,
  simulatePackageSchema,
} from "@/lib/validations/workflow";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

function toError(e: unknown): ActionResult<never> {
  const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
  if (message === "UNAUTHORIZED")
    return { success: false, error: "Inloggning krävs", code: "UNAUTHORIZED" };
  if (message === "FORBIDDEN" || message.startsWith("FORBIDDEN_ROLE"))
    return { success: false, error: "Otillräcklig behörighet", code: "FORBIDDEN" };
  return { success: false, error: message, code: "ERROR" };
}

export type ApplicationDiff = {
  id: string;
  action_id: string;
  building_id: string;
  target_year: number;
  status: string;
  saving_kwh_applied: number | null;
  baseline_energy_intensity: number | null;
  result_energy_intensity: number | null;
  baseline_meps_2030_gap: number | null;
  result_meps_2030_gap: number | null;
  baseline_stranding_year: number | null;
  result_stranding_year: number | null;
  baseline_data_gap_status: string | null;
  result_data_gap_status: string | null;
  applied_at: string;
  method: string;
  reason: string | null;
};

export type MetricSnapshot = {
  ok?: boolean;
  energy_intensity: number | null;
  primary_energy_intensity?: number | null;
  ghg_intensity?: number | null;
  total_energy_kwh?: number | null;
  meps_2030_gap: number | null;
  meps_2033_gap?: number | null;
  meps_status: string | null;
  crrem_stranding_year: number | null;
  crrem_misalignment_year?: number | null;
  combined_score: number | null;
  financial_risk_flag: boolean | null;
  data_gap_status?: string | null;
  data_completeness_percent?: number | null;
  a_temp?: number | null;
  year?: number;
  warnings?: string[];
};

export type SimulationResult = {
  building_id: string;
  year: number;
  saving_kwh: number;
  baseline: MetricSnapshot;
  projected: MetricSnapshot;
  delta: {
    energy_intensity: number | null;
    meps_2030_gap: number | null;
    stranding_years_gained: number | null;
    combined_score: number | null;
  };
  actions: Array<{
    id: string;
    title: string | null;
    estimated_saving_kwh: number | null;
    investment_cost: number | null;
  }>;
  warnings: string[];
};

function asNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asBool(v: unknown): boolean | null {
  if (v == null) return null;
  return Boolean(v);
}

function parseSnapshot(raw: unknown): MetricSnapshot {
  const o = (raw ?? {}) as Record<string, unknown>;
  const warnings = Array.isArray(o.warnings)
    ? (o.warnings as unknown[]).map(String)
    : [];
  return {
    ok: o.ok == null ? undefined : Boolean(o.ok),
    energy_intensity: asNum(o.energy_intensity),
    primary_energy_intensity: asNum(o.primary_energy_intensity),
    ghg_intensity: asNum(o.ghg_intensity),
    total_energy_kwh: asNum(o.total_energy_kwh),
    meps_2030_gap: asNum(o.meps_2030_gap),
    meps_2033_gap: asNum(o.meps_2033_gap),
    meps_status: o.meps_status != null ? String(o.meps_status) : null,
    crrem_stranding_year: asNum(o.crrem_stranding_year),
    crrem_misalignment_year: asNum(o.crrem_misalignment_year),
    combined_score: asNum(o.combined_score),
    financial_risk_flag: asBool(o.financial_risk_flag),
    data_gap_status:
      o.data_gap_status != null ? String(o.data_gap_status) : null,
    data_completeness_percent: asNum(o.data_completeness_percent),
    a_temp: asNum(o.a_temp),
    year: asNum(o.year) ?? undefined,
    warnings,
  };
}

function parseSimulation(raw: unknown): SimulationResult {
  const o = (raw ?? {}) as Record<string, unknown>;
  const delta = (o.delta ?? {}) as Record<string, unknown>;
  const actionsRaw = Array.isArray(o.actions) ? o.actions : [];
  const warnings = Array.isArray(o.warnings)
    ? (o.warnings as unknown[]).map(String)
    : [];
  return {
    building_id: o.building_id != null ? String(o.building_id) : "",
    year: asNum(o.year) ?? new Date().getFullYear() - 1,
    saving_kwh: asNum(o.saving_kwh) ?? 0,
    baseline: parseSnapshot(o.baseline),
    projected: parseSnapshot(o.projected),
    delta: {
      energy_intensity: asNum(delta.energy_intensity),
      meps_2030_gap: asNum(delta.meps_2030_gap),
      stranding_years_gained: asNum(delta.stranding_years_gained),
      combined_score: asNum(delta.combined_score),
    },
    actions: actionsRaw.map((a) => {
      const row = a as Record<string, unknown>;
      return {
        id: String(row.id ?? ""),
        title: row.title != null ? String(row.title) : null,
        estimated_saving_kwh: asNum(row.estimated_saving_kwh),
        investment_cost: asNum(row.investment_cost),
      };
    }),
    warnings,
  };
}

/** Dry-run: engine projection without writing status or adjustments. */
export async function simulateAction(
  raw: unknown
): Promise<ActionResult<SimulationResult>> {
  try {
    const input = simulateActionSchema.parse(raw);
    const supabase = await createClient();
    await requireUser(supabase);

    const { data, error } = await supabase.rpc("simulate_action_impact", {
      p_action_id: input.action_id,
      p_year: input.year ?? null,
    });
    if (error) return { success: false, error: error.message };

    return { success: true, data: parseSimulation(data) };
  } catch (e) {
    return toError(e);
  }
}

/** Dry-run package of actions on one building. */
export async function simulateActionPackage(
  raw: unknown
): Promise<ActionResult<SimulationResult>> {
  try {
    const input = simulatePackageSchema.parse(raw);
    const supabase = await createClient();
    await requireUser(supabase);

    const { data, error } = await supabase.rpc("simulate_actions_package", {
      p_building_id: input.building_id,
      p_action_ids: input.action_ids,
      p_year: input.year ?? null,
    });
    if (error) return { success: false, error: error.message };

    return { success: true, data: parseSimulation(data) };
  } catch (e) {
    return toError(e);
  }
}

/** Markera åtgärd completed – DB-trigger anropar apply_completed_action. */
export async function completeAction(
  raw: unknown
): Promise<ActionResult<ApplicationDiff>> {
  try {
    const input = completeActionSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { error: uErr } = await supabase
      .from("actions")
      .update({
        status: "completed",
        completed_date: new Date().toISOString().slice(0, 10),
      })
      .eq("id", input.action_id);

    if (uErr) return { success: false, error: uErr.message };

    // Trigger bör ha kört; hämta application (eller anropa explicit)
    let { data: existingApp } = await supabase
      .from("action_applications")
      .select("*")
      .eq("action_id", input.action_id)
      .eq("status", "applied")
      .maybeSingle();

    if (!existingApp) {
      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        "apply_completed_action",
        {
          p_action_id: input.action_id,
          p_year: input.year ?? null,
          p_reason: input.reason ?? "Manuellt completed",
        }
      );
      if (rpcErr) {
        logger.warn("apply_completed_action rpc", { error: rpcErr.message });
        return {
          success: false,
          error: `Åtgärd markerad klar men tillämpning misslyckades: ${rpcErr.message}`,
        };
      }
      if (rpcData) {
        existingApp = rpcData as unknown as typeof existingApp;
      }
    }

    if (!existingApp) {
      return {
        success: false,
        error:
          "Åtgärd markerad klar men ingen före/efter-diff skapades. Kontrollera estimated_saving_kwh och prestandadata.",
      };
    }

    logger.info("action.completed", {
      userId: user.id,
      actionId: input.action_id,
    });

    return {
      success: true,
      data: existingApp as unknown as ApplicationDiff,
    };
  } catch (e) {
    return toError(e);
  }
}

export async function revertActionApplication(
  raw: unknown
): Promise<ActionResult<ApplicationDiff>> {
  try {
    const input = revertApplicationSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { data, error } = await supabase.rpc("revert_action_application", {
      p_application_id: input.application_id,
      p_reason: input.reason,
    });
    if (error) return { success: false, error: error.message };

    return { success: true, data: data as unknown as ApplicationDiff };
  } catch (e) {
    return toError(e);
  }
}

export async function listActionApplications(opts?: {
  buildingId?: string;
  actionId?: string;
}): Promise<ActionResult<ApplicationDiff[]>> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    let q = supabase
      .from("action_applications")
      .select("*")
      .order("applied_at", { ascending: false })
      .limit(100);

    if (opts?.buildingId) q = q.eq("building_id", opts.buildingId);
    if (opts?.actionId) q = q.eq("action_id", opts.actionId);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as ApplicationDiff[] };
  } catch (e) {
    return toError(e);
  }
}
