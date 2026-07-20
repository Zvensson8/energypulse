"use server";

/**
 * Server-generated Excel export of building performance table.
 * Returns base64 XLSX for client download.
 */

import * as XLSX from "xlsx";
import {
  queryBuildingPerformance,
  type BuildingsTableQuery,
} from "@/app/actions/buildings-table";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function exportBuildingPerformanceExcel(
  raw: unknown
): Promise<ActionResult<{ fileBase64: string; fileName: string }>> {
  try {
    // Export up to 2000 filtered rows (page ignored → large page)
    const query = {
      ...(raw as BuildingsTableQuery),
      page: 0,
      pageSize: 200,
    };

    // Fetch multiple pages if needed
    const first = await queryBuildingPerformance(query);
    if (!first.success) return first;

    let allRows = [...first.data.rows];
    const total = first.data.total;
    const pages = Math.ceil(total / 200);

    for (let p = 1; p < pages && p < 10; p++) {
      const next = await queryBuildingPerformance({
        ...query,
        page: p,
        pageSize: 200,
      });
      if (next.success) {
        allRows = allRows.concat(next.data.rows);
      }
    }

    const sheetData = allRows.map((r) => ({
      Fastighet: r.property_name,
      Byggnad: r.building_name,
      Kommun: r.municipality ?? "",
      År: r.year,
      Atemp_m2: r.a_temp,
      Total_kWh: r.total_energy_kwh,
      Intensitet_kWh_m2: r.energy_intensity,
      Primärenergital: r.primary_energy_intensity,
      GHG_kg_m2: r.ghg_intensity,
      Energiklass: r.energy_class ?? "",
      MEPS_2030_gap: r.meps_2030_gap,
      MEPS_2033_gap: r.meps_2033_gap,
      CRREM_stranding: r.crrem_stranding_year,
      CRREM_version: r.crrem_version_used ?? "",
      Data_gap_status: r.data_gap_status,
      Data_completeness_pct: r.data_completeness_percent,
      Override: r.override_applied ? "ja" : "nej",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, "Performance");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const fileBase64 = Buffer.from(buf).toString("base64");
    const fileName = `energypulse_performance_${first.data.year}_${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;

    logger.info("export.excel.done", { rows: allRows.length, fileName });

    return { success: true, data: { fileBase64, fileName } };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN",
    };
  }
}
