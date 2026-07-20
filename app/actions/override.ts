"use server";

/**
 * Override-hantering för INCOMPLETE_DATA-beräkningar.
 *
 * - Kontrollerar system_config.override_enabled_per_role
 * - Kräver obligatorisk override_reason
 * - Anropar calculate_yearly_performance med p_override=true
 * - DB-funktionen loggar OVERRIDE till data_quality_logs
 *
 * Default tillåtna roller: admin, portfolio_manager (viewer aldrig).
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, OVERRIDE_ROLES } from "@/lib/auth/session";
import { overrideRequestSchema } from "@/lib/validations/performance-indicators";
import { performanceIndicatorRowSchema } from "@/lib/validations/performance-indicators";
import type { PerformanceIndicatorRow } from "@/lib/validations/performance-indicators";
import type { UserRole } from "@/lib/supabase/database.types";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

async function roleMayOverrideFromConfig(
  supabase: Awaited<ReturnType<typeof createClient>>,
  role: UserRole
): Promise<boolean> {
  const { data } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", "override_enabled_per_role")
    .maybeSingle();

  if (!data?.value || typeof data.value !== "object" || Array.isArray(data.value)) {
    // Fallback matches Fas 1 seed defaults
    return OVERRIDE_ROLES.includes(role);
  }

  const map = data.value as Record<string, unknown>;
  if (typeof map[role] === "boolean") {
    return map[role] as boolean;
  }
  return false;
}

/**
 * Tillåt MEPS/CRREM-beräkning trots INCOMPLETE_DATA.
 *
 * @example
 * ```ts
 * await overrideIncompletePerformance({
 *   building_id: "...",
 *   year: 2023,
 *   override_reason: "Godkänt av portföljchef för Q1-rapport",
 * });
 * ```
 */
export async function overrideIncompletePerformance(
  raw: unknown
): Promise<ActionResult<PerformanceIndicatorRow>> {
  try {
    const input = overrideRequestSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);

    // RLS + explicit role gate (admin / portfolio_manager)
    assertRole(user, OVERRIDE_ROLES);

    const allowed = await roleMayOverrideFromConfig(supabase, user.role);
    if (!allowed) {
      logger.warn("override.denied_by_config", {
        userId: user.id,
        role: user.role,
      });
      return {
        success: false,
        error: `Role ${user.role} is not enabled for override in system_config`,
        code: "OVERRIDE_DISABLED",
      };
    }

    // property_manager is not in OVERRIDE_ROLES by default; if config enables them
    // later, re-check here. Spec: portfolio_manager + admin.
    if (user.role === "viewer") {
      return {
        success: false,
        error: "viewer cannot override blocked calculations",
        code: "FORBIDDEN",
      };
    }

    logger.info("override.start", {
      userId: user.id,
      building_id: input.building_id,
      year: input.year,
    });

    const { data, error } = await supabase.rpc("calculate_yearly_performance", {
      p_building_id: input.building_id,
      p_year: input.year,
      p_override: true,
      p_override_reason: input.override_reason,
    });

    if (error) {
      logger.error("override.rpc_failed", {
        error: error.message,
        building_id: input.building_id,
        year: input.year,
      });
      return {
        success: false,
        error: error.message,
        code: "RPC_ERROR",
      };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return {
        success: false,
        error: "No performance indicator returned",
        code: "EMPTY_RESULT",
      };
    }

    // Extra explicit audit (DB also logs via function)
    await supabase.from("data_quality_logs").insert({
      entity_type: "performance_indicators",
      entity_id: row.id,
      field: "override_reason",
      old_value: null,
      new_value: input.override_reason,
      operation: "OVERRIDE",
      override_reason: input.override_reason,
      changed_by: user.id,
    });

    const parsed = performanceIndicatorRowSchema.safeParse(row);
    const result = parsed.success ? parsed.data : (row as PerformanceIndicatorRow);

    logger.info("override.done", {
      userId: user.id,
      building_id: input.building_id,
      year: input.year,
      data_gap_status: result.data_gap_status,
      override_applied: result.override_applied,
    });

    return { success: true, data: result };
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
    if (message === "UNAUTHORIZED") {
      return { success: false, error: "Authentication required", code: "UNAUTHORIZED" };
    }
    if (message === "FORBIDDEN" || message.startsWith("FORBIDDEN_ROLE")) {
      return {
        success: false,
        error: "Only admin and portfolio_manager may override",
        code: "FORBIDDEN",
      };
    }
    return { success: false, error: message, code: "ERROR" };
  }
}
