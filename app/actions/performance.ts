"use server";

/**
 * Server Actions for performance_indicators + calculate_yearly_performance.
 *
 * Example after import (also called automatically from commitEnergyConsumptionImport):
 *
 * ```ts
 * import { recalculateYearlyPerformance } from "@/app/actions/performance";
 *
 * const result = await recalculateYearlyPerformance({
 *   building_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
 *   year: 2024,
 * });
 * // result.data.data_gap_status → COMPLETE | EXTRAPOLATED_WARNING | INCOMPLETE_DATA
 * ```
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import {
  calculatePerformanceRequestSchema,
  performanceIndicatorRowSchema,
  type PerformanceIndicatorRow,
} from "@/lib/validations/performance-indicators";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export async function recalculateYearlyPerformance(
  raw: unknown
): Promise<ActionResult<PerformanceIndicatorRow>> {
  try {
    const input = calculatePerformanceRequestSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    if (input.override) {
      return {
        success: false,
        error: "Use overrideIncompletePerformance for overrides",
        code: "USE_OVERRIDE_ACTION",
      };
    }

    logger.info("performance.recalculate", {
      userId: user.id,
      building_id: input.building_id,
      year: input.year,
    });

    const { data, error } = await supabase.rpc("calculate_yearly_performance", {
      p_building_id: input.building_id,
      p_year: input.year,
      p_override: false,
      p_override_reason: null,
    });

    if (error) {
      return { success: false, error: error.message, code: "RPC_ERROR" };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return { success: false, error: "Empty result", code: "EMPTY_RESULT" };
    }

    const parsed = performanceIndicatorRowSchema.safeParse(row);
    return {
      success: true,
      data: parsed.success ? parsed.data : (row as PerformanceIndicatorRow),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
    return { success: false, error: message };
  }
}

export async function getPerformanceIndicator(
  buildingId: string,
  year: number
): Promise<ActionResult<PerformanceIndicatorRow | null>> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    const { data, error } = await supabase
      .from("performance_indicators")
      .select("*")
      .eq("building_id", buildingId)
      .eq("year", year)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: true, data: null };
    }

    const parsed = performanceIndicatorRowSchema.safeParse(data);
    return {
      success: true,
      data: parsed.success ? parsed.data : (data as PerformanceIndicatorRow),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
    return { success: false, error: message };
  }
}
