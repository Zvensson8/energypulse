"use server";

/**
 * PDF-export av byggnadsprestanda (Fas 5 reporting).
 */

import {
  queryBuildingPerformance,
  type BuildingsTableQuery,
} from "@/app/actions/buildings-table";
import { buildSimplePdf, pdfToBase64, type PdfLine } from "@/lib/pdf/simple-pdf";
import { logger } from "@/lib/logger";
import { dataGapLabel } from "@/lib/utils";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function exportBuildingPerformancePdf(
  raw: unknown
): Promise<ActionResult<{ fileBase64: string; fileName: string }>> {
  try {
    const query = {
      ...(raw as BuildingsTableQuery),
      page: 0,
      pageSize: 200,
    };

    const first = await queryBuildingPerformance(query);
    if (!first.success) return first;

    let allRows = [...first.data.rows];
    const total = first.data.total;
    const pages = Math.min(5, Math.ceil(total / 200));
    for (let p = 1; p < pages; p++) {
      const next = await queryBuildingPerformance({
        ...query,
        page: p,
        pageSize: 200,
      });
      if (next.success) allRows = allRows.concat(next.data.rows);
    }

    // Cap PDF rows for readability
    const rows = allRows.slice(0, 80);
    const year = first.data.year;
    const today = new Date().toISOString().slice(0, 10);

    const complete = allRows.filter((r) => r.data_gap_status === "COMPLETE")
      .length;
    const extrapolated = allRows.filter(
      (r) => r.data_gap_status === "EXTRAPOLATED_WARNING"
    ).length;
    const incomplete = allRows.filter(
      (r) => r.data_gap_status === "INCOMPLETE_DATA"
    ).length;
    const mepsRisk = allRows.filter(
      (r) => r.meps_2030_gap != null && r.meps_2030_gap > 0
    ).length;

    const lines: PdfLine[] = [
      { type: "title", text: "EnergyPulse – Byggnadsprestanda" },
      {
        type: "text",
        text: `Ar: ${year}  |  Genererad: ${today}  |  Visar ${rows.length} av ${total} byggnader`,
      },
      { type: "space", h: 8 },
      { type: "subtitle", text: "Sammanfattning" },
      {
        type: "text",
        text: `Datakvalitet: Komplett ${complete}, Uppskattad ${extrapolated}, Saknas data ${incomplete}`,
      },
      {
        type: "text",
        text: `Byggnader over kravgap 2030: ${mepsRisk}`,
      },
      { type: "space", h: 10 },
      { type: "subtitle", text: "Byggnader" },
      {
        type: "row",
        cells: [
          "Byggnad",
          "Klass",
          "kWh/m2",
          "Gap30",
          "Riskar",
          "Data",
        ],
        widths: [140, 40, 60, 55, 50, 80],
      },
      {
        type: "row",
        cells: ["------", "-----", "------", "-----", "------", "----"],
        widths: [140, 40, 60, 55, 50, 80],
      },
    ];

    for (const r of rows) {
      lines.push({
        type: "row",
        cells: [
          r.building_name,
          r.energy_class ?? "—",
          r.energy_intensity != null
            ? r.energy_intensity.toFixed(0)
            : "—",
          r.meps_2030_gap != null ? r.meps_2030_gap.toFixed(0) : "—",
          r.crrem_stranding_year != null
            ? String(r.crrem_stranding_year)
            : "—",
          dataGapLabel(r.data_gap_status),
        ],
        widths: [140, 40, 60, 55, 50, 80],
      });
    }

    lines.push({ type: "space", h: 16 });
    lines.push({
      type: "text",
      text: "EnergyPulse v2.0 – Single Source of Truth. Berakningar ar reproducerbara via lagrad SQL.",
    });
    lines.push({
      type: "text",
      text: "Gap30 = kravgap 2030 (kWh/m2). Riskar = CRREM klimatriskar. Data = datakvalitet.",
    });

    const pdf = buildSimplePdf(lines);
    const fileBase64 = pdfToBase64(pdf);
    const fileName = `energypulse_performance_${year}_${today}.pdf`;

    logger.info("export.pdf.done", { rows: rows.length, fileName });

    return { success: true, data: { fileBase64, fileName } };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN",
    };
  }
}
