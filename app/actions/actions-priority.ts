"use server";

/**
 * List portfolio actions + recalculate priority_score (Fas 5).
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import {
  computePriorityScore,
  estimateActionImpact,
  parsePriorityWeights,
  DEFAULT_PRIORITY_WEIGHTS,
  type PriorityWeights,
} from "@/lib/priority";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export type PortfolioActionRow = {
  id: string;
  building_id: string;
  building_name: string;
  property_name: string;
  title: string;
  category: string;
  status: string;
  source: string;
  estimated_saving_kwh: number | null;
  estimated_saving_co2: number | null;
  investment_cost: number | null;
  currency: string;
  payback_years: number | null;
  priority_score: number | null;
  planned_year: number | null;
  // Context from latest performance
  meps_2030_gap: number | null;
  crrem_stranding_year: number | null;
  energy_intensity: number | null;
  a_temp: number | null;
  year: number | null;
  // Estimated impact
  intensity_reduction: number | null;
  meps_gap_after: number | null;
  stranding_year_after: number | null;
  // Applied effect (action_applications)
  applied_baseline_meps: number | null;
  applied_result_meps: number | null;
  applied_baseline_stranding: number | null;
  applied_result_stranding: number | null;
  application_id: string | null;
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

async function loadWeights(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<PriorityWeights> {
  const { data } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", "priority_weights")
    .maybeSingle();
  return data?.value
    ? parsePriorityWeights(data.value)
    : { ...DEFAULT_PRIORITY_WEIGHTS };
}

export async function listPortfolioActions(opts?: {
  status?: string | null;
  year?: number | null;
}): Promise<ActionResult<{ rows: PortfolioActionRow[]; weights: PriorityWeights }>> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    const weights = await loadWeights(supabase);
    const year = opts?.year ?? new Date().getFullYear() - 1;

    let q = supabase
      .from("actions")
      .select(
        `
        id, building_id, title, category, status, source,
        estimated_saving_kwh, estimated_saving_co2,
        investment_cost, currency, payback_years,
        priority_score, planned_year,
        buildings!inner (
          id, name,
          properties!inner ( name )
        )
      `
      )
      .order("priority_score", { ascending: false, nullsFirst: false })
      .limit(500);

    if (opts?.status && opts.status !== "all") {
      q = q.eq(
        "status",
        opts.status as
          | "proposed"
          | "approved"
          | "in_progress"
          | "completed"
          | "cancelled"
      );
    }

    const { data: actions, error } = await q;
    if (error) return { success: false, error: error.message };

    const buildingIds = [
      ...new Set((actions ?? []).map((a) => a.building_id as string)),
    ];

    const piByBuilding = new Map<
      string,
      {
        meps_2030_gap: number | null;
        crrem_stranding_year: number | null;
        energy_intensity: number | null;
        a_temp: number | null;
        year: number;
        total_energy_kwh: number | null;
        ghg_intensity: number | null;
      }
    >();

    if (buildingIds.length > 0) {
      const { data: pis } = await supabase
        .from("performance_indicators")
        .select(
          "building_id, meps_2030_gap, crrem_stranding_year, energy_intensity, a_temp, year, total_energy_kwh, ghg_intensity"
        )
        .in("building_id", buildingIds)
        .eq("year", year);

      for (const pi of pis ?? []) {
        piByBuilding.set(pi.building_id as string, {
          meps_2030_gap: pi.meps_2030_gap as number | null,
          crrem_stranding_year: pi.crrem_stranding_year as number | null,
          energy_intensity: pi.energy_intensity as number | null,
          a_temp: pi.a_temp as number | null,
          year: pi.year as number,
          total_energy_kwh: pi.total_energy_kwh as number | null,
          ghg_intensity: pi.ghg_intensity as number | null,
        });
      }

      // Fallback: latest year if missing for selected year
      const missing = buildingIds.filter((id) => !piByBuilding.has(id));
      if (missing.length > 0) {
        const { data: latest } = await supabase
          .from("performance_indicators")
          .select(
            "building_id, meps_2030_gap, crrem_stranding_year, energy_intensity, a_temp, year, total_energy_kwh, ghg_intensity"
          )
          .in("building_id", missing)
          .order("year", { ascending: false });

        for (const pi of latest ?? []) {
          const bid = pi.building_id as string;
          if (!piByBuilding.has(bid)) {
            piByBuilding.set(bid, {
              meps_2030_gap: pi.meps_2030_gap as number | null,
              crrem_stranding_year: pi.crrem_stranding_year as number | null,
              energy_intensity: pi.energy_intensity as number | null,
              a_temp: pi.a_temp as number | null,
              year: pi.year as number,
              total_energy_kwh: pi.total_energy_kwh as number | null,
              ghg_intensity: pi.ghg_intensity as number | null,
            });
          }
        }
      }
    }

    // Load applied applications for completed actions
    const actionIds = (actions ?? []).map((a) => a.id as string);
    const appByAction = new Map<
      string,
      {
        id: string;
        baseline_meps_2030_gap: number | null;
        result_meps_2030_gap: number | null;
        baseline_stranding_year: number | null;
        result_stranding_year: number | null;
      }
    >();
    if (actionIds.length > 0) {
      const { data: apps } = await supabase
        .from("action_applications")
        .select(
          "id, action_id, baseline_meps_2030_gap, result_meps_2030_gap, baseline_stranding_year, result_stranding_year, status"
        )
        .in("action_id", actionIds)
        .eq("status", "applied");
      for (const ap of apps ?? []) {
        appByAction.set(ap.action_id as string, {
          id: ap.id as string,
          baseline_meps_2030_gap: ap.baseline_meps_2030_gap as number | null,
          result_meps_2030_gap: ap.result_meps_2030_gap as number | null,
          baseline_stranding_year: ap.baseline_stranding_year as number | null,
          result_stranding_year: ap.result_stranding_year as number | null,
        });
      }
    }

    const rows: PortfolioActionRow[] = (actions ?? []).map((a) => {
      const b = a.buildings as unknown as {
        name: string;
        properties: { name: string } | { name: string }[];
      } | null;
      const prop = Array.isArray(b?.properties)
        ? b?.properties[0]
        : b?.properties;
      const pi = piByBuilding.get(a.building_id as string);
      const impact = estimateActionImpact({
        mepsGap: pi?.meps_2030_gap,
        strandingYear: pi?.crrem_stranding_year,
        estimatedSavingKwh: a.estimated_saving_kwh as number | null,
        aTemp: pi?.a_temp,
        ghgIntensity: pi?.ghg_intensity,
        totalEnergyKwh: pi?.total_energy_kwh,
      });
      const app = appByAction.get(a.id as string);

      return {
        id: a.id as string,
        building_id: a.building_id as string,
        building_name: b?.name ?? "—",
        property_name: prop?.name ?? "—",
        title: a.title as string,
        category: a.category as string,
        status: a.status as string,
        source: (a.source as string) ?? "manual",
        estimated_saving_kwh: a.estimated_saving_kwh as number | null,
        estimated_saving_co2: a.estimated_saving_co2 as number | null,
        investment_cost: a.investment_cost as number | null,
        currency: (a.currency as string) ?? "SEK",
        payback_years: a.payback_years as number | null,
        priority_score: a.priority_score as number | null,
        planned_year: a.planned_year as number | null,
        meps_2030_gap: pi?.meps_2030_gap ?? null,
        crrem_stranding_year: pi?.crrem_stranding_year ?? null,
        energy_intensity: pi?.energy_intensity ?? null,
        a_temp: pi?.a_temp ?? null,
        year: pi?.year ?? null,
        intensity_reduction: impact.intensityReduction,
        meps_gap_after: impact.mepsGapAfter,
        stranding_year_after: impact.strandingYearAfter,
        applied_baseline_meps: app?.baseline_meps_2030_gap ?? null,
        applied_result_meps: app?.result_meps_2030_gap ?? null,
        applied_baseline_stranding: app?.baseline_stranding_year ?? null,
        applied_result_stranding: app?.result_stranding_year ?? null,
        application_id: app?.id ?? null,
      };
    });

    // Client-side sort by score desc for display consistency
    rows.sort(
      (x, y) => (y.priority_score ?? -1) - (x.priority_score ?? -1)
    );

    return { success: true, data: { rows, weights } };
  } catch (e) {
    return toError(e);
  }
}

/**
 * Räkna om priority_score för alla (eller en) åtgärder utifrån
 * aktuell prestanda + konfigurerade vikter.
 */
export async function recalculateActionPriorities(opts?: {
  buildingId?: string;
  year?: number;
}): Promise<
  ActionResult<{ updated: number; weights: PriorityWeights }>
> {
  try {
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const weights = await loadWeights(supabase);
    const year = opts?.year ?? new Date().getFullYear() - 1;

    let aq = supabase
      .from("actions")
      .select(
        "id, building_id, payback_years, estimated_saving_kwh, status"
      )
      .neq("status", "cancelled");

    if (opts?.buildingId) {
      aq = aq.eq("building_id", opts.buildingId);
    }

    const { data: actions, error } = await aq;
    if (error) return { success: false, error: error.message };

    const buildingIds = [
      ...new Set((actions ?? []).map((a) => a.building_id as string)),
    ];

    const piByBuilding = new Map<
      string,
      { meps_2030_gap: number | null; crrem_stranding_year: number | null }
    >();

    if (buildingIds.length > 0) {
      const { data: pis } = await supabase
        .from("performance_indicators")
        .select("building_id, meps_2030_gap, crrem_stranding_year, year")
        .in("building_id", buildingIds)
        .order("year", { ascending: false });

      for (const pi of pis ?? []) {
        const bid = pi.building_id as string;
        // Prefer selected year, else first (latest) seen
        if (!piByBuilding.has(bid) || pi.year === year) {
          piByBuilding.set(bid, {
            meps_2030_gap: pi.meps_2030_gap as number | null,
            crrem_stranding_year: pi.crrem_stranding_year as number | null,
          });
        }
      }
    }

    let updated = 0;
    for (const a of actions ?? []) {
      const pi = piByBuilding.get(a.building_id as string);
      const { score } = computePriorityScore({
        mepsGap: pi?.meps_2030_gap,
        strandingYear: pi?.crrem_stranding_year,
        paybackYears: a.payback_years as number | null,
        weights,
      });

      const { error: uErr } = await supabase
        .from("actions")
        .update({ priority_score: score })
        .eq("id", a.id as string);

      if (!uErr) updated += 1;
    }

    logger.info("actions.priority.recalculated", {
      userId: user.id,
      updated,
      weights,
    });

    return { success: true, data: { updated, weights } };
  } catch (e) {
    return toError(e);
  }
}
