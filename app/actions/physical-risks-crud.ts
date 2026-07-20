"use server";

/**
 * CRUD for physical_risks (fysiska klimatrisker).
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import { z } from "zod";
import {
  riskTypeSchema,
  probabilityLevelSchema,
  consequenceLevelSchema,
  uuidSchema,
} from "@/lib/validations/enums";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

const LEVEL_SCORE: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  very_high: 4,
};

function calcScore(probability: string, consequence: string): number {
  return (LEVEL_SCORE[probability] ?? 1) * (LEVEL_SCORE[consequence] ?? 1);
}

const insertSchema = z.object({
  property_id: uuidSchema,
  risk_type: riskTypeSchema,
  probability: probabilityLevelSchema,
  consequence: consequenceLevelSchema,
  source: z.string().max(200).nullable().optional(),
  assessed_at: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const updateSchema = insertSchema.partial().extend({
  id: uuidSchema,
});

export type PhysicalRiskRow = {
  id: string;
  property_id: string;
  property_name: string;
  municipality: string | null;
  risk_type: string;
  probability: string;
  consequence: string;
  risk_score: number | null;
  source: string | null;
  assessed_at: string | null;
  notes: string | null;
  workflow_status: string;
  status_reason: string | null;
};

function toError(e: unknown): ActionResult<never> {
  const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
  if (message === "UNAUTHORIZED") {
    return { success: false, error: "Inloggning krävs", code: "UNAUTHORIZED" };
  }
  if (message === "FORBIDDEN" || message.startsWith("FORBIDDEN_ROLE")) {
    return { success: false, error: "Otillräcklig behörighet", code: "FORBIDDEN" };
  }
  return { success: false, error: message, code: "ERROR" };
}

export async function listPhysicalRisks(opts?: {
  propertyId?: string;
  hideClosed?: boolean;
}): Promise<ActionResult<PhysicalRiskRow[]>> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    let q = supabase
      .from("physical_risks")
      .select(
        `
        id, property_id, risk_type, probability, consequence,
        risk_score, source, assessed_at, notes,
        workflow_status, status_reason,
        properties!inner ( name, municipality )
      `
      )
      .order("risk_score", { ascending: false, nullsFirst: false })
      .limit(300);

    if (opts?.propertyId) {
      q = q.eq("property_id", opts.propertyId);
    }
    if (opts?.hideClosed !== false) {
      q = q.in("workflow_status", ["open", "monitoring"]);
    }

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    const rows: PhysicalRiskRow[] = (data ?? []).map((r) => {
      const p = r.properties as unknown as {
        name: string;
        municipality: string | null;
      } | null;
      return {
        id: r.id as string,
        property_id: r.property_id as string,
        property_name: p?.name ?? "—",
        municipality: p?.municipality ?? null,
        risk_type: r.risk_type as string,
        probability: r.probability as string,
        consequence: r.consequence as string,
        risk_score: r.risk_score as number | null,
        source: r.source as string | null,
        assessed_at: r.assessed_at as string | null,
        notes: r.notes as string | null,
        workflow_status: (r.workflow_status as string) ?? "open",
        status_reason: r.status_reason as string | null,
      };
    });

    return { success: true, data: rows };
  } catch (e) {
    return toError(e);
  }
}

export async function createPhysicalRisk(
  raw: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const input = insertSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const risk_score = calcScore(input.probability, input.consequence);

    const { data, error } = await supabase
      .from("physical_risks")
      .insert({
        property_id: input.property_id,
        risk_type: input.risk_type,
        probability: input.probability,
        consequence: input.consequence,
        risk_score,
        source: input.source ?? null,
        assessed_at: input.assessed_at ?? new Date().toISOString().slice(0, 10),
        notes: input.notes ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? "Insert failed" };
    }

    logger.info("physical_risk.created", {
      userId: user.id,
      id: data.id,
    });
    return { success: true, data: { id: data.id } };
  } catch (e) {
    return toError(e);
  }
}

export async function updatePhysicalRisk(
  raw: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const input = updateSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { id, ...rest } = input;
    const patch: Record<string, unknown> = { ...rest };
    if (rest.probability && rest.consequence) {
      patch.risk_score = calcScore(rest.probability, rest.consequence);
    } else if (rest.probability || rest.consequence) {
      // load existing to recompute
      const { data: cur } = await supabase
        .from("physical_risks")
        .select("probability, consequence")
        .eq("id", id)
        .single();
      if (cur) {
        patch.risk_score = calcScore(
          (rest.probability ?? cur.probability) as string,
          (rest.consequence ?? cur.consequence) as string
        );
      }
    }

    const { error } = await supabase
      .from("physical_risks")
      .update(patch)
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    logger.info("physical_risk.updated", { userId: user.id, id });
    return { success: true, data: { id } };
  } catch (e) {
    return toError(e);
  }
}

export async function deletePhysicalRisk(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { error } = await supabase
      .from("physical_risks")
      .delete()
      .eq("id", id);
    if (error) return { success: false, error: error.message };

    logger.info("physical_risk.deleted", { userId: user.id, id });
    return { success: true, data: { id } };
  } catch (e) {
    return toError(e);
  }
}
