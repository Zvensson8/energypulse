"use server";

/**
 * Riskdetalj + sparande av plananteckning + regelbaserad generering av åtgärder.
 * Ingen extern AI-API krävs (kan pluggas in senare).
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import { z } from "zod";
import { uuidSchema } from "@/lib/validations/enums";
import {
  templatesForCompliance,
  templatesForPhysical,
  buildPlanNarrative,
  type SuggestedAction,
} from "@/lib/risk/response-templates";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export type RiskDetail = {
  kind: "physical" | "compliance";
  id: string;
  title: string;
  property_id: string | null;
  property_name: string;
  municipality: string | null;
  building_id: string | null;
  building_name: string | null;
  buildings: Array<{ id: string; name: string }>;
  risk_type_or_kind: string;
  score: number | null;
  probability: string | null;
  consequence: string | null;
  year: number | null;
  metric_value: number | null;
  workflow_status: string;
  status_reason: string | null;
  notes: string | null;
  source: string | null;
  assessed_at: string | null;
  grades_hint: string | null;
};

function toError(e: unknown): ActionResult<never> {
  const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
  if (message === "UNAUTHORIZED")
    return { success: false, error: "Inloggning krävs", code: "UNAUTHORIZED" };
  if (message === "FORBIDDEN" || message.startsWith("FORBIDDEN_ROLE"))
    return { success: false, error: "Otillräcklig behörighet", code: "FORBIDDEN" };
  return { success: false, error: message, code: "ERROR" };
}

const RISK_SV: Record<string, string> = {
  flood: "Översvämning",
  heat: "Värme",
  storm: "Storm",
  subsidence: "Sättning",
  wildfire: "Skogsbrand",
  other: "Övrigt",
  meps_2030: "Kravgap 2030 (MEPS)",
  meps_2033: "Kravgap 2033 (MEPS)",
  crrem_stranding: "Klimatriskår (CRREM)",
};

export async function getRiskDetail(raw: {
  kind: "physical" | "compliance";
  risk_id: string;
}): Promise<ActionResult<RiskDetail>> {
  try {
    const input = z
      .object({
        kind: z.enum(["physical", "compliance"]),
        risk_id: uuidSchema,
      })
      .parse(raw);
    const supabase = await createClient();
    await requireUser(supabase);

    if (input.kind === "physical") {
      const { data: r, error } = await supabase
        .from("physical_risks")
        .select(
          `
          id, property_id, risk_type, probability, consequence, risk_score,
          source, assessed_at, notes, workflow_status, status_reason,
          properties!inner ( name, municipality )
        `
        )
        .eq("id", input.risk_id)
        .maybeSingle();
      if (error || !r)
        return { success: false, error: error?.message ?? "Risk saknas" };

      const prop = r.properties as unknown as {
        name: string;
        municipality: string | null;
      } | null;

      const { data: buildings } = await supabase
        .from("buildings")
        .select("id, name")
        .eq("property_id", r.property_id as string)
        .order("name");

      return {
        success: true,
        data: {
          kind: "physical",
          id: r.id as string,
          title: RISK_SV[r.risk_type as string] ?? (r.risk_type as string),
          property_id: r.property_id as string,
          property_name: prop?.name ?? "—",
          municipality: prop?.municipality ?? null,
          building_id: null,
          building_name: null,
          buildings: (buildings ?? []).map((b) => ({
            id: b.id as string,
            name: b.name as string,
          })),
          risk_type_or_kind: r.risk_type as string,
          score: r.risk_score != null ? Number(r.risk_score) : null,
          probability: r.probability as string,
          consequence: r.consequence as string,
          year: null,
          metric_value: null,
          workflow_status: (r.workflow_status as string) ?? "open",
          status_reason: r.status_reason as string | null,
          notes: r.notes as string | null,
          source: r.source as string | null,
          assessed_at: r.assessed_at as string | null,
          grades_hint:
            "Fysisk klimatrisk kopplas till fastigheten. Åtgärder skapas på husen under fastigheten.",
        },
      };
    }

    const { data: r, error } = await supabase
      .from("compliance_risks")
      .select(
        `
        id, building_id, year, risk_kind, metric_value, severity,
        workflow_status, status_reason, notes,
        buildings!inner ( id, name, property_id, properties!inner ( id, name, municipality ) )
      `
      )
      .eq("id", input.risk_id)
      .maybeSingle();
    if (error || !r)
      return { success: false, error: error?.message ?? "Risk saknas" };

    const b = r.buildings as unknown as {
      id: string;
      name: string;
      property_id: string;
      properties:
        | { id: string; name: string; municipality: string | null }
        | { id: string; name: string; municipality: string | null }[]
        | null;
    };
    const prop = Array.isArray(b.properties) ? b.properties[0] : b.properties;

    // Latest grades for context
    const { data: pi } = await supabase
      .from("performance_indicators")
      .select(
        "energy_class, meps_2030_gap, meps_status, crrem_stranding_year, combined_risk_score, energy_intensity"
      )
      .eq("building_id", r.building_id as string)
      .eq("year", r.year as number)
      .maybeSingle();

    const grades_hint = pi
      ? `Nuläge: klass ${pi.energy_class ?? "—"}, gap 2030 ${pi.meps_2030_gap ?? "—"} kWh/m², klimatriskår ${pi.crrem_stranding_year ?? "—"}, samlad risk ${pi.combined_risk_score ?? "—"}.`
      : "Ingen prestanda för året – importera data för bättre underlag.";

    return {
      success: true,
      data: {
        kind: "compliance",
        id: r.id as string,
        title: RISK_SV[r.risk_kind as string] ?? (r.risk_kind as string),
        property_id: prop?.id ?? b.property_id ?? null,
        property_name: prop?.name ?? "—",
        municipality: prop?.municipality ?? null,
        building_id: r.building_id as string,
        building_name: b.name,
        buildings: [{ id: b.id, name: b.name }],
        risk_type_or_kind: r.risk_kind as string,
        score: r.severity != null ? Number(r.severity) : null,
        probability: null,
        consequence: null,
        year: r.year as number,
        metric_value: r.metric_value != null ? Number(r.metric_value) : null,
        workflow_status: r.workflow_status as string,
        status_reason: r.status_reason as string | null,
        notes: r.notes as string | null,
        source: null,
        assessed_at: null,
        grades_hint,
      },
    };
  } catch (e) {
    return toError(e);
  }
}

export async function saveRiskNotes(raw: {
  kind: "physical" | "compliance";
  risk_id: string;
  notes: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const input = z
      .object({
        kind: z.enum(["physical", "compliance"]),
        risk_id: uuidSchema,
        notes: z.string().max(8000),
      })
      .parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const table =
      input.kind === "physical" ? "physical_risks" : "compliance_risks";
    const { error } = await supabase
      .from(table)
      .update({ notes: input.notes.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", input.risk_id);
    if (error) return { success: false, error: error.message };

    logger.info("risk.notes_saved", {
      userId: user.id,
      riskId: input.risk_id,
      kind: input.kind,
    });
    return { success: true, data: { id: input.risk_id } };
  } catch (e) {
    return toError(e);
  }
}

/**
 * Generera föreslagna åtgärder (regelbaserat) och spara plantext på risken.
 * Skapar proposed actions på berörda byggnader.
 */
export async function generateRiskMitigationPlan(raw: {
  kind: "physical" | "compliance";
  risk_id: string;
  create_actions?: boolean;
}): Promise<
  ActionResult<{
    narrative: string;
    suggestions: SuggestedAction[];
    created_action_ids: string[];
    building_ids: string[];
    property_id: string | null;
  }>
> {
  try {
    const input = z
      .object({
        kind: z.enum(["physical", "compliance"]),
        risk_id: uuidSchema,
        create_actions: z.boolean().optional(),
      })
      .parse(raw);

    const detailRes = await getRiskDetail({
      kind: input.kind,
      risk_id: input.risk_id,
    });
    if (!detailRes.success) return detailRes;
    const d = detailRes.data;

    const suggestions =
      input.kind === "physical"
        ? templatesForPhysical(d.risk_type_or_kind)
        : templatesForCompliance(d.risk_type_or_kind);

    const narrative = buildPlanNarrative({
      riskLabel: d.title,
      propertyName: d.property_name,
      buildingNames: d.buildings.map((b) => b.name),
      suggestions,
    });

    // Append to notes (don't wipe user text – put generated block after)
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const existing = (d.notes ?? "").trim();
    const block = `\n\n--- Genererad plan (${new Date().toISOString().slice(0, 10)}) ---\n${narrative}`;
    const notes = (existing + block).slice(0, 8000);

    const table =
      input.kind === "physical" ? "physical_risks" : "compliance_risks";
    await supabase
      .from(table)
      .update({ notes, updated_at: new Date().toISOString() })
      .eq("id", input.risk_id);

    const created_action_ids: string[] = [];
    const building_ids = d.buildings.map((b) => b.id);
    const create = input.create_actions !== false;

    if (create && building_ids.length > 0) {
      for (const bid of building_ids) {
        for (const s of suggestions) {
          const { data: act, error } = await supabase
            .from("actions")
            .insert({
              building_id: bid,
              title: s.title,
              category: s.category,
              status: "proposed",
              source: "mitigation_plan",
              description: `${s.description}\n\nKopplad till risk: ${d.title} (${d.property_name}).`,
              estimated_saving_kwh: s.estimated_saving_kwh,
              investment_cost: s.investment_cost,
              payback_years: s.payback_years,
              currency: "SEK",
            })
            .select("id")
            .single();
          if (!error && act?.id) created_action_ids.push(act.id as string);
        }
      }
    }

    logger.info("risk.plan_generated", {
      userId: user.id,
      riskId: input.risk_id,
      kind: input.kind,
      actions: created_action_ids.length,
    });

    return {
      success: true,
      data: {
        narrative,
        suggestions,
        created_action_ids,
        building_ids,
        property_id: d.property_id,
      },
    };
  } catch (e) {
    return toError(e);
  }
}
