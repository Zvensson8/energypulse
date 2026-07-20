import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { ParsedSheet } from "./types";
import { logger } from "@/lib/logger";

function decodeBase64(fileBase64: string): Buffer {
  const cleaned = fileBase64.includes(",")
    ? fileBase64.split(",")[1]!
    : fileBase64;
  return Buffer.from(cleaned, "base64");
}

function isExcel(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".xlsm");
}

function normalizeHeader(h: unknown, index: number): string {
  if (h == null || String(h).trim() === "") return `column_${index + 1}`;
  return String(h).trim();
}

/**
 * Parse CSV or Excel (first sheet) into header + row objects.
 * Frikopplat från validering – steget 1 i ingestion-pipelinen.
 */
export function parseImportFile(
  fileBase64: string,
  fileName: string
): ParsedSheet {
  const buffer = decodeBase64(fileBase64);
  const log = logger.child({ module: "ingestion.parse", fileName });

  if (isExcel(fileName)) {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error("Excel-filen saknar kalkylblad");
    }
    const sheet = workbook.Sheets[sheetName]!;
    const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
      sheet,
      { header: 1, defval: null, raw: false }
    ) as unknown[][];

    if (matrix.length === 0) {
      throw new Error("Excel-bladet är tomt");
    }

    const headerRow = (matrix[0] ?? []) as unknown[];
    const headers = headerRow.map((h, i) => normalizeHeader(h, i));
    const rows: Record<string, unknown>[] = [];

    for (let i = 1; i < matrix.length; i++) {
      const line = matrix[i] ?? [];
      if (line.every((c) => c == null || String(c).trim() === "")) continue;
      const obj: Record<string, unknown> = {};
      headers.forEach((h, col) => {
        obj[h] = line[col] ?? null;
      });
      rows.push(obj);
    }

    log.info("Parsed Excel", { rows: rows.length, headers: headers.length });
    return { headers, rows, fileName, format: "xlsx" };
  }

  // CSV – auto-detect ; vs , (vanligt i svenska Excel-exporter)
  const text = buffer.toString("utf-8").replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const semi = (firstLine.match(/;/g) ?? []).length;
  const comma = (firstLine.match(/,/g) ?? []).length;
  const delimiter = semi > comma ? ";" : ",";

  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    delimiter,
    skipEmptyLines: "greedy",
    transformHeader: (h, i) => normalizeHeader(h, i ?? 0),
  });

  if (parsed.errors.length > 0) {
    const fatal = parsed.errors.filter((e) => e.type === "Quotes" || e.type === "FieldMismatch");
    if (fatal.length > 0) {
      log.warn("CSV parse warnings", { errors: fatal.slice(0, 5) });
    }
  }

  const headers =
    parsed.meta.fields?.map((h, i) => normalizeHeader(h, i)) ??
    (parsed.data[0] ? Object.keys(parsed.data[0]) : []);

  log.info("Parsed CSV", { rows: parsed.data.length, headers: headers.length });
  return {
    headers,
    rows: parsed.data,
    fileName,
    format: "csv",
  };
}
