"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import {
  completeActionSchema,
  revertApplicationSchema,
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

/** Markera åtgärd completed – DB-trigger anropar apply_completed_action. */
export async function completeAction(
  raw: unknown
): Promise<ActionResult<ApplicationDiff | null>> {
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
    const { data: existingApp } = await supabase
      .from("action_applications")
      .select("*")
      .eq("action_id", input.action_id)
      .eq("status", "applied")
      .maybeSingle();

    let app: ApplicationDiff | null = existingApp
      ? (existingApp as unknown as ApplicationDiff)
      : null;

    if (!app) {
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
      } else if (rpcData) {
        app = rpcData as unknown as ApplicationDiff;
      }
    }

    logger.info("action.completed", {
      userId: user.id,
      actionId: input.action_id,
    });

    return { success: true, data: app };
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
