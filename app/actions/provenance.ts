"use server";

/**
 * Provenance modal data: exact energy_consumption rows, area version, factors.
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { z } from "zod";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const reqSchema = z.object({
  building_id: z.string().uuid(),
  year: z.number().int(),
});

export interface ProvenanceData {
  building: {
    id: string;
    name: string;
    property_name: string;
    municipality: string | null;
  };
  performance: {
    id: string;
    year: number;
    a_temp: number | null;
    total_energy_kwh: number | null;
    energy_intensity: number | null;
    primary_energy_intensity: number | null;
    ghg_intensity: number | null;
    energy_class: string | null;
    meps_2030_gap: number | null;
    meps_2033_gap: number | null;
    crrem_stranding_year: number | null;
    crrem_version_used: string | null;
    data_gap_status: string;
    data_completeness_percent: number;
    calculation_method: string;
    override_applied: boolean;
    override_reason: string | null;
  } | null;
  area: {
    id: string;
    valid_from: string;
    valid_to: string | null;
    a_temp: number;
    bta: number | null;
    source: string | null;
    quality_class: string;
  } | null;
  consumption: Array<{
    id: string;
    month: number;
    energy_source_id: string;
    energy_source_name: string;
    primary_energy_factor: number;
    emission_factor_kg_co2e_per_kwh: number;
    consumption_kwh: number;
    is_estimated: boolean;
    is_weather_corrected: boolean;
    quality_class: string;
  }>;
  formulas: {
    energy_intensity: string;
    primary_energy: string;
    ghg_intensity: string;
    meps_gap: string;
  };
  climate: Array<{
    month: number | null;
    heating_degree_days: number;
    cooling_degree_days: number;
    source: string;
  }>;
  /** Fas 4: interpolation meta */
  interpolation_method: string | null;
  estimated_row_count: number;
  measured_row_count: number;
}

export async function getBuildingProvenance(
  raw: unknown
): Promise<ActionResult<ProvenanceData>> {
  try {
    const { building_id, year } = reqSchema.parse(raw);
    const supabase = await createClient();
    await requireUser(supabase);

    const { data: building, error: bErr } = await supabase
      .from("buildings")
      .select("id, name, property_id")
      .eq("id", building_id)
      .single();

    if (bErr || !building) {
      return { success: false, error: bErr?.message ?? "Building not found" };
    }

    const { data: property } = await supabase
      .from("properties")
      .select("id, name, municipality")
      .eq("id", building.property_id)
      .single();

    const { data: performance } = await supabase
      .from("performance_indicators")
      .select("*")
      .eq("building_id", building_id)
      .eq("year", year)
      .maybeSingle();

    let area: ProvenanceData["area"] = null;
    if (performance?.area_id) {
      const { data: areaRow } = await supabase
        .from("areas")
        .select(
          "id, valid_from, valid_to, a_temp, bta, source, quality_class"
        )
        .eq("id", performance.area_id)
        .maybeSingle();
      if (areaRow) {
        area = {
          id: areaRow.id,
          valid_from: areaRow.valid_from,
          valid_to: areaRow.valid_to,
          a_temp: Number(areaRow.a_temp),
          bta: areaRow.bta != null ? Number(areaRow.bta) : null,
          source: areaRow.source,
          quality_class: areaRow.quality_class,
        };
      }
    } else {
      // Fallback: select area covering mid-year
      const mid = `${year}-07-01`;
      const { data: areas } = await supabase
        .from("areas")
        .select(
          "id, valid_from, valid_to, a_temp, bta, source, quality_class"
        )
        .eq("building_id", building_id)
        .lte("valid_from", mid)
        .order("valid_from", { ascending: false })
        .limit(5);

      const hit = (areas ?? []).find(
        (a) => a.valid_to == null || a.valid_to >= `${year}-01-01`
      );
      if (hit) {
        area = {
          id: hit.id,
          valid_from: hit.valid_from,
          valid_to: hit.valid_to,
          a_temp: Number(hit.a_temp),
          bta: hit.bta != null ? Number(hit.bta) : null,
          source: hit.source,
          quality_class: hit.quality_class,
        };
      }
    }

    const { data: consumption } = await supabase
      .from("energy_consumption")
      .select(
        "id, month, energy_source_id, consumption_kwh, is_estimated, is_weather_corrected, quality_class"
      )
      .eq("building_id", building_id)
      .eq("year", year)
      .is("space_id", null)
      .order("month", { ascending: true });

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
      : {
          data: [] as {
            id: string;
            name: string;
            primary_energy_factor: number;
            emission_factor_kg_co2e_per_kwh: number;
          }[],
        };

    const sMap = new Map((sources ?? []).map((s) => [s.id, s]));

    const consumptionRows = (consumption ?? []).map((c) => {
      const s = sMap.get(c.energy_source_id);
      return {
        id: c.id,
        month: c.month,
        energy_source_id: c.energy_source_id,
        energy_source_name: s?.name ?? c.energy_source_id.slice(0, 8),
        primary_energy_factor: Number(s?.primary_energy_factor ?? 0),
        emission_factor_kg_co2e_per_kwh: Number(
          s?.emission_factor_kg_co2e_per_kwh ?? 0
        ),
        consumption_kwh: Number(c.consumption_kwh),
        is_estimated: c.is_estimated,
        is_weather_corrected: c.is_weather_corrected,
        quality_class: c.quality_class,
      };
    });

    let climate: ProvenanceData["climate"] = [];
    if (property?.municipality) {
      const { data: climateRows } = await supabase
        .from("climate_data")
        .select(
          "month, heating_degree_days, cooling_degree_days, source"
        )
        .eq("municipality", property.municipality)
        .eq("year", year)
        .order("month", { ascending: true });
      climate = (climateRows ?? []).map((c) => ({
        month: c.month,
        heating_degree_days: Number(c.heating_degree_days),
        cooling_degree_days: Number(c.cooling_degree_days),
        source: c.source,
      }));
    }

    const aTemp = performance?.a_temp ?? area?.a_temp ?? null;
    const formulas = {
      energy_intensity: `energy_intensity = total_energy_kwh / a_temp${
        aTemp != null
          ? ` = ${performance?.total_energy_kwh ?? "ΣkWh"} / ${aTemp}`
          : ""
      }`,
      primary_energy: `primärenergital = Σ(consumption_kwh × primary_energy_factor) / a_temp`,
      ghg_intensity: `ghg_intensity = Σ(consumption_kwh × emission_factor_kg_co2e_per_kwh) / a_temp`,
      meps_gap: `meps_gap = energy_intensity − meps_threshold  (office 2030=214, 2033=174 kWh/m²)`,
    };

    const estimated_row_count = consumptionRows.filter(
      (c) => c.is_estimated
    ).length;
    const measured_row_count = consumptionRows.length - estimated_row_count;

    const { data: gapCfg } = await supabase
      .from("data_gap_config")
      .select("interpolation_method")
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    const interpolation_method =
      estimated_row_count > 0
        ? gapCfg?.interpolation_method ??
          "linear_previous_3m_seasonal_graddagar"
        : null;

    return {
      success: true,
      data: {
        building: {
          id: building.id,
          name: building.name,
          property_name: property?.name ?? "—",
          municipality: property?.municipality ?? null,
        },
        performance: performance
          ? {
              id: performance.id,
              year: performance.year,
              a_temp:
                performance.a_temp != null
                  ? Number(performance.a_temp)
                  : null,
              total_energy_kwh:
                performance.total_energy_kwh != null
                  ? Number(performance.total_energy_kwh)
                  : null,
              energy_intensity:
                performance.energy_intensity != null
                  ? Number(performance.energy_intensity)
                  : null,
              primary_energy_intensity:
                performance.primary_energy_intensity != null
                  ? Number(performance.primary_energy_intensity)
                  : null,
              ghg_intensity:
                performance.ghg_intensity != null
                  ? Number(performance.ghg_intensity)
                  : null,
              energy_class: performance.energy_class,
              meps_2030_gap:
                performance.meps_2030_gap != null
                  ? Number(performance.meps_2030_gap)
                  : null,
              meps_2033_gap:
                performance.meps_2033_gap != null
                  ? Number(performance.meps_2033_gap)
                  : null,
              crrem_stranding_year: performance.crrem_stranding_year,
              crrem_version_used: performance.crrem_version_used,
              data_gap_status: performance.data_gap_status,
              data_completeness_percent: Number(
                performance.data_completeness_percent ?? 0
              ),
              calculation_method: performance.calculation_method,
              override_applied: performance.override_applied,
              override_reason: performance.override_reason,
            }
          : null,
        area,
        consumption: consumptionRows,
        formulas,
        climate,
        interpolation_method,
        estimated_row_count,
        measured_row_count,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN",
    };
  }
}
