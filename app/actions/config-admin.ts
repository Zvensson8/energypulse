"use server";

/**
 * Admin: data_gap_config + system_config (Fas 5).
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole } from "@/lib/auth/session";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  DEFAULT_PRIORITY_WEIGHTS,
  parsePriorityWeights,
  type PriorityWeights,
} from "@/lib/priority";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

function toError(e: unknown): ActionResult<never> {
  const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
  if (message === "UNAUTHORIZED") {
    return { success: false, error: "Inloggning krävs", code: "UNAUTHORIZED" };
  }
  if (message === "FORBIDDEN" || message.startsWith("FORBIDDEN_ROLE")) {
    return {
      success: false,
      error: "Endast administratör har behörighet",
      code: "FORBIDDEN",
    };
  }
  return { success: false, error: message, code: "ERROR" };
}

const dataGapUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  max_missing_months_before_incomplete: z.number().int().min(0).max(12).optional(),
  warning_threshold_months: z.number().int().min(0).max(12).optional(),
  interpolation_method: z.string().min(1).max(200).optional(),
  is_active: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export async function listDataGapConfigs(): Promise<
  ActionResult<
    Array<{
      id: string;
      name: string;
      energy_type: string | null;
      space_type: string | null;
      max_missing_months_before_incomplete: number;
      interpolation_method: string;
      warning_threshold_months: number;
      is_default: boolean;
      is_active: boolean;
      notes: string | null;
    }>
  >
> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);
    const { data, error } = await supabase
      .from("data_gap_config")
      .select(
        "id, name, energy_type, space_type, max_missing_months_before_incomplete, interpolation_method, warning_threshold_months, is_default, is_active, notes"
      )
      .order("is_default", { ascending: false })
      .order("name");
    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  } catch (e) {
    return toError(e);
  }
}

export async function updateDataGapConfig(
  raw: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const input = dataGapUpdateSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, ["admin"]);

    const { id, ...patch } = input;
    const { error } = await supabase
      .from("data_gap_config")
      .update(patch)
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    logger.info("config.data_gap.updated", { userId: user.id, id });
    return { success: true, data: { id } };
  } catch (e) {
    return toError(e);
  }
}

export async function listSystemConfig(): Promise<
  ActionResult<
    Array<{
      id: string;
      key: string;
      value: unknown;
      description: string | null;
    }>
  >
> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);
    const { data, error } = await supabase
      .from("system_config")
      .select("id, key, value, description")
      .order("key");
    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  } catch (e) {
    return toError(e);
  }
}

export async function updateSystemConfigValue(raw: {
  key: string;
  value: unknown;
}): Promise<ActionResult<{ key: string }>> {
  try {
    const key = z.string().min(1).parse(raw.key);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, ["admin"]);

    const { error } = await supabase
      .from("system_config")
      .update({ value: raw.value as never })
      .eq("key", key);

    if (error) {
      // Upsert if missing (e.g. priority_weights first time)
      const { error: insErr } = await supabase.from("system_config").upsert(
        {
          key,
          value: raw.value as never,
          description:
            key === "priority_weights"
              ? "Prioriteringsvikter: meps, crrem, payback (summa 1)."
              : null,
        },
        { onConflict: "key" }
      );
      if (insErr) return { success: false, error: insErr.message };
    }

    logger.info("config.system.updated", { userId: user.id, key });
    return { success: true, data: { key } };
  } catch (e) {
    return toError(e);
  }
}

export async function getPriorityWeights(): Promise<
  ActionResult<PriorityWeights>
> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);
    const { data } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "priority_weights")
      .maybeSingle();
    return {
      success: true,
      data: data?.value
        ? parsePriorityWeights(data.value)
        : { ...DEFAULT_PRIORITY_WEIGHTS },
    };
  } catch (e) {
    return toError(e);
  }
}

export async function savePriorityWeights(
  raw: unknown
): Promise<ActionResult<PriorityWeights>> {
  try {
    const schema = z.object({
      meps: z.number().min(0).max(1),
      crrem: z.number().min(0).max(1),
      payback: z.number().min(0).max(1),
    });
    const input = schema.parse(raw);
    const weights = parsePriorityWeights(input);
    const res = await updateSystemConfigValue({
      key: "priority_weights",
      value: weights,
    });
    if (!res.success) return res;
    return { success: true, data: weights };
  } catch (e) {
    return toError(e);
  }
}
