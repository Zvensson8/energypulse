"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import { uuidSchema } from "@/lib/validations/enums";
import { z } from "zod";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Explicit Fas 8 entry: räkna om PI + MEPS/CRREM + combined risk efter action.
 */
export async function recalculateAfterAction(raw: {
  action_id: string;
  year?: number;
}): Promise<
  ActionResult<{
    building_id: string;
    year: number;
    combined_risk_score: number | null;
    meps_2030_gap: number | null;
    meps_status: string | null;
    crrem_misalignment_year: number | null;
    financial_risk_flag: boolean | null;
  }>
> {
  try {
    const input = z
      .object({
        action_id: uuidSchema,
        year: z.number().int().optional(),
      })
      .parse(raw);

    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { data, error } = await supabase.rpc("recalculate_after_action", {
      p_action_id: input.action_id,
      p_year: input.year ?? null,
    });
    if (error) return { success: false, error: error.message };

    const row = data as Record<string, unknown>;
    logger.info("recalculate_after_action", {
      userId: user.id,
      actionId: input.action_id,
      score: row.combined_risk_score,
    });

    return {
      success: true,
      data: {
        building_id: String(row.building_id),
        year: Number(row.year),
        combined_risk_score:
          row.combined_risk_score != null
            ? Number(row.combined_risk_score)
            : null,
        meps_2030_gap:
          row.meps_2030_gap != null ? Number(row.meps_2030_gap) : null,
        meps_status: (row.meps_status as string) ?? null,
        crrem_misalignment_year:
          row.crrem_misalignment_year != null
            ? Number(row.crrem_misalignment_year)
            : null,
        financial_risk_flag:
          row.financial_risk_flag != null
            ? Boolean(row.financial_risk_flag)
            : null,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN_ERROR",
    };
  }
}
