"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { z } from "zod";
import { uuidSchema } from "@/lib/validations/enums";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export type ScorecardAction = {
  id: string;
  title: string;
  category: string;
  status: string;
  estimated_saving_kwh: number | null;
  investment_cost: number | null;
  payback_years: number | null;
  priority_score: number | null;
};

export type BuildingScorecard = {
  building: {
    id: string;
    name: string;
    construction_year: number | null;
    primary_use: string | null;
    protected_status: boolean;
  };
  property: {
    id: string;
    name: string;
    municipality: string | null;
  };
  year: number;
  grades: {
    energy_class: string | null;
    energy_intensity: number | null;
    meps_2030_gap: number | null;
    meps_status: string | null;
    crrem_stranding_year: number | null;
    financial_risk_flag: boolean;
    combined_score: number | null;
    meps_score: number | null;
    crrem_score: number | null;
    physical_score: number | null;
    data_quality_score: number | null;
    data_gap_status: string | null;
    data_completeness_percent: number | null;
  };
  top_actions: ScorecardAction[];
  open_plan: {
    id: string;
    title: string;
    status: string;
    total_estimated_cost: number | null;
    baseline_combined_score: number | null;
    projected_combined_score: number | null;
    scenario_key: string | null;
  } | null;
};

function toError(e: unknown): ActionResult<never> {
  const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
  if (message === "UNAUTHORIZED")
    return { success: false, error: "Inloggning krävs", code: "UNAUTHORIZED" };
  return { success: false, error: message, code: "ERROR" };
}

export async function getBuildingScorecard(raw: {
  building_id: string;
  year?: number;
}): Promise<ActionResult<BuildingScorecard>> {
  try {
    const input = z
      .object({
        building_id: uuidSchema,
        year: z.number().int().optional(),
      })
      .parse(raw);

    const supabase = await createClient();
    await requireUser(supabase);

    const { data: building, error: bErr } = await supabase
      .from("buildings")
      .select(
        "id, name, construction_year, primary_use, protected_status, property_id, properties(id, name, municipality)"
      )
      .eq("id", input.building_id)
      .maybeSingle();

    if (bErr || !building) {
      return { success: false, error: bErr?.message ?? "Byggnad hittades inte" };
    }

    const propRaw = building.properties as
      | { id: string; name: string; municipality: string | null }
      | { id: string; name: string; municipality: string | null }[]
      | null;
    const prop = Array.isArray(propRaw) ? propRaw[0] : propRaw;

    let year = input.year ?? new Date().getFullYear() - 1;

    let { data: pi } = await supabase
      .from("performance_indicators")
      .select(
        `energy_class, energy_intensity, meps_2030_gap, meps_status,
         crrem_stranding_year, crrem_misalignment_year, financial_risk_flag,
         combined_risk_score, data_gap_status, data_completeness_percent, year`
      )
      .eq("building_id", input.building_id)
      .eq("year", year)
      .maybeSingle();

    if (!pi) {
      const { data: latest } = await supabase
        .from("performance_indicators")
        .select(
          `energy_class, energy_intensity, meps_2030_gap, meps_status,
           crrem_stranding_year, crrem_misalignment_year, financial_risk_flag,
           combined_risk_score, data_gap_status, data_completeness_percent, year`
        )
        .eq("building_id", input.building_id)
        .order("year", { ascending: false })
        .limit(1)
        .maybeSingle();
      pi = latest;
      if (latest?.year) year = latest.year as number;
    }

    const { data: risk } = await supabase
      .from("risk_scores")
      .select(
        "combined_score, meps_score, crrem_score, physical_score, data_quality_score"
      )
      .eq("building_id", input.building_id)
      .eq("year", year)
      .maybeSingle();

    const { data: acts } = await supabase
      .from("actions")
      .select(
        "id, title, category, status, estimated_saving_kwh, investment_cost, payback_years, priority_score"
      )
      .eq("building_id", input.building_id)
      .in("status", ["proposed", "approved", "in_progress"])
      .order("priority_score", { ascending: false, nullsFirst: false })
      .limit(8);

    const { data: plans } = await supabase
      .from("renovation_plans")
      .select(
        "id, title, status, total_estimated_cost, baseline_combined_score, projected_combined_score, scenario_key"
      )
      .eq("building_id", input.building_id)
      .in("status", ["draft", "approved", "in_progress"])
      .order("updated_at", { ascending: false })
      .limit(1);

    const plan = plans?.[0] ?? null;

    const stranding =
      (pi?.crrem_misalignment_year as number | null) ??
      (pi?.crrem_stranding_year as number | null);

    return {
      success: true,
      data: {
        building: {
          id: building.id as string,
          name: building.name as string,
          construction_year: building.construction_year as number | null,
          primary_use: building.primary_use as string | null,
          protected_status: Boolean(building.protected_status),
        },
        property: {
          id: (prop?.id as string) ?? (building.property_id as string),
          name: (prop?.name as string) ?? "—",
          municipality: (prop?.municipality as string | null) ?? null,
        },
        year,
        grades: {
          energy_class: (pi?.energy_class as string | null) ?? null,
          energy_intensity: pi?.energy_intensity != null ? Number(pi.energy_intensity) : null,
          meps_2030_gap: pi?.meps_2030_gap != null ? Number(pi.meps_2030_gap) : null,
          meps_status: (pi?.meps_status as string | null) ?? null,
          crrem_stranding_year: stranding,
          financial_risk_flag: Boolean(pi?.financial_risk_flag),
          combined_score:
            risk?.combined_score != null
              ? Number(risk.combined_score)
              : pi?.combined_risk_score != null
                ? Number(pi.combined_risk_score)
                : null,
          meps_score: risk?.meps_score != null ? Number(risk.meps_score) : null,
          crrem_score: risk?.crrem_score != null ? Number(risk.crrem_score) : null,
          physical_score:
            risk?.physical_score != null ? Number(risk.physical_score) : null,
          data_quality_score:
            risk?.data_quality_score != null
              ? Number(risk.data_quality_score)
              : null,
          data_gap_status: (pi?.data_gap_status as string | null) ?? null,
          data_completeness_percent:
            pi?.data_completeness_percent != null
              ? Number(pi.data_completeness_percent)
              : null,
        },
        top_actions: (acts ?? []).map((a) => ({
          id: a.id as string,
          title: a.title as string,
          category: a.category as string,
          status: a.status as string,
          estimated_saving_kwh:
            a.estimated_saving_kwh != null
              ? Number(a.estimated_saving_kwh)
              : null,
          investment_cost:
            a.investment_cost != null ? Number(a.investment_cost) : null,
          payback_years:
            a.payback_years != null ? Number(a.payback_years) : null,
          priority_score:
            a.priority_score != null ? Number(a.priority_score) : null,
        })),
        open_plan: plan
          ? {
              id: plan.id as string,
              title: plan.title as string,
              status: plan.status as string,
              total_estimated_cost:
                plan.total_estimated_cost != null
                  ? Number(plan.total_estimated_cost)
                  : null,
              baseline_combined_score:
                plan.baseline_combined_score != null
                  ? Number(plan.baseline_combined_score)
                  : null,
              projected_combined_score:
                plan.projected_combined_score != null
                  ? Number(plan.projected_combined_score)
                  : null,
              scenario_key: (plan.scenario_key as string | null) ?? null,
            }
          : null,
      },
    };
  } catch (e) {
    return toError(e);
  }
}
