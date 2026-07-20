"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export type ImprovementCandidate = {
  building_id: string;
  building_name: string;
  latest_year: number;
  latest_primary_energy: number | null;
  latest_energy_class: string | null;
  oldest_intensity: number | null;
  latest_intensity: number | null;
  improvement_pct: number | null;
  years_span: number | null;
};

function toError(e: unknown): ActionResult<never> {
  const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
  if (message === "UNAUTHORIZED")
    return { success: false, error: "Inloggning krävs", code: "UNAUTHORIZED" };
  if (message === "FORBIDDEN" || message.startsWith("FORBIDDEN_ROLE"))
    return { success: false, error: "Otillräcklig behörighet", code: "FORBIDDEN" };
  return { success: false, error: message, code: "ERROR" };
}

export async function listImprovementCandidates(): Promise<
  ActionResult<ImprovementCandidate[]>
> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    const { data, error } = await supabase.rpc("detect_improvement_candidates", {
      p_min_intensity: 170,
      p_min_years: 3,
      p_min_improvement_pct: 10,
    });
    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: (data ?? []) as ImprovementCandidate[],
    };
  } catch (e) {
    return toError(e);
  }
}

/** Kör analys och skapa föreslagna deklarations-åtgärder. */
export async function runImprovementDetection(): Promise<
  ActionResult<{ created: number; candidates: number }>
> {
  try {
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { data: cand } = await supabase.rpc("detect_improvement_candidates", {
      p_min_intensity: 170,
      p_min_years: 3,
      p_min_improvement_pct: 10,
    });

    const { data, error } = await supabase.rpc("suggest_declaration_actions");
    if (error) return { success: false, error: error.message };

    logger.info("improvement.detection", {
      userId: user.id,
      created: data,
    });

    return {
      success: true,
      data: {
        created: Number(data ?? 0),
        candidates: Array.isArray(cand) ? cand.length : 0,
      },
    };
  } catch (e) {
    return toError(e);
  }
}
