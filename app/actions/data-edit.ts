"use server";

import { createClient } from "@/lib/supabase/server";
import {
  requireUser,
  assertRole,
  OVERRIDE_ROLES,
} from "@/lib/auth/session";
import {
  editAreaSchema,
  editConsumptionSchema,
  rollbackEditSchema,
} from "@/lib/validations/workflow";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export type EditSession = {
  id: string;
  entity_type: string;
  entity_id: string;
  building_id: string | null;
  reason: string;
  created_at: string;
  rolled_back_at: string | null;
  snapshot_before: unknown;
  snapshot_after: unknown;
};

function toError(e: unknown): ActionResult<never> {
  const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
  if (message === "UNAUTHORIZED")
    return { success: false, error: "Inloggning krävs", code: "UNAUTHORIZED" };
  if (message === "FORBIDDEN" || message.startsWith("FORBIDDEN_ROLE"))
    return {
      success: false,
      error: "Endast admin/portföljförvaltare får redigera data",
      code: "FORBIDDEN",
    };
  return { success: false, error: message, code: "ERROR" };
}

export async function editEnergyConsumption(
  raw: unknown
): Promise<ActionResult<{ session_id: string }>> {
  try {
    const input = editConsumptionSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, OVERRIDE_ROLES);

    const { data, error } = await supabase.rpc(
      "apply_energy_consumption_edit",
      {
        p_consumption_id: input.consumption_id,
        p_new_kwh: input.consumption_kwh,
        p_reason: input.reason,
      }
    );
    if (error) return { success: false, error: error.message };

    logger.info("data_edit.consumption", {
      userId: user.id,
      sessionId: data,
    });
    return { success: true, data: { session_id: data as string } };
  } catch (e) {
    return toError(e);
  }
}

export async function editArea(
  raw: unknown
): Promise<ActionResult<{ session_id: string }>> {
  try {
    const input = editAreaSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, OVERRIDE_ROLES);

    const { data, error } = await supabase.rpc("apply_area_edit", {
      p_area_id: input.area_id,
      p_a_temp: input.a_temp,
      p_reason: input.reason,
    });
    if (error) return { success: false, error: error.message };

    logger.info("data_edit.area", { userId: user.id, sessionId: data });
    return { success: true, data: { session_id: data as string } };
  } catch (e) {
    return toError(e);
  }
}

export async function rollbackDataEdit(
  raw: unknown
): Promise<ActionResult<{ ok: boolean }>> {
  try {
    const input = rollbackEditSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, OVERRIDE_ROLES);

    const { error } = await supabase.rpc("rollback_data_edit", {
      p_session_id: input.session_id,
      p_reason: input.reason,
    });
    if (error) return { success: false, error: error.message };

    logger.info("data_edit.rollback", {
      userId: user.id,
      sessionId: input.session_id,
    });
    return { success: true, data: { ok: true } };
  } catch (e) {
    return toError(e);
  }
}

export async function listDataEditSessions(limit = 50): Promise<
  ActionResult<EditSession[]>
> {
  try {
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, OVERRIDE_ROLES);

    const { data, error } = await supabase
      .from("data_edit_sessions")
      .select(
        "id, entity_type, entity_id, building_id, reason, created_at, rolled_back_at, snapshot_before, snapshot_after"
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as EditSession[] };
  } catch (e) {
    return toError(e);
  }
}

export async function listConsumptionForBuildingYear(raw: {
  building_id: string;
  year: number;
}): Promise<
  ActionResult<
    Array<{
      id: string;
      month: number;
      consumption_kwh: number;
      energy_source_name: string | null;
      is_estimated: boolean;
    }>
  >
> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    const { data, error } = await supabase
      .from("energy_consumption")
      .select(
        "id, month, consumption_kwh, is_estimated, energy_sources(name)"
      )
      .eq("building_id", raw.building_id)
      .eq("year", raw.year)
      .is("space_id", null)
      .order("month");

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data ?? []).map((r) => {
        const es = r.energy_sources as unknown as
          | { name: string }
          | { name: string }[]
          | null;
        const name = Array.isArray(es) ? es[0]?.name : es?.name;
        return {
          id: r.id as string,
          month: r.month as number,
          consumption_kwh: Number(r.consumption_kwh),
          energy_source_name: name ?? null,
          is_estimated: Boolean(r.is_estimated),
        };
      }),
    };
  } catch (e) {
    return toError(e);
  }
}

export async function listAreasForBuilding(
  buildingId: string
): Promise<
  ActionResult<
    Array<{
      id: string;
      a_temp: number;
      valid_from: string;
      valid_to: string | null;
      source: string | null;
    }>
  >
> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    const { data, error } = await supabase
      .from("areas")
      .select("id, a_temp, valid_from, valid_to, source")
      .eq("building_id", buildingId)
      .order("valid_from", { ascending: false });
    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data ?? []).map((a) => ({
        id: a.id as string,
        a_temp: Number(a.a_temp),
        valid_from: a.valid_from as string,
        valid_to: a.valid_to as string | null,
        source: a.source as string | null,
      })),
    };
  } catch (e) {
    return toError(e);
  }
}
