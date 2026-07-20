"use server";

/**
 * Fas 4 – transparens & compliance server actions.
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser, OVERRIDE_ROLES } from "@/lib/auth/session";
import { z } from "zod";
import type { UserRole } from "@/lib/supabase/database.types";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

const buildingYearSchema = z.object({
  building_id: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
});

export interface FormulaContext {
  building_id: string;
  building_name: string;
  year: number;
  formulas: {
    energy_intensity: string;
    primary_energy: string;
    ghg_intensity: string;
    meps_gap: string;
    crrem_stranding: string;
  };
  area: {
    id: string;
    valid_from: string;
    valid_to: string | null;
    a_temp: number;
    source: string | null;
    quality_class: string;
  } | null;
  data_gap_status: string | null;
  data_completeness_percent: number | null;
  crrem_version_used: string | null;
  crrem_stranding_year: number | null;
  override_applied: boolean;
  override_reason: string | null;
  interpolation_method: string | null;
  estimated_row_count: number;
  measured_row_count: number;
  consumption_summary: Array<{
    id: string;
    month: number;
    energy_source_name: string;
    consumption_kwh: number;
    is_estimated: boolean;
    primary_energy_factor: number;
    emission_factor: number;
  }>;
  total_energy_kwh: number | null;
  energy_intensity: number | null;
  primary_energy_intensity: number | null;
  ghg_intensity: number | null;
  meps_2030_gap: number | null;
  meps_2033_gap: number | null;
}

export async function getFormulaContext(
  raw: unknown
): Promise<ActionResult<FormulaContext>> {
  try {
    const { building_id, year } = buildingYearSchema.parse(raw);
    const supabase = await createClient();
    await requireUser(supabase);

    const { data: building } = await supabase
      .from("buildings")
      .select("id, name")
      .eq("id", building_id)
      .single();

    if (!building) {
      return { success: false, error: "Building not found" };
    }

    const { data: performance } = await supabase
      .from("performance_indicators")
      .select("*")
      .eq("building_id", building_id)
      .eq("year", year)
      .maybeSingle();

    let area: FormulaContext["area"] = null;
    if (performance?.area_id) {
      const { data: a } = await supabase
        .from("areas")
        .select("id, valid_from, valid_to, a_temp, source, quality_class")
        .eq("id", performance.area_id)
        .maybeSingle();
      if (a) {
        area = {
          id: a.id,
          valid_from: a.valid_from,
          valid_to: a.valid_to,
          a_temp: Number(a.a_temp),
          source: a.source,
          quality_class: a.quality_class,
        };
      }
    }

    const { data: consumption } = await supabase
      .from("energy_consumption")
      .select(
        "id, month, energy_source_id, consumption_kwh, is_estimated"
      )
      .eq("building_id", building_id)
      .eq("year", year)
      .is("space_id", null)
      .order("month");

    const sourceIds = [
      ...new Set((consumption ?? []).map((c) => c.energy_source_id)),
    ];
    const { data: sources } = sourceIds.length
      ? await supabase
          .from("energy_sources")
          .select(
            "id, name, primary_energy_factor, emission_factor_kg_co2e_per_kwh"
          )
          .in("id", sourceIds)
      : { data: [] as { id: string; name: string; primary_energy_factor: number; emission_factor_kg_co2e_per_kwh: number }[] };

    const sMap = new Map((sources ?? []).map((s) => [s.id, s]));
    const consumption_summary = (consumption ?? []).map((c) => {
      const s = sMap.get(c.energy_source_id);
      return {
        id: c.id,
        month: c.month,
        energy_source_name: s?.name ?? "?",
        consumption_kwh: Number(c.consumption_kwh),
        is_estimated: c.is_estimated,
        primary_energy_factor: Number(s?.primary_energy_factor ?? 0),
        emission_factor: Number(s?.emission_factor_kg_co2e_per_kwh ?? 0),
      };
    });

    const { data: gapCfg } = await supabase
      .from("data_gap_config")
      .select("interpolation_method")
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    const estimated_row_count = consumption_summary.filter(
      (c) => c.is_estimated
    ).length;
    const measured_row_count = consumption_summary.length - estimated_row_count;

    const aTemp =
      performance?.a_temp != null
        ? Number(performance.a_temp)
        : area?.a_temp ?? null;
    const tot =
      performance?.total_energy_kwh != null
        ? Number(performance.total_energy_kwh)
        : null;

    return {
      success: true,
      data: {
        building_id,
        building_name: building.name,
        year,
        formulas: {
          energy_intensity: `total_energy_kwh / a_temp${
            tot != null && aTemp != null ? ` = ${tot} / ${aTemp}` : ""
          }`,
          primary_energy:
            "Σ(consumption_kwh × primary_energy_factor) / a_temp",
          ghg_intensity:
            "Σ(consumption_kwh × emission_factor_kg_co2e_per_kwh) / a_temp",
          meps_gap: "energy_intensity − meps_threshold",
          crrem_stranding:
            "min year där ghg_intensity > linjär-interpolerad intensity_target_ghg (statisk prestanda)",
        },
        area,
        data_gap_status: performance?.data_gap_status ?? null,
        data_completeness_percent:
          performance?.data_completeness_percent != null
            ? Number(performance.data_completeness_percent)
            : null,
        crrem_version_used: performance?.crrem_version_used ?? null,
        crrem_stranding_year: performance?.crrem_stranding_year ?? null,
        override_applied: performance?.override_applied ?? false,
        override_reason: performance?.override_reason ?? null,
        interpolation_method:
          estimated_row_count > 0
            ? gapCfg?.interpolation_method ??
              "linear_previous_3m_seasonal_graddagar"
            : null,
        estimated_row_count,
        measured_row_count,
        consumption_summary,
        total_energy_kwh: tot,
        energy_intensity:
          performance?.energy_intensity != null
            ? Number(performance.energy_intensity)
            : null,
        primary_energy_intensity:
          performance?.primary_energy_intensity != null
            ? Number(performance.primary_energy_intensity)
            : null,
        ghg_intensity:
          performance?.ghg_intensity != null
            ? Number(performance.ghg_intensity)
            : null,
        meps_2030_gap:
          performance?.meps_2030_gap != null
            ? Number(performance.meps_2030_gap)
            : null,
        meps_2033_gap:
          performance?.meps_2033_gap != null
            ? Number(performance.meps_2033_gap)
            : null,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN",
    };
  }
}

// ---------------------------------------------------------------------------
// CRREM chart
// ---------------------------------------------------------------------------

export interface CrremPathwayPoint {
  target_year: number;
  intensity_target_ghg: number;
  intensity_target_energy: number | null;
}

export interface CrremChartData {
  building_id: string;
  building_name: string;
  year: number;
  ghg_intensity: number | null;
  data_gap_status: string | null;
  data_completeness_percent: number | null;
  crrem_version: string;
  available_versions: string[];
  property_type: string;
  pathway: CrremPathwayPoint[];
  /** Yearly interpolated target from min pathway year to 2050 */
  series: Array<{ year: number; target_ghg: number; actual_ghg: number | null }>;
  stranding_year: number | null;
  stranding_year_stored: number | null;
}

function interpolateTarget(
  pathway: CrremPathwayPoint[],
  y: number
): number | null {
  if (pathway.length === 0) return null;
  const sorted = [...pathway].sort((a, b) => a.target_year - b.target_year);
  const before = [...sorted].reverse().find((p) => p.target_year <= y);
  const after = sorted.find((p) => p.target_year >= y);
  if (!before && after) return after.intensity_target_ghg;
  if (before && !after) return before.intensity_target_ghg;
  if (!before || !after) return null;
  if (before.target_year === after.target_year) {
    return before.intensity_target_ghg;
  }
  const t =
    (y - before.target_year) / (after.target_year - before.target_year);
  return (
    before.intensity_target_ghg +
    (after.intensity_target_ghg - before.intensity_target_ghg) * t
  );
}

export async function getCrremChartData(
  raw: unknown
): Promise<ActionResult<CrremChartData>> {
  try {
    const input = buildingYearSchema
      .extend({
        crrem_version: z.string().optional(),
        property_type: z.string().optional(),
      })
      .parse(raw);

    const supabase = await createClient();
    await requireUser(supabase);

    const { data: building } = await supabase
      .from("buildings")
      .select("id, name, primary_use")
      .eq("id", input.building_id)
      .single();

    if (!building) {
      return { success: false, error: "Building not found" };
    }

    const property_type =
      input.property_type ?? building.primary_use ?? "office";

    const { data: allPathways } = await supabase
      .from("crrem_pathways")
      .select(
        "crrem_version, property_type, target_year, intensity_target_ghg, intensity_target_energy"
      )
      .eq("country_code", "SE")
      .eq("property_type", property_type)
      .order("target_year");

    const available_versions = [
      ...new Set((allPathways ?? []).map((p) => p.crrem_version)),
    ].sort();

    const { data: performance } = await supabase
      .from("performance_indicators")
      .select(
        "ghg_intensity, crrem_version_used, crrem_stranding_year, data_gap_status, data_completeness_percent"
      )
      .eq("building_id", input.building_id)
      .eq("year", input.year)
      .maybeSingle();

    const crrem_version =
      input.crrem_version ??
      performance?.crrem_version_used ??
      available_versions[0] ??
      "v2.0-1.5C";

    const pathway = (allPathways ?? [])
      .filter((p) => p.crrem_version === crrem_version)
      .map((p) => ({
        target_year: p.target_year,
        intensity_target_ghg: Number(p.intensity_target_ghg),
        intensity_target_energy:
          p.intensity_target_energy != null
            ? Number(p.intensity_target_energy)
            : null,
      }));

    const ghg =
      performance?.ghg_intensity != null
        ? Number(performance.ghg_intensity)
        : null;

    const startY = pathway[0]?.target_year ?? input.year;
    const endY = 2050;
    const series: CrremChartData["series"] = [];
    for (let y = startY; y <= endY; y++) {
      const target = interpolateTarget(pathway, y);
      if (target == null) continue;
      series.push({
        year: y,
        target_ghg: Math.round(target * 10000) / 10000,
        actual_ghg: ghg,
      });
    }

    let stranding_year: number | null = null;
    if (ghg != null) {
      const { data: strand, error } = await supabase.rpc(
        "calculate_crrem_stranding_year",
        {
          p_building_id: input.building_id,
          p_year: input.year,
          p_ghg_intensity: ghg,
          p_crrem_version: crrem_version,
          p_property_type: property_type,
        }
      );
      if (!error) {
        stranding_year = strand as number | null;
      }
    }

    return {
      success: true,
      data: {
        building_id: input.building_id,
        building_name: building.name,
        year: input.year,
        ghg_intensity: ghg,
        data_gap_status: performance?.data_gap_status ?? null,
        data_completeness_percent:
          performance?.data_completeness_percent != null
            ? Number(performance.data_completeness_percent)
            : null,
        crrem_version,
        available_versions,
        property_type,
        pathway,
        series,
        stranding_year,
        stranding_year_stored: performance?.crrem_stranding_year ?? null,
      },
    };
  } catch (e) {
    logger.error("compliance.crrem.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN",
    };
  }
}

export async function listCrremBuildings(
  year?: number
): Promise<
  ActionResult<
    Array<{
      building_id: string;
      building_name: string;
      property_id: string | null;
      property_name: string;
      year: number;
      ghg_intensity: number | null;
      crrem_stranding_year: number | null;
      data_gap_status: string;
    }>
  >
> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);
    const y = year ?? new Date().getFullYear() - 1;

    const { data: perf, error } = await supabase
      .from("performance_indicators")
      .select(
        "building_id, year, ghg_intensity, crrem_stranding_year, data_gap_status"
      )
      .eq("year", y)
      .order("crrem_stranding_year", { ascending: true, nullsFirst: false });

    if (error) return { success: false, error: error.message };

    const ids = [...new Set((perf ?? []).map((p) => p.building_id))];
    const { data: buildings } = ids.length
      ? await supabase
          .from("buildings")
          .select("id, name, property_id")
          .in("id", ids)
      : { data: [] as { id: string; name: string; property_id: string }[] };

    const propIds = [
      ...new Set((buildings ?? []).map((b) => b.property_id)),
    ];
    const { data: props } = propIds.length
      ? await supabase.from("properties").select("id, name").in("id", propIds)
      : { data: [] as { id: string; name: string }[] };

    const bMap = new Map((buildings ?? []).map((b) => [b.id, b]));
    const pMap = new Map((props ?? []).map((p) => [p.id, p.name]));

    return {
      success: true,
      data: (perf ?? []).map((p) => {
        const b = bMap.get(p.building_id);
        return {
          building_id: p.building_id,
          building_name: b?.name ?? "—",
          property_id: b?.property_id ?? null,
          property_name: b ? pMap.get(b.property_id) ?? "—" : "—",
          year: p.year,
          ghg_intensity:
            p.ghg_intensity != null ? Number(p.ghg_intensity) : null,
          crrem_stranding_year: p.crrem_stranding_year,
          data_gap_status: p.data_gap_status,
        };
      }),
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN",
    };
  }
}

// ---------------------------------------------------------------------------
// Override eligibility
// ---------------------------------------------------------------------------

export async function getOverrideEligibility(): Promise<
  ActionResult<{
    allowed: boolean;
    role: UserRole | null;
    reason?: string;
  }>
> {
  try {
    const supabase = await createClient();
    const user = await requireUser(supabase);

    if (user.role === "viewer") {
      return {
        success: true,
        data: {
          allowed: false,
          role: user.role,
          reason: "viewer kan inte override",
        },
      };
    }

    const { data } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "override_enabled_per_role")
      .maybeSingle();

    let allowed = OVERRIDE_ROLES.includes(user.role);
    if (data?.value && typeof data.value === "object" && !Array.isArray(data.value)) {
      const map = data.value as Record<string, unknown>;
      if (typeof map[user.role] === "boolean") {
        allowed = map[user.role] as boolean;
      }
    }

    return {
      success: true,
      data: {
        allowed,
        role: user.role,
        reason: allowed
          ? undefined
          : `Roll ${user.role} ej aktiverad i system_config.override_enabled_per_role`,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN",
    };
  }
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export interface AuditLogRow {
  id: string;
  entity_type: string;
  entity_id: string | null;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  operation: string;
  override_reason: string | null;
  quality_class: string | null;
  changed_by: string | null;
  changed_at: string;
}

export async function getBuildingAuditTrail(
  raw: unknown
): Promise<ActionResult<AuditLogRow[]>> {
  try {
    const input = buildingYearSchema
      .extend({
        limit: z.number().int().min(1).max(500).optional().default(200),
      })
      .parse(raw);

    const supabase = await createClient();
    await requireUser(supabase);

    // Collect related entity ids for the building/year
    const { data: pi } = await supabase
      .from("performance_indicators")
      .select("id")
      .eq("building_id", input.building_id)
      .eq("year", input.year)
      .maybeSingle();

    const { data: consumption } = await supabase
      .from("energy_consumption")
      .select("id")
      .eq("building_id", input.building_id)
      .eq("year", input.year);

    const entityIds = [
      input.building_id,
      ...(pi ? [pi.id] : []),
      ...((consumption ?? []).map((c) => c.id) as string[]),
    ];

    // Fetch logs for building + related entities; also OVERRIDE ops mentioning building
    const { data: logs, error } = await supabase
      .from("data_quality_logs")
      .select(
        "id, entity_type, entity_id, field, old_value, new_value, operation, override_reason, quality_class, changed_by, changed_at"
      )
      .in("entity_id", entityIds)
      .order("changed_at", { ascending: false })
      .limit(input.limit);

    if (error) return { success: false, error: error.message };

    // Also fetch OVERRIDE logs keyed by building_id as entity_id (from calculate function)
    const { data: overrideLogs } = await supabase
      .from("data_quality_logs")
      .select(
        "id, entity_type, entity_id, field, old_value, new_value, operation, override_reason, quality_class, changed_by, changed_at"
      )
      .eq("operation", "OVERRIDE")
      .eq("entity_id", input.building_id)
      .order("changed_at", { ascending: false })
      .limit(50);

    const map = new Map<string, AuditLogRow>();
    for (const l of [...(logs ?? []), ...(overrideLogs ?? [])]) {
      map.set(l.id, {
        id: l.id,
        entity_type: l.entity_type,
        entity_id: l.entity_id,
        field: l.field,
        old_value: l.old_value,
        new_value: l.new_value,
        operation: l.operation,
        override_reason: l.override_reason,
        quality_class: l.quality_class,
        changed_by: l.changed_by,
        changed_at: l.changed_at,
      });
    }

    const rows = [...map.values()].sort(
      (a, b) =>
        new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
    );

    return { success: true, data: rows.slice(0, input.limit) };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN",
    };
  }
}
