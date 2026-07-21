"use server";

/**
 * Portfolio dashboard aggregates from performance_indicators + actions.
 * All queries hit live Supabase (RLS applies).
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import type {
  DataGapStatus,
  EnergyClass,
} from "@/lib/supabase/database.types";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface DashboardKpis {
  totalEnergyKwh: number;
  avgEnergyIntensity: number | null;
  mepsRiskCount: number;
  strandedCount: number;
  investmentNeedSek: number;
  estimatedSavingKwh: number;
  avgDataCompleteness: number | null;
  buildingCount: number;
  incompleteCount: number;
  extrapolatedCount: number;
  completeCount: number;
  year: number;
}

export interface HeatmapCell {
  building_id: string;
  building_name: string;
  property_id: string | null;
  property_name: string;
  municipality: string | null;
  energy_class: EnergyClass | null;
  data_gap_status: DataGapStatus;
  data_completeness_percent: number;
  meps_2030_gap: number | null;
  crrem_stranding_year: number | null;
  energy_intensity: number | null;
  risk_score: number;
}

export interface TopRiskRow {
  building_id: string;
  building_name: string;
  property_name: string;
  year: number;
  energy_class: EnergyClass | null;
  data_gap_status: DataGapStatus;
  data_completeness_percent: number;
  meps_2030_gap: number | null;
  meps_2033_gap: number | null;
  crrem_stranding_year: number | null;
  energy_intensity: number | null;
  ghg_intensity: number | null;
}

function riskScore(row: {
  meps_2030_gap: number | null;
  crrem_stranding_year: number | null;
  data_gap_status: DataGapStatus;
  energy_intensity: number | null;
}): number {
  let score = 0;
  if (row.meps_2030_gap != null && row.meps_2030_gap > 0) {
    score += Math.min(0.45, row.meps_2030_gap / 200);
  }
  if (row.crrem_stranding_year != null) {
    const yearsLeft = row.crrem_stranding_year - new Date().getFullYear();
    if (yearsLeft <= 0) score += 0.4;
    else if (yearsLeft <= 5) score += 0.3;
    else if (yearsLeft <= 10) score += 0.15;
  }
  if (row.data_gap_status === "INCOMPLETE_DATA") score += 0.2;
  else if (row.data_gap_status === "EXTRAPOLATED_WARNING") score += 0.08;
  return Math.min(1, score);
}

export async function getDashboardKpis(
  year?: number
): Promise<ActionResult<DashboardKpis>> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    const targetYear = year ?? new Date().getFullYear() - 1;

    const { data: perf, error } = await supabase
      .from("performance_indicators")
      .select(
        "building_id, year, total_energy_kwh, energy_intensity, meps_2030_gap, crrem_stranding_year, data_gap_status, data_completeness_percent"
      )
      .eq("year", targetYear);

    if (error) {
      return { success: false, error: error.message };
    }

    const rows = perf ?? [];
    const buildingIds = [...new Set(rows.map((r) => r.building_id))];

    let investmentNeedSek = 0;
    let estimatedSavingKwh = 0;
    if (buildingIds.length > 0) {
      const { data: acts } = await supabase
        .from("actions")
        .select("building_id, investment_cost, estimated_saving_kwh, status")
        .in("building_id", buildingIds)
        .in("status", ["proposed", "approved", "in_progress"]);

      for (const a of acts ?? []) {
        investmentNeedSek += Number(a.investment_cost ?? 0);
        estimatedSavingKwh += Number(a.estimated_saving_kwh ?? 0);
      }
    }

    const totalEnergyKwh = rows.reduce(
      (s, r) => s + Number(r.total_energy_kwh ?? 0),
      0
    );
    const intensities = rows
      .map((r) => r.energy_intensity)
      .filter((v): v is number => v != null);
    const avgEnergyIntensity =
      intensities.length > 0
        ? intensities.reduce((a, b) => a + Number(b), 0) / intensities.length
        : null;

    const completeness = rows
      .map((r) => r.data_completeness_percent)
      .filter((v): v is number => v != null);
    const avgDataCompleteness =
      completeness.length > 0
        ? completeness.reduce((a, b) => a + Number(b), 0) / completeness.length
        : null;

    const mepsRiskCount = rows.filter(
      (r) => r.meps_2030_gap != null && Number(r.meps_2030_gap) > 0
    ).length;

    const strandedCount = rows.filter(
      (r) =>
        r.crrem_stranding_year != null &&
        Number(r.crrem_stranding_year) <= new Date().getFullYear() + 10
    ).length;

    const completeCount = rows.filter(
      (r) => r.data_gap_status === "COMPLETE"
    ).length;
    const extrapolatedCount = rows.filter(
      (r) => r.data_gap_status === "EXTRAPOLATED_WARNING"
    ).length;
    const incompleteCount = rows.filter(
      (r) => r.data_gap_status === "INCOMPLETE_DATA"
    ).length;

    return {
      success: true,
      data: {
        totalEnergyKwh,
        avgEnergyIntensity,
        mepsRiskCount,
        strandedCount,
        investmentNeedSek,
        estimatedSavingKwh,
        avgDataCompleteness,
        buildingCount: rows.length,
        incompleteCount,
        extrapolatedCount,
        completeCount,
        year: targetYear,
      },
    };
  } catch (e) {
    logger.error("dashboard.kpis.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN",
    };
  }
}

export async function getRiskHeatmap(
  year?: number
): Promise<ActionResult<HeatmapCell[]>> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);
    const targetYear = year ?? new Date().getFullYear() - 1;

    const { data: perf, error } = await supabase
      .from("performance_indicators")
      .select(
        "building_id, energy_class, data_gap_status, data_completeness_percent, meps_2030_gap, crrem_stranding_year, energy_intensity"
      )
      .eq("year", targetYear)
      .limit(500);

    if (error) return { success: false, error: error.message };

    const buildingIds = [...new Set((perf ?? []).map((p) => p.building_id))];
    if (buildingIds.length === 0) return { success: true, data: [] };

    const { data: buildings } = await supabase
      .from("buildings")
      .select("id, name, property_id")
      .in("id", buildingIds);

    const propertyIds = [
      ...new Set((buildings ?? []).map((b) => b.property_id)),
    ];
    const { data: properties } = await supabase
      .from("properties")
      .select("id, name, municipality")
      .in("id", propertyIds);

    const bMap = new Map((buildings ?? []).map((b) => [b.id, b]));
    const pMap = new Map((properties ?? []).map((p) => [p.id, p]));

    const cells: HeatmapCell[] = (perf ?? []).map((row) => {
      const b = bMap.get(row.building_id);
      const p = b ? pMap.get(b.property_id) : undefined;
      return {
        building_id: row.building_id,
        building_name: b?.name ?? row.building_id.slice(0, 8),
        property_id: b?.property_id ?? null,
        property_name: p?.name ?? "—",
        municipality: p?.municipality ?? null,
        energy_class: row.energy_class,
        data_gap_status: row.data_gap_status,
        data_completeness_percent: Number(row.data_completeness_percent ?? 0),
        meps_2030_gap:
          row.meps_2030_gap != null ? Number(row.meps_2030_gap) : null,
        crrem_stranding_year: row.crrem_stranding_year,
        energy_intensity:
          row.energy_intensity != null ? Number(row.energy_intensity) : null,
        risk_score: riskScore({
          meps_2030_gap:
            row.meps_2030_gap != null ? Number(row.meps_2030_gap) : null,
          crrem_stranding_year: row.crrem_stranding_year,
          data_gap_status: row.data_gap_status,
          energy_intensity:
            row.energy_intensity != null ? Number(row.energy_intensity) : null,
        }),
      };
    });

    cells.sort((a, b) => b.risk_score - a.risk_score);
    return { success: true, data: cells };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN",
    };
  }
}

export async function getTopRiskLists(
  year?: number,
  limit = 10
): Promise<
  ActionResult<{ stranded: TopRiskRow[]; mepsGap: TopRiskRow[] }>
> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);
    const targetYear = year ?? new Date().getFullYear() - 1;

    const { data: perf, error } = await supabase
      .from("performance_indicators")
      .select(
        "building_id, year, energy_class, data_gap_status, data_completeness_percent, meps_2030_gap, meps_2033_gap, crrem_stranding_year, energy_intensity, ghg_intensity"
      )
      .eq("year", targetYear);

    if (error) return { success: false, error: error.message };

    const buildingIds = [...new Set((perf ?? []).map((p) => p.building_id))];
    const { data: buildings } = buildingIds.length
      ? await supabase
          .from("buildings")
          .select("id, name, property_id")
          .in("id", buildingIds)
      : { data: [] as { id: string; name: string; property_id: string }[] };

    const propertyIds = [
      ...new Set((buildings ?? []).map((b) => b.property_id)),
    ];
    const { data: properties } = propertyIds.length
      ? await supabase
          .from("properties")
          .select("id, name")
          .in("id", propertyIds)
      : { data: [] as { id: string; name: string }[] };

    const bMap = new Map((buildings ?? []).map((b) => [b.id, b]));
    const pMap = new Map((properties ?? []).map((p) => [p.id, p]));

    const mapped: TopRiskRow[] = (perf ?? []).map((row) => {
      const b = bMap.get(row.building_id);
      const p = b ? pMap.get(b.property_id) : undefined;
      return {
        building_id: row.building_id,
        building_name: b?.name ?? "—",
        property_name: p?.name ?? "—",
        year: row.year,
        energy_class: row.energy_class,
        data_gap_status: row.data_gap_status,
        data_completeness_percent: Number(row.data_completeness_percent ?? 0),
        meps_2030_gap:
          row.meps_2030_gap != null ? Number(row.meps_2030_gap) : null,
        meps_2033_gap:
          row.meps_2033_gap != null ? Number(row.meps_2033_gap) : null,
        crrem_stranding_year: row.crrem_stranding_year,
        energy_intensity:
          row.energy_intensity != null ? Number(row.energy_intensity) : null,
        ghg_intensity:
          row.ghg_intensity != null ? Number(row.ghg_intensity) : null,
      };
    });

    const stranded = [...mapped]
      .filter((r) => r.crrem_stranding_year != null)
      .sort(
        (a, b) =>
          (a.crrem_stranding_year ?? 9999) - (b.crrem_stranding_year ?? 9999)
      )
      .slice(0, limit);

    const mepsGap = [...mapped]
      .filter((r) => r.meps_2030_gap != null)
      .sort((a, b) => (b.meps_2030_gap ?? 0) - (a.meps_2030_gap ?? 0))
      .slice(0, limit);

    return { success: true, data: { stranded, mepsGap } };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN",
    };
  }
}

/* ─── Fas 3: beslutstavla + år-mot-år ───────────────────── */

export type YoYDelta = {
  year: number;
  prevYear: number;
  totalEnergyKwh: number;
  prevTotalEnergyKwh: number;
  energyDeltaPct: number | null;
  avgIntensity: number | null;
  prevAvgIntensity: number | null;
  intensityDeltaPct: number | null;
  mepsRiskCount: number;
  prevMepsRiskCount: number;
  incompleteCount: number;
  prevIncompleteCount: number;
  buildingCount: number;
  prevBuildingCount: number;
};

export type DecisionItem = {
  id: string;
  kind: "high_risk" | "incomplete_data" | "draft_plan" | "open_action" | "climate_year";
  severity: "high" | "medium";
  title: string;
  subtitle: string;
  href: string;
  meta?: string;
};

async function resolveBuildingIdsForProperty(
  supabase: Awaited<ReturnType<typeof createClient>>,
  propertyId?: string
): Promise<string[] | null> {
  if (!propertyId) return null;
  const { data } = await supabase
    .from("buildings")
    .select("id")
    .eq("property_id", propertyId);
  return (data ?? []).map((b) => b.id as string);
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pctDelta(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

/** Jämför valt år mot föregående. */
export async function getYearOverYear(
  year?: number,
  propertyId?: string
): Promise<ActionResult<YoYDelta>> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);
    const y = year ?? new Date().getFullYear() - 1;
    const prev = y - 1;
    const buildingIds = await resolveBuildingIdsForProperty(
      supabase,
      propertyId
    );

    async function load(target: number) {
      let q = supabase
        .from("performance_indicators")
        .select(
          "building_id, total_energy_kwh, energy_intensity, meps_2030_gap, data_gap_status"
        )
        .eq("year", target)
        .limit(500);
      if (buildingIds) {
        if (buildingIds.length === 0) return [];
        q = q.in("building_id", buildingIds);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    const [currRows, prevRows] = await Promise.all([load(y), load(prev)]);

    const sumEnergy = (rows: typeof currRows) =>
      rows.reduce((s, r) => s + Number(r.total_energy_kwh ?? 0), 0);
    const intensities = (rows: typeof currRows) =>
      rows
        .map((r) => r.energy_intensity)
        .filter((v): v is number => v != null)
        .map(Number);
    const meps = (rows: typeof currRows) =>
      rows.filter((r) => r.meps_2030_gap != null && Number(r.meps_2030_gap) > 0)
        .length;
    const incomplete = (rows: typeof currRows) =>
      rows.filter((r) => r.data_gap_status === "INCOMPLETE_DATA").length;

    const totalEnergyKwh = sumEnergy(currRows);
    const prevTotalEnergyKwh = sumEnergy(prevRows);
    const avgIntensity = avg(intensities(currRows));
    const prevAvgIntensity = avg(intensities(prevRows));

    return {
      success: true,
      data: {
        year: y,
        prevYear: prev,
        totalEnergyKwh,
        prevTotalEnergyKwh,
        energyDeltaPct: pctDelta(totalEnergyKwh, prevTotalEnergyKwh),
        avgIntensity,
        prevAvgIntensity,
        intensityDeltaPct: pctDelta(avgIntensity, prevAvgIntensity),
        mepsRiskCount: meps(currRows),
        prevMepsRiskCount: meps(prevRows),
        incompleteCount: incomplete(currRows),
        prevIncompleteCount: incomplete(prevRows),
        buildingCount: currRows.length,
        prevBuildingCount: prevRows.length,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN",
    };
  }
}

/**
 * Topp 10 saker att agera på – samlad beslutstavla.
 */
export async function getDecisionBoard(
  year?: number,
  propertyId?: string,
  limit = 10
): Promise<ActionResult<DecisionItem[]>> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);
    const y = year ?? new Date().getFullYear() - 1;
    const buildingIds = await resolveBuildingIdsForProperty(
      supabase,
      propertyId
    );

    const items: DecisionItem[] = [];

    // Incomplete data
    let piQ = supabase
      .from("performance_indicators")
      .select(
        "building_id, data_gap_status, meps_2030_gap, crrem_stranding_year, energy_class"
      )
      .eq("year", y)
      .limit(300);
    if (buildingIds) {
      if (buildingIds.length === 0)
        return { success: true, data: [] };
      piQ = piQ.in("building_id", buildingIds);
    }
    const { data: perf } = await piQ;
    const ids = [...new Set((perf ?? []).map((p) => p.building_id as string))];
    type BRow = {
      id: string;
      name: string;
      property_id: string;
      properties:
        | { id: string; name: string }
        | { id: string; name: string }[]
        | null;
    };
    const { data: buildings } = ids.length
      ? await supabase
          .from("buildings")
          .select("id, name, property_id, properties(id, name)")
          .in("id", ids)
      : { data: [] as BRow[] };

    const bMap = new Map(
      ((buildings ?? []) as BRow[]).map((b) => {
        const prop = b.properties;
        const p = Array.isArray(prop) ? prop[0] : prop;
        return [
          b.id,
          {
            name: b.name,
            property_id: p?.id ?? b.property_id,
            property_name: p?.name ?? "—",
          },
        ] as const;
      })
    );

    for (const row of perf ?? []) {
      const b = bMap.get(row.building_id as string);
      if (!b) continue;
      if (row.data_gap_status === "INCOMPLETE_DATA") {
        items.push({
          id: `data-${row.building_id}`,
          kind: "incomplete_data",
          severity: "high",
          title: `Saknad data: ${b.name}`,
          subtitle: b.property_name,
          href: `/buildings/${row.building_id}`,
          meta: "Ofullständig energidata",
        });
      }
      if (
        row.crrem_stranding_year != null &&
        Number(row.crrem_stranding_year) < 2035
      ) {
        items.push({
          id: `climate-${row.building_id}`,
          kind: "climate_year",
          severity: "high",
          title: `Klimatriskår ${row.crrem_stranding_year}: ${b.name}`,
          subtitle: b.property_name,
          href: `/buildings/${row.building_id}`,
          meta: "Finansiell / CSRD-relevant",
        });
      } else if (
        row.meps_2030_gap != null &&
        Number(row.meps_2030_gap) > 0
      ) {
        items.push({
          id: `meps-${row.building_id}`,
          kind: "high_risk",
          severity: "medium",
          title: `Kravgap 2030: ${b.name}`,
          subtitle: b.property_name,
          href: `/buildings/${row.building_id}`,
          meta: `Gap ${Number(row.meps_2030_gap).toFixed(0)} kWh/m²`,
        });
      }
    }

    // Draft plans
    let planQ = supabase
      .from("renovation_plans")
      .select("id, title, building_id, property_id, status, total_estimated_cost")
      .eq("status", "draft")
      .limit(50);
    if (propertyId) planQ = planQ.eq("property_id", propertyId);
    const { data: plans } = await planQ;
    for (const p of plans ?? []) {
      const b =
        p.building_id != null
          ? bMap.get(p.building_id as string)
          : undefined;
      items.push({
        id: `plan-${p.id}`,
        kind: "draft_plan",
        severity: "medium",
        title: `Utkast plan: ${p.title}`,
        subtitle: b?.name ?? b?.property_name ?? "Renovationsplan",
        href: `/renovation?building=${p.building_id ?? ""}`,
        meta:
          p.total_estimated_cost != null
            ? `${Math.round(Number(p.total_estimated_cost) / 1000)} tkr`
            : "Utkast",
      });
    }

    // Open high-priority actions
    let actQ = supabase
      .from("actions")
      .select(
        "id, title, building_id, status, priority_score, investment_cost, buildings!inner(name, property_id, properties(name))"
      )
      .in("status", ["proposed", "approved"])
      .order("priority_score", { ascending: false, nullsFirst: false })
      .limit(30);
    if (buildingIds && buildingIds.length > 0) {
      actQ = actQ.in("building_id", buildingIds);
    }
    const { data: acts } = await actQ;
    for (const a of acts ?? []) {
      const b = a.buildings as unknown as {
        name: string;
        property_id: string;
        properties: { name: string } | { name: string }[] | null;
      };
      if (
        propertyId &&
        b?.property_id &&
        b.property_id !== propertyId
      )
        continue;
      const prop = Array.isArray(b?.properties)
        ? b.properties[0]
        : b?.properties;
      items.push({
        id: `act-${a.id}`,
        kind: "open_action",
        severity: "medium",
        title: a.title as string,
        subtitle: `${b?.name ?? "—"} · ${prop?.name ?? "—"}`,
        href: "/actions",
        meta:
          a.investment_cost != null
            ? `${Math.round(Number(a.investment_cost) / 1000)} tkr`
            : "Åtgärd",
      });
    }

    // Dedupe by building for data/climate preference, keep variety
    const seen = new Set<string>();
    const ranked = items
      .sort((a, b) => {
        const sev = (s: DecisionItem["severity"]) =>
          s === "high" ? 0 : 1;
        return sev(a.severity) - sev(b.severity);
      })
      .filter((it) => {
        const key = `${it.kind}-${it.href}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);

    return { success: true, data: ranked };
  } catch (e) {
    logger.error("dashboard.decision_board.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN",
    };
  }
}
