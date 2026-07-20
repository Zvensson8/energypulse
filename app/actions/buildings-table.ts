"use server";

/**
 * Server-side pagination, sorting, filtering for building performance table.
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { z } from "zod";
import type {
  DataGapStatus,
  EnergyClass,
} from "@/lib/supabase/database.types";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const querySchema = z.object({
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(10).max(200).default(50),
  sortBy: z
    .enum([
      "building_name",
      "property_name",
      "year",
      "energy_intensity",
      "primary_energy_intensity",
      "ghg_intensity",
      "energy_class",
      "meps_2030_gap",
      "meps_2033_gap",
      "crrem_stranding_year",
      "data_gap_status",
      "data_completeness_percent",
    ])
    .default("meps_2030_gap"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  year: z.number().int().optional(),
  data_gap_status: z
    .enum(["COMPLETE", "EXTRAPOLATED_WARNING", "INCOMPLETE_DATA"])
    .optional()
    .nullable(),
  energy_class: z
    .enum(["A", "B", "C", "D", "E", "F", "G"])
    .optional()
    .nullable(),
  crrem_stranding_year_max: z.number().int().optional().nullable(),
  search: z.string().optional().nullable(),
});

export type BuildingsTableQuery = z.infer<typeof querySchema>;

export interface BuildingPerformanceRow {
  performance_id: string;
  building_id: string;
  building_name: string;
  property_id: string;
  property_name: string;
  municipality: string | null;
  year: number;
  area_id: string | null;
  a_temp: number | null;
  total_energy_kwh: number | null;
  energy_intensity: number | null;
  primary_energy_intensity: number | null;
  ghg_intensity: number | null;
  energy_class: EnergyClass | null;
  meps_2030_gap: number | null;
  meps_2033_gap: number | null;
  crrem_stranding_year: number | null;
  crrem_version_used: string | null;
  data_gap_status: DataGapStatus;
  data_completeness_percent: number;
  override_applied: boolean;
  calculation_method: string;
}

export interface BuildingsTableResult {
  rows: BuildingPerformanceRow[];
  total: number;
  page: number;
  pageSize: number;
  year: number;
}

export async function queryBuildingPerformance(
  raw: unknown
): Promise<ActionResult<BuildingsTableResult>> {
  try {
    const q = querySchema.parse(raw);
    const supabase = await createClient();
    await requireUser(supabase);

    const targetYear = q.year ?? new Date().getFullYear() - 1;

    // Base query on performance_indicators
    let query = supabase
      .from("performance_indicators")
      .select(
        "id, building_id, year, area_id, a_temp, total_energy_kwh, energy_intensity, primary_energy_intensity, ghg_intensity, energy_class, meps_2030_gap, meps_2033_gap, crrem_stranding_year, crrem_version_used, data_gap_status, data_completeness_percent, override_applied, calculation_method",
        { count: "exact" }
      )
      .eq("year", targetYear);

    if (q.data_gap_status) {
      query = query.eq("data_gap_status", q.data_gap_status);
    }
    if (q.energy_class) {
      query = query.eq("energy_class", q.energy_class);
    }
    if (q.crrem_stranding_year_max != null) {
      query = query
        .not("crrem_stranding_year", "is", null)
        .lte("crrem_stranding_year", q.crrem_stranding_year_max);
    }

    // Sort on PI columns when possible (name sorts done client-side after join)
    const piSortable = new Set([
      "year",
      "energy_intensity",
      "primary_energy_intensity",
      "ghg_intensity",
      "energy_class",
      "meps_2030_gap",
      "meps_2033_gap",
      "crrem_stranding_year",
      "data_gap_status",
      "data_completeness_percent",
    ]);

    if (piSortable.has(q.sortBy)) {
      query = query.order(q.sortBy, {
        ascending: q.sortDir === "asc",
        nullsFirst: false,
      });
    } else {
      query = query.order("meps_2030_gap", {
        ascending: false,
        nullsFirst: false,
      });
    }

    // For search by name we need broader fetch then filter; for pure PI filters use range
    const needsNameJoin =
      Boolean(q.search?.trim()) ||
      q.sortBy === "building_name" ||
      q.sortBy === "property_name";

    type PerfRow = {
      id: string;
      building_id: string;
      year: number;
      area_id: string | null;
      a_temp: number | null;
      total_energy_kwh: number | null;
      energy_intensity: number | null;
      primary_energy_intensity: number | null;
      ghg_intensity: number | null;
      energy_class: EnergyClass | null;
      meps_2030_gap: number | null;
      meps_2033_gap: number | null;
      crrem_stranding_year: number | null;
      crrem_version_used: string | null;
      data_gap_status: DataGapStatus;
      data_completeness_percent: number;
      override_applied: boolean;
      calculation_method: string;
    };

    let perfRows: PerfRow[] = [];
    let total = 0;

    if (needsNameJoin) {
      // Fetch filtered set (cap for density UI) then join + filter + paginate in memory
      const { data, error, count } = await query.limit(2000);
      if (error) return { success: false, error: error.message };
      perfRows = (data ?? []) as PerfRow[];
      total = count ?? perfRows.length;
    } else {
      const from = q.page * q.pageSize;
      const to = from + q.pageSize - 1;
      const { data, error, count } = await query.range(from, to);
      if (error) return { success: false, error: error.message };
      perfRows = (data ?? []) as PerfRow[];
      total = count ?? 0;
    }

    const buildingIds = [
      ...new Set(perfRows.map((r: PerfRow) => r.building_id)),
    ];
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
          .select("id, name, municipality")
          .in("id", propertyIds)
      : {
          data: [] as {
            id: string;
            name: string;
            municipality: string | null;
          }[],
        };

    const bMap = new Map((buildings ?? []).map((b) => [b.id, b]));
    const pMap = new Map((properties ?? []).map((p) => [p.id, p]));

    let rows: BuildingPerformanceRow[] = perfRows.map((r: PerfRow) => {
      const b = bMap.get(r.building_id);
      const p = b ? pMap.get(b.property_id) : undefined;
      return {
        performance_id: r.id,
        building_id: r.building_id,
        building_name: b?.name ?? "—",
        property_id: b?.property_id ?? "",
        property_name: p?.name ?? "—",
        municipality: p?.municipality ?? null,
        year: r.year,
        area_id: r.area_id,
        a_temp: r.a_temp != null ? Number(r.a_temp) : null,
        total_energy_kwh:
          r.total_energy_kwh != null ? Number(r.total_energy_kwh) : null,
        energy_intensity:
          r.energy_intensity != null ? Number(r.energy_intensity) : null,
        primary_energy_intensity:
          r.primary_energy_intensity != null
            ? Number(r.primary_energy_intensity)
            : null,
        ghg_intensity:
          r.ghg_intensity != null ? Number(r.ghg_intensity) : null,
        energy_class: r.energy_class,
        meps_2030_gap:
          r.meps_2030_gap != null ? Number(r.meps_2030_gap) : null,
        meps_2033_gap:
          r.meps_2033_gap != null ? Number(r.meps_2033_gap) : null,
        crrem_stranding_year: r.crrem_stranding_year,
        crrem_version_used: r.crrem_version_used,
        data_gap_status: r.data_gap_status,
        data_completeness_percent: Number(r.data_completeness_percent ?? 0),
        override_applied: r.override_applied,
        calculation_method: r.calculation_method,
      };
    });

    if (q.search?.trim()) {
      const s = q.search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.building_name.toLowerCase().includes(s) ||
          r.property_name.toLowerCase().includes(s) ||
          (r.municipality?.toLowerCase().includes(s) ?? false)
      );
      total = rows.length;
    }

    if (q.sortBy === "building_name" || q.sortBy === "property_name") {
      const key = q.sortBy;
      rows.sort((a, b) => {
        const av = a[key] ?? "";
        const bv = b[key] ?? "";
        const cmp = String(av).localeCompare(String(bv), "sv");
        return q.sortDir === "asc" ? cmp : -cmp;
      });
    }

    if (needsNameJoin) {
      const from = q.page * q.pageSize;
      rows = rows.slice(from, from + q.pageSize);
    }

    return {
      success: true,
      data: {
        rows,
        total,
        page: q.page,
        pageSize: q.pageSize,
        year: targetYear,
      },
    };
  } catch (e) {
    logger.error("buildings_table.query.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN",
    };
  }
}
