"use server";

/**
 * CSRD / ESRS E1 metrics from live portfolio data (Fas 3).
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { z } from "zod";
import { uuidSchema } from "@/lib/validations/enums";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type CapexYear = {
  year: number;
  planCostSek: number;
  actionCostSek: number;
  totalSek: number;
  planCount: number;
};

export type CsrdMetrics = {
  year: number;
  scopeLabel: string;
  buildingCount: number;
  /** Summa total_energy_kwh */
  totalEnergyKwh: number;
  avgEnergyIntensity: number | null;
  /** Uppskattad tCO2e från ghg_intensity × a_temp (Scope 2-liknande om PE/el) */
  estimatedGhgTco2e: number | null;
  buildingsWithGhg: number;
  mepsCompliant: number;
  mepsAtRisk: number;
  mepsNonCompliant: number;
  mepsUnknown: number;
  financialRiskCount: number;
  climateYearBefore2035: number;
  openPhysicalRisks: number;
  /** CapEx-uppskattning från planer + öppna åtgärder */
  capexByYear: CapexYear[];
  totalTransitionCapexSek: number;
  draftPlanCount: number;
  approvedPlanCount: number;
  dataComplete: number;
  dataExtrapolated: number;
  dataIncomplete: number;
  coverageNote: string;
};

export async function getCsrdMetrics(opts?: {
  year?: number;
  propertyId?: string;
}): Promise<ActionResult<CsrdMetrics>> {
  try {
    const input = z
      .object({
        year: z.number().int().optional(),
        propertyId: uuidSchema.optional(),
      })
      .parse(opts ?? {});
    const year = input.year ?? new Date().getFullYear() - 1;
    const supabase = await createClient();
    await requireUser(supabase);

    let buildingIds: string[] | null = null;
    let scopeLabel = "Hela portföljen";
    if (input.propertyId) {
      const { data: prop } = await supabase
        .from("properties")
        .select("name")
        .eq("id", input.propertyId)
        .maybeSingle();
      scopeLabel = (prop?.name as string) ?? "Vald fastighet";
      const { data: buildings } = await supabase
        .from("buildings")
        .select("id")
        .eq("property_id", input.propertyId);
      buildingIds = (buildings ?? []).map((b) => b.id as string);
    }

    let piQ = supabase
      .from("performance_indicators")
      .select(
        "building_id, total_energy_kwh, energy_intensity, ghg_intensity, a_temp, meps_status, crrem_stranding_year, financial_risk_flag, data_gap_status"
      )
      .eq("year", year)
      .limit(500);
    if (buildingIds) {
      if (buildingIds.length === 0) {
        return {
          success: true,
          data: emptyMetrics(year, scopeLabel),
        };
      }
      piQ = piQ.in("building_id", buildingIds);
    }
    const { data: perf, error } = await piQ;
    if (error) return { success: false, error: error.message };
    const rows = perf ?? [];

    const totalEnergyKwh = rows.reduce(
      (s, r) => s + Number(r.total_energy_kwh ?? 0),
      0
    );
    const intensities = rows
      .map((r) => r.energy_intensity)
      .filter((v): v is number => v != null)
      .map(Number);
    const avgEnergyIntensity =
      intensities.length > 0
        ? intensities.reduce((a, b) => a + b, 0) / intensities.length
        : null;

    let ghgSumKg = 0;
    let buildingsWithGhg = 0;
    for (const r of rows) {
      const gi = r.ghg_intensity != null ? Number(r.ghg_intensity) : null;
      const area = r.a_temp != null ? Number(r.a_temp) : null;
      if (gi != null && area != null && area > 0) {
        ghgSumKg += gi * area;
        buildingsWithGhg += 1;
      }
    }
    const estimatedGhgTco2e =
      buildingsWithGhg > 0 ? ghgSumKg / 1000 : null;

    const mepsCompliant = rows.filter(
      (r) => r.meps_status === "compliant"
    ).length;
    const mepsAtRisk = rows.filter((r) => r.meps_status === "at_risk").length;
    const mepsNonCompliant = rows.filter(
      (r) => r.meps_status === "non_compliant"
    ).length;
    const mepsUnknown = rows.length - mepsCompliant - mepsAtRisk - mepsNonCompliant;

    const financialRiskCount = rows.filter((r) =>
      Boolean(r.financial_risk_flag)
    ).length;
    const climateYearBefore2035 = rows.filter(
      (r) =>
        r.crrem_stranding_year != null &&
        Number(r.crrem_stranding_year) < 2035
    ).length;

    // Physical risks
    let riskQ = supabase
      .from("physical_risks")
      .select("id, property_id, workflow_status")
      .in("workflow_status", ["open", "monitoring"])
      .limit(300);
    if (input.propertyId) riskQ = riskQ.eq("property_id", input.propertyId);
    const { data: risks } = await riskQ;
    const openPhysicalRisks = (risks ?? []).length;

    // CapEx from plans + actions
    let planQ = supabase
      .from("renovation_plans")
      .select("id, status, total_estimated_cost, property_id, building_id, updated_at")
      .limit(200);
    if (input.propertyId) planQ = planQ.eq("property_id", input.propertyId);
    const { data: plans } = await planQ;

    let actQ = supabase
      .from("actions")
      .select(
        "id, investment_cost, status, planned_year, building_id, buildings!inner(property_id)"
      )
      .in("status", ["proposed", "approved", "in_progress", "completed"])
      .limit(500);
    if (buildingIds && buildingIds.length > 0) {
      actQ = actQ.in("building_id", buildingIds);
    }
    const { data: acts } = await actQ;

    const capexMap = new Map<
      number,
      { plan: number; action: number; plans: number }
    >();

    for (const p of plans ?? []) {
      if (p.status === "completed") continue;
      const cost = Number(p.total_estimated_cost ?? 0);
      // attribute to update year or report year
      const py =
        p.updated_at != null
          ? new Date(p.updated_at as string).getFullYear()
          : year;
      const bucket = capexMap.get(py) ?? { plan: 0, action: 0, plans: 0 };
      bucket.plan += cost;
      bucket.plans += 1;
      capexMap.set(py, bucket);
    }

    for (const a of acts ?? []) {
      if (input.propertyId) {
        const b = a.buildings as unknown as { property_id: string } | null;
        if (b && b.property_id !== input.propertyId) continue;
      }
      const cost = Number(a.investment_cost ?? 0);
      const py = (a.planned_year as number | null) ?? year;
      const bucket = capexMap.get(py) ?? { plan: 0, action: 0, plans: 0 };
      bucket.action += cost;
      capexMap.set(py, bucket);
    }

    const capexByYear: CapexYear[] = [...capexMap.entries()]
      .map(([yr, v]) => ({
        year: yr,
        planCostSek: v.plan,
        actionCostSek: v.action,
        // Avoid double-count: prefer plan package as transition CapEx, actions as additional if not in plans
        totalSek: v.plan + v.action,
        planCount: v.plans,
      }))
      .sort((a, b) => a.year - b.year);

    // For total transition: open plans + open actions (may overlap – note in coverage)
    const totalTransitionCapexSek = capexByYear.reduce(
      (s, c) => s + c.totalSek,
      0
    );

    const draftPlanCount = (plans ?? []).filter(
      (p) => p.status === "draft"
    ).length;
    const approvedPlanCount = (plans ?? []).filter(
      (p) => p.status === "approved" || p.status === "in_progress"
    ).length;

    const dataComplete = rows.filter(
      (r) => r.data_gap_status === "COMPLETE"
    ).length;
    const dataExtrapolated = rows.filter(
      (r) => r.data_gap_status === "EXTRAPOLATED_WARNING"
    ).length;
    const dataIncomplete = rows.filter(
      (r) => r.data_gap_status === "INCOMPLETE_DATA"
    ).length;

    const coverageNote =
      buildingsWithGhg < rows.length
        ? `GHG beräknad för ${buildingsWithGhg}/${rows.length} byggnader (kräver ghg-intensitet och Atemp). CapEx summerar plan- och åtgärdskostnader och kan överlappa.`
        : "CapEx summerar plan- och åtgärdskostnader och kan överlappa om samma åtgärd ingår i plan.";

    return {
      success: true,
      data: {
        year,
        scopeLabel,
        buildingCount: rows.length,
        totalEnergyKwh,
        avgEnergyIntensity,
        estimatedGhgTco2e,
        buildingsWithGhg,
        mepsCompliant,
        mepsAtRisk,
        mepsNonCompliant,
        mepsUnknown,
        financialRiskCount,
        climateYearBefore2035,
        openPhysicalRisks,
        capexByYear,
        totalTransitionCapexSek,
        draftPlanCount,
        approvedPlanCount,
        dataComplete,
        dataExtrapolated,
        dataIncomplete,
        coverageNote,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN",
    };
  }
}

function emptyMetrics(year: number, scopeLabel: string): CsrdMetrics {
  return {
    year,
    scopeLabel,
    buildingCount: 0,
    totalEnergyKwh: 0,
    avgEnergyIntensity: null,
    estimatedGhgTco2e: null,
    buildingsWithGhg: 0,
    mepsCompliant: 0,
    mepsAtRisk: 0,
    mepsNonCompliant: 0,
    mepsUnknown: 0,
    financialRiskCount: 0,
    climateYearBefore2035: 0,
    openPhysicalRisks: 0,
    capexByYear: [],
    totalTransitionCapexSek: 0,
    draftPlanCount: 0,
    approvedPlanCount: 0,
    dataComplete: 0,
    dataExtrapolated: 0,
    dataIncomplete: 0,
    coverageNote: "Ingen prestanda i urvalet.",
  };
}
