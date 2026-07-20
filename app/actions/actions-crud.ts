"use server";

/**
 * Server Actions for the `actions` entity (åtgärdsregister).
 * Named actions-crud.ts to avoid clashing with Next.js "actions" folder semantics.
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import {
  actionInsertSchema,
  actionUpdateSchema,
  actionRowSchema,
  type ActionRow,
} from "@/lib/validations/actions";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export async function listActionsForBuilding(
  buildingId: string
): Promise<ActionResult<ActionRow[]>> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    const { data, error } = await supabase
      .from("actions")
      .select("*")
      .eq("building_id", buildingId)
      .order("priority_score", { ascending: false, nullsFirst: false });

    if (error) return { success: false, error: error.message };

    const rows = (data ?? [])
      .map((r) => actionRowSchema.safeParse(r))
      .filter((r) => r.success)
      .map((r) => r.data);

    return { success: true, data: rows };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN_ERROR",
    };
  }
}

export async function createAction(
  raw: unknown
): Promise<ActionResult<ActionRow>> {
  try {
    const input = actionInsertSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { data, error } = await supabase
      .from("actions")
      .insert(input)
      .select("*")
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? "Insert failed" };
    }

    logger.info("action.created", { userId: user.id, actionId: data.id });
    const parsed = actionRowSchema.safeParse(data);
    return {
      success: true,
      data: parsed.success ? parsed.data : (data as ActionRow),
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN_ERROR",
    };
  }
}

export async function updateAction(
  raw: unknown
): Promise<ActionResult<ActionRow>> {
  try {
    const input = actionUpdateSchema.parse(raw);
    const { id, ...patch } = input;
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { data, error } = await supabase
      .from("actions")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? "Update failed" };
    }

    logger.info("action.updated", { userId: user.id, actionId: id });
    const parsed = actionRowSchema.safeParse(data);
    return {
      success: true,
      data: parsed.success ? parsed.data : (data as ActionRow),
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN_ERROR",
    };
  }
}
