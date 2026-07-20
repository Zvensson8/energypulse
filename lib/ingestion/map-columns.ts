import {
  ENERGY_CONSUMPTION_HEADER_ALIASES,
  energyConsumptionCanonicalFields,
  type ColumnMapping,
  type EnergyConsumptionCanonicalField,
} from "@/lib/validations/ingestion";
import type { MappedRow, ParsedSheet } from "./types";

function normalizeKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Server-side kolumnmapping: föreslå canonical fields från headers.
 * Användar-override via `explicit` vinner över auto-förslag.
 */
export function suggestColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();

  for (const header of headers) {
    const key = normalizeKey(header);
    const compact = key.replace(/\s/g, "");
    const alias =
      ENERGY_CONSUMPTION_HEADER_ALIASES[key] ??
      ENERGY_CONSUMPTION_HEADER_ALIASES[compact];

    if (alias && !used.has(alias)) {
      mapping[header] = alias;
      used.add(alias);
    } else {
      mapping[header] = "__ignore__";
    }
  }

  return mapping;
}

export function mergeColumnMapping(
  headers: string[],
  explicit?: ColumnMapping
): { suggested: ColumnMapping; applied: ColumnMapping } {
  const suggested = suggestColumnMapping(headers);
  if (!explicit) {
    return { suggested, applied: suggested };
  }

  const applied: ColumnMapping = { ...suggested };
  for (const [src, dest] of Object.entries(explicit)) {
    if (headers.includes(src)) {
      applied[src] = dest;
    }
  }
  return { suggested, applied };
}

/**
 * Apply mapping: source columns → canonical field names.
 * Unmapped / __ignore__ columns are dropped.
 */
export function applyColumnMapping(
  sheet: ParsedSheet,
  mapping: ColumnMapping
): MappedRow[] {
  return sheet.rows.map((raw, index) => {
    const mapped: Record<string, unknown> = {};
    for (const [sourceCol, target] of Object.entries(mapping)) {
      if (target === "__ignore__") continue;
      if (!(sourceCol in raw)) continue;
      mapped[target] = raw[sourceCol];
    }
    return {
      rowNumber: index + 2, // 1-based data row (header = 1)
      raw,
      mapped,
    };
  });
}

export function mappingCoverage(mapping: ColumnMapping): {
  mappedCanonical: EnergyConsumptionCanonicalField[];
  missingRequired: EnergyConsumptionCanonicalField[];
} {
  const mappedCanonical = Object.values(mapping).filter(
    (v): v is EnergyConsumptionCanonicalField =>
      v !== "__ignore__" &&
      (energyConsumptionCanonicalFields as readonly string[]).includes(v)
  );

  const required: EnergyConsumptionCanonicalField[] = [
    "year",
    "month",
    "consumption_kwh",
  ];
  // Need either energy_source_id or energy_source_name
  const hasSource =
    mappedCanonical.includes("energy_source_id") ||
    mappedCanonical.includes("energy_source_name");
  // Need building identity
  const hasBuilding =
    mappedCanonical.includes("building_id") ||
    mappedCanonical.includes("building_external_id") ||
    mappedCanonical.includes("building_name");

  const missingRequired = required.filter((r) => !mappedCanonical.includes(r));
  if (!hasSource) missingRequired.push("energy_source_name");
  if (!hasBuilding) missingRequired.push("building_id");

  return { mappedCanonical, missingRequired };
}
