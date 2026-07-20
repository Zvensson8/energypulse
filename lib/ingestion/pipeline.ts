import { randomUUID } from "crypto";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import type {
  IngestionCommitRequest,
  IngestionPreviewRequest,
} from "@/lib/validations/ingestion";
import { mappingCoverage, mergeColumnMapping, applyColumnMapping } from "./map-columns";
import { parseImportFile } from "./parse";
import { loadValidationContext, validateMappedRows } from "./validate";
import { batchUpsertEnergyConsumption } from "./upsert";
import { persistDeadLetters } from "./dead-letter";
import type {
  IngestionCommitResult,
  IngestionPreviewResult,
  ValidatedConsumptionRow,
} from "./types";
import { logger } from "@/lib/logger";

async function runPreviewCore(
  supabase: AppSupabaseClient,
  input: IngestionPreviewRequest,
  batchId: string
): Promise<{
  preview: IngestionPreviewResult;
  valid: ValidatedConsumptionRow[];
  deadLetters: Array<{
    rowNumber: number;
    payload: Record<string, unknown>;
    error_code: string;
    error_message: string;
  }>;
}> {
  const log = logger.child({ module: "ingestion.pipeline", batchId });
  const sheet = parseImportFile(input.fileBase64, input.fileName);

  if (sheet.rows.length > (input.maxRows ?? 20_000)) {
    throw new Error(
      `Filen har ${sheet.rows.length} rader (max ${input.maxRows ?? 20_000})`
    );
  }

  const { suggested, applied } = mergeColumnMapping(
    sheet.headers,
    input.columnMapping
  );

  const coverage = mappingCoverage(applied);
  if (coverage.missingRequired.length > 0) {
    log.warn("Incomplete column mapping", { missing: coverage.missingRequired });
  }

  const mapped = applyColumnMapping(sheet, applied);
  const ctx = await loadValidationContext(
    supabase,
    input.building_id ? [input.building_id] : undefined
  );
  const { valid, issues, deadLetters, dataGapNotes, areaCoverageNotes } =
    validateMappedRows(mapped, ctx);

  // Mapping-level errors
  for (const field of coverage.missingRequired) {
    issues.unshift({
      rowNumber: 0,
      severity: "error",
      code: "MAPPING_MISSING_FIELD",
      message: `Kolumnmapping saknar obligatoriskt fält: ${field}`,
      field,
    });
  }

  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const errorCount = issues.filter((i) => i.severity === "error").length;

  const preview: IngestionPreviewResult = {
    ok: errorCount === 0 && coverage.missingRequired.length === 0,
    batchId,
    entity: input.entity ?? "energy_consumption",
    fileName: input.fileName,
    headers: sheet.headers,
    suggestedMapping: suggested,
    appliedMapping: applied,
    totalRows: sheet.rows.length,
    validCount: valid.length,
    warningCount,
    errorCount,
    previewRows: valid.slice(0, 50),
    issues: issues.slice(0, 500),
    deadLetterCount: deadLetters.length,
    dataGapNotes,
    areaCoverageNotes: [...new Set(areaCoverageNotes)].slice(0, 50),
  };

  log.info("Preview complete", {
    totalRows: preview.totalRows,
    validCount: preview.validCount,
    errorCount: preview.errorCount,
    warningCount: preview.warningCount,
  });

  return { preview, valid, deadLetters };
}

/**
 * Steg 1: parse → map → validate → preview (inga writes).
 */
export async function runIngestionPreview(
  supabase: AppSupabaseClient,
  input: IngestionPreviewRequest
): Promise<IngestionPreviewResult> {
  const batchId = randomUUID();
  const { preview } = await runPreviewCore(supabase, input, batchId);
  return preview;
}

/**
 * Steg 2: full pipeline + batch upsert + dead letters + optional recalculate.
 */
export async function runIngestionCommit(
  supabase: AppSupabaseClient,
  input: IngestionCommitRequest
): Promise<IngestionCommitResult> {
  const batchId = input.batchId ?? randomUUID();
  const log = logger.child({ module: "ingestion.commit", batchId });

  const { preview, valid, deadLetters } = await runPreviewCore(
    supabase,
    { ...input, dryRun: false },
    batchId
  );

  const hardErrors = preview.issues.filter((i) => i.severity === "error");
  if (hardErrors.length > 0 && !input.acceptWarnings) {
    // Still allow commit of valid rows if there are only per-row errors
    // (dead-lettered). Block only if mapping is broken (no valid rows).
    if (valid.length === 0) {
      return {
        ...preview,
        ok: false,
        upsertedCount: 0,
        deadLettersPersisted: 0,
        performanceRecalculated: [],
        committed: false,
      };
    }
  }

  // Drop warning-only rows if acceptWarnings is false? Spec: warnings flag, still import.
  // We import all valid rows; warnings are informational.
  const rowsToUpsert = valid;

  const { upserted, errors } = await batchUpsertEnergyConsumption(
    supabase,
    rowsToUpsert,
    batchId
  );

  const letters = deadLetters.map((d) => ({
    batch_id: batchId,
    row_number: d.rowNumber,
    payload: d.payload,
    error_code: d.error_code,
    error_message: d.error_message,
    retry_count: 0,
    max_retries: 3,
    status: "pending" as const,
  }));

  const deadLettersPersisted = await persistDeadLetters(supabase, letters);

  const performanceRecalculated: IngestionCommitResult["performanceRecalculated"] =
    [];

  if (input.recalculatePerformance !== false && upserted > 0) {
    const pairs = new Map<string, { building_id: string; year: number }>();
    for (const r of rowsToUpsert) {
      pairs.set(`${r.data.building_id}|${r.data.year}`, {
        building_id: r.data.building_id,
        year: r.data.year,
      });
    }

    for (const { building_id, year } of pairs.values()) {
      const { data, error } = await supabase.rpc("calculate_yearly_performance", {
        p_building_id: building_id,
        p_year: year,
        p_override: false,
        p_override_reason: null,
      });

      if (error) {
        log.error("calculate_yearly_performance failed", {
          building_id,
          year,
          error: error.message,
        });
        continue;
      }

      // RPC may return a single row or array depending on PostgREST
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        performanceRecalculated.push({
          building_id,
          year,
          data_gap_status: row.data_gap_status,
          data_completeness_percent: Number(row.data_completeness_percent),
        });
      }
    }
  }

  if (errors.length > 0) {
    log.warn("Commit finished with upsert errors", { errors: errors.slice(0, 5) });
  }

  return {
    ...preview,
    ok: upserted > 0 || deadLettersPersisted === preview.totalRows,
    upsertedCount: upserted,
    deadLettersPersisted,
    performanceRecalculated,
    committed: true,
    issues: [
      ...preview.issues,
      ...errors.map((message) => ({
        rowNumber: 0,
        severity: "error" as const,
        code: "UPSERT_ERROR",
        message,
      })),
    ].slice(0, 500),
  };
}
