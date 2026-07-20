import type { AppSupabaseClient } from "@/lib/supabase/server";
import type { Tables, QualityClass } from "@/lib/supabase/database.types";
import { energyConsumptionImportRawSchema } from "@/lib/validations/energy-consumption";
import { energyConsumptionInsertSchema } from "@/lib/validations/energy-consumption";
import type { RowIssue } from "@/lib/validations/ingestion";
import {
  DEFAULT_MAX_MISSING_MONTHS,
  YOY_DEVIATION_WARNING_THRESHOLD,
  type MappedRow,
  type ValidatedConsumptionRow,
} from "./types";
import { logger } from "@/lib/logger";

type Area = Tables<"areas">;
type EnergySource = Tables<"energy_sources">;
type Building = Tables<"buildings">;

export interface ValidationContext {
  buildingsById: Map<string, Building>;
  buildingsByExternalId: Map<string, Building>;
  buildingsByName: Map<string, Building>;
  energySourcesById: Map<string, EnergySource>;
  energySourcesByName: Map<string, EnergySource>;
  areasByBuilding: Map<string, Area[]>;
  /** building_id|source_id|year|month -> kwh (for YoY) */
  priorYearMonthly: Map<string, number>;
  maxMissingMonths: number;
  warningThresholdMonths: number;
}

export async function loadValidationContext(
  supabase: AppSupabaseClient,
  buildingIdsHint?: string[]
): Promise<ValidationContext> {
  const log = logger.child({ module: "ingestion.validate.context" });

  let buildingsQuery = supabase.from("buildings").select("*");
  if (buildingIdsHint?.length) {
    buildingsQuery = buildingsQuery.in("id", buildingIdsHint);
  }

  const [
    { data: buildings, error: bErr },
    { data: properties, error: pErr },
    { data: sources, error: sErr },
    { data: areas, error: aErr },
    { data: gapConfig, error: gErr },
  ] = await Promise.all([
    buildingsQuery,
    supabase.from("properties").select("id, external_id, name"),
    supabase.from("energy_sources").select("*"),
    supabase.from("areas").select("*"),
    supabase
      .from("data_gap_config")
      .select("*")
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (bErr) log.error("Failed to load buildings", { error: bErr.message });
  if (pErr) log.error("Failed to load properties", { error: pErr.message });
  if (sErr) log.error("Failed to load energy_sources", { error: sErr.message });
  if (aErr) log.error("Failed to load areas", { error: aErr.message });
  if (gErr) log.warn("Failed to load data_gap_config", { error: gErr.message });

  const propertyById = new Map(
    (properties ?? []).map((p) => [p.id, p] as const)
  );

  const buildingsById = new Map<string, Building>();
  const buildingsByExternalId = new Map<string, Building>();
  const buildingsByName = new Map<string, Building>();

  for (const b of buildings ?? []) {
    buildingsById.set(b.id, b);
    const prop = propertyById.get(b.property_id);
    if (prop?.external_id) {
      buildingsByExternalId.set(prop.external_id.toLowerCase(), b);
    }
    buildingsByName.set(b.name.toLowerCase(), b);
    if (prop?.name) {
      buildingsByName.set(prop.name.toLowerCase(), b);
    }
  }

  const energySourcesById = new Map<string, EnergySource>();
  const energySourcesByName = new Map<string, EnergySource>();
  for (const s of sources ?? []) {
    energySourcesById.set(s.id, s);
    energySourcesByName.set(s.name.toLowerCase(), s);
  }

  const areasByBuilding = new Map<string, Area[]>();
  for (const a of areas ?? []) {
    const list = areasByBuilding.get(a.building_id) ?? [];
    list.push(a);
    areasByBuilding.set(a.building_id, list);
  }

  // Prior year monthly totals for YoY check (all buildings in context)
  const ids = [...buildingsById.keys()];
  const priorYearMonthly = new Map<string, number>();
  if (ids.length > 0) {
    const { data: prior } = await supabase
      .from("energy_consumption")
      .select("building_id, energy_source_id, year, month, consumption_kwh")
      .in("building_id", ids)
      .is("space_id", null);

    for (const r of prior ?? []) {
      const key = `${r.building_id}|${r.energy_source_id}|${r.year}|${r.month}`;
      priorYearMonthly.set(key, Number(r.consumption_kwh));
    }
  }

  return {
    buildingsById,
    buildingsByExternalId,
    buildingsByName,
    energySourcesById,
    energySourcesByName,
    areasByBuilding,
    priorYearMonthly,
    maxMissingMonths:
      gapConfig?.max_missing_months_before_incomplete ?? DEFAULT_MAX_MISSING_MONTHS,
    warningThresholdMonths: gapConfig?.warning_threshold_months ?? 1,
  };
}

function resolveBuilding(
  ctx: ValidationContext,
  mapped: Record<string, unknown>
): Building | null {
  if (mapped.building_id && typeof mapped.building_id === "string") {
    const b = ctx.buildingsById.get(mapped.building_id);
    if (b) return b;
  }
  if (mapped.building_external_id && typeof mapped.building_external_id === "string") {
    const b = ctx.buildingsByExternalId.get(
      mapped.building_external_id.toLowerCase()
    );
    if (b) return b;
  }
  if (mapped.building_name && typeof mapped.building_name === "string") {
    const b = ctx.buildingsByName.get(mapped.building_name.toLowerCase());
    if (b) return b;
  }
  return null;
}

function resolveEnergySource(
  ctx: ValidationContext,
  mapped: Record<string, unknown>
): EnergySource | null {
  if (mapped.energy_source_id && typeof mapped.energy_source_id === "string") {
    const s = ctx.energySourcesById.get(mapped.energy_source_id);
    if (s) return s;
  }
  if (mapped.energy_source_name && typeof mapped.energy_source_name === "string") {
    const s = ctx.energySourcesByName.get(mapped.energy_source_name.toLowerCase());
    if (s) return s;
  }
  return null;
}

/**
 * Area-version must cover the consumption period (year-month).
 * valid_from <= last day of month AND (valid_to IS NULL OR valid_to >= first day of month)
 */
export function areaCoversPeriod(
  areas: Area[],
  year: number,
  month: number
): Area | null {
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const covering = areas
    .filter((a) => {
      const fromOk = a.valid_from <= periodEnd;
      const toOk = a.valid_to == null || a.valid_to >= periodStart;
      return fromOk && toOk;
    })
    .sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1));

  return covering[0] ?? null;
}

function issue(
  rowNumber: number,
  severity: "error" | "warning",
  code: string,
  message: string,
  field?: string,
  raw?: Record<string, unknown>
): RowIssue {
  return { rowNumber, severity, code, message, field, raw };
}

/**
 * Hård affärsvalidering per rad:
 * - Zod schema
 * - Negativa värden → reject
 * - YoY avvikelse > 30 % → warning + quality flag
 * - Area-version täcker perioden
 * - FK resolution (building, energy_source)
 */
export function validateMappedRows(
  rows: MappedRow[],
  ctx: ValidationContext
): {
  valid: ValidatedConsumptionRow[];
  issues: RowIssue[];
  deadLetters: Array<{
    rowNumber: number;
    payload: Record<string, unknown>;
    error_code: string;
    error_message: string;
  }>;
  dataGapNotes: string[];
  areaCoverageNotes: string[];
} {
  const valid: ValidatedConsumptionRow[] = [];
  const issues: RowIssue[] = [];
  const deadLetters: Array<{
    rowNumber: number;
    payload: Record<string, unknown>;
    error_code: string;
    error_message: string;
  }> = [];
  const dataGapNotes: string[] = [];
  const areaCoverageNotes: string[] = [];

  // Track months per building+year+source for gap notes
  const monthPresence = new Map<string, Set<number>>();

  for (const row of rows) {
    const rawResult = energyConsumptionImportRawSchema.safeParse(row.mapped);
    if (!rawResult.success) {
      const msg = rawResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      const err = issue(
        row.rowNumber,
        "error",
        "SCHEMA_VALIDATION",
        msg,
        undefined,
        row.raw
      );
      issues.push(err);

      // Explicit negative value callout
      const kwh = row.mapped.consumption_kwh;
      if (kwh != null && Number(kwh) < 0) {
        issues.push(
          issue(
            row.rowNumber,
            "error",
            "NEGATIVE_VALUE",
            "consumption_kwh får inte vara negativ",
            "consumption_kwh",
            row.raw
          )
        );
      }

      deadLetters.push({
        rowNumber: row.rowNumber,
        payload: row.raw,
        error_code: "SCHEMA_VALIDATION",
        error_message: msg,
      });
      continue;
    }

    const parsed = rawResult.data;
    const building = resolveBuilding(ctx, row.mapped);
    if (!building) {
      const msg =
        "Kunde inte matcha byggnad (building_id / building_external_id / building_name)";
      issues.push(
        issue(row.rowNumber, "error", "BUILDING_NOT_FOUND", msg, "building_id", row.raw)
      );
      deadLetters.push({
        rowNumber: row.rowNumber,
        payload: row.raw,
        error_code: "BUILDING_NOT_FOUND",
        error_message: msg,
      });
      continue;
    }

    const source = resolveEnergySource(ctx, row.mapped);
    if (!source) {
      const msg =
        "Kunde inte matcha energikälla (energy_source_id / energy_source_name)";
      issues.push(
        issue(
          row.rowNumber,
          "error",
          "ENERGY_SOURCE_NOT_FOUND",
          msg,
          "energy_source_name",
          row.raw
        )
      );
      deadLetters.push({
        rowNumber: row.rowNumber,
        payload: row.raw,
        error_code: "ENERGY_SOURCE_NOT_FOUND",
        error_message: msg,
      });
      continue;
    }

    // Area coverage
    const areas = ctx.areasByBuilding.get(building.id) ?? [];
    const area = areaCoversPeriod(areas, parsed.year, parsed.month);
    if (!area) {
      const msg = `Ingen area-version täcker ${parsed.year}-${String(parsed.month).padStart(2, "0")} för byggnad ${building.name}`;
      issues.push(
        issue(row.rowNumber, "error", "AREA_COVERAGE", msg, "year", row.raw)
      );
      areaCoverageNotes.push(msg);
      deadLetters.push({
        rowNumber: row.rowNumber,
        payload: row.raw,
        error_code: "AREA_COVERAGE",
        error_message: msg,
      });
      continue;
    }

    // YoY deviation > 30 %
    const warnings: RowIssue[] = [];
    let quality: QualityClass = parsed.quality_class;
    let yoyDeviation: number | undefined;

    const priorKey = `${building.id}|${source.id}|${parsed.year - 1}|${parsed.month}`;
    const priorKwh = ctx.priorYearMonthly.get(priorKey);
    if (priorKwh != null && priorKwh > 0) {
      yoyDeviation = (parsed.consumption_kwh - priorKwh) / priorKwh;
      if (Math.abs(yoyDeviation) > YOY_DEVIATION_WARNING_THRESHOLD) {
        const pct = (yoyDeviation * 100).toFixed(1);
        const w = issue(
          row.rowNumber,
          "warning",
          "YOY_DEVIATION",
          `Avvikelse ${pct}% mot samma månad föregående år (tröskel ±${YOY_DEVIATION_WARNING_THRESHOLD * 100}%)`,
          "consumption_kwh",
          row.raw
        );
        warnings.push(w);
        issues.push(w);
        // Downgrade quality when anomalous
        if (quality === "A" || quality === "B") {
          quality = "C";
        }
      }
    }

    const insertCandidate = {
      building_id: building.id,
      space_id: parsed.space_id && parsed.space_id.length > 0 ? parsed.space_id : null,
      energy_source_id: source.id,
      year: parsed.year,
      month: parsed.month,
      consumption_kwh: parsed.consumption_kwh,
      is_weather_corrected: parsed.is_weather_corrected,
      is_estimated: parsed.is_estimated,
      quality_class: quality,
    };

    const insertParsed = energyConsumptionInsertSchema.safeParse(insertCandidate);
    if (!insertParsed.success) {
      const msg = insertParsed.error.message;
      issues.push(
        issue(row.rowNumber, "error", "INSERT_SCHEMA", msg, undefined, row.raw)
      );
      deadLetters.push({
        rowNumber: row.rowNumber,
        payload: row.raw,
        error_code: "INSERT_SCHEMA",
        error_message: msg,
      });
      continue;
    }

    const presenceKey = `${building.id}|${source.id}|${parsed.year}`;
    const set = monthPresence.get(presenceKey) ?? new Set<number>();
    set.add(parsed.month);
    monthPresence.set(presenceKey, set);

    valid.push({
      rowNumber: row.rowNumber,
      data: insertParsed.data,
      quality_class: quality,
      warnings,
      yoyDeviation,
    });
  }

  // Data gap config notes (per building+source+year in batch)
  for (const [key, months] of monthPresence) {
    const missing = 12 - months.size;
    const [buildingId, , year] = key.split("|");
    if (missing > ctx.maxMissingMonths) {
      dataGapNotes.push(
        `Building ${buildingId} year ${year}: ${missing} saknade månader i importbatch > tröskel ${ctx.maxMissingMonths} (INCOMPLETE_DATA-risk).`
      );
    } else if (missing >= ctx.warningThresholdMonths && missing > 0) {
      dataGapNotes.push(
        `Building ${buildingId} year ${year}: ${missing} saknade månader ≤ tröskel ${ctx.maxMissingMonths} (EXTRAPOLATED_WARNING vid beräkning).`
      );
    }
  }

  return { valid, issues, deadLetters, dataGapNotes, areaCoverageNotes };
}
