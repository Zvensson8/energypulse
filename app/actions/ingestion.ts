"use server";

/**
 * EnergyPulse v2.0 Fas 2 – Modular Ingestion Engine (Server Actions).
 *
 * Pipeline:
 *   1. parseImportFile (CSV/Excel)
 *   2. suggest/merge column mapping
 *   3. hard business validation (negative, YoY>30%, area coverage, data_gap_config)
 *   4. preview OR batch upsert + dead-letter + calculate_yearly_performance
 *
 * No UI – call these from Fas 3 forms / React Query mutations.
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import {
  ingestionPreviewRequestSchema,
  ingestionCommitRequestSchema,
  retryDeadLettersSchema,
} from "@/lib/validations/ingestion";
import {
  runIngestionPreview,
  runIngestionCommit,
} from "@/lib/ingestion/pipeline";
import {
  listPendingDeadLetters,
  markDeadLetterResolved,
  markDeadLetterRetry,
} from "@/lib/ingestion/dead-letter";
import { mergeColumnMapping } from "@/lib/ingestion/map-columns";
import { parseImportFile } from "@/lib/ingestion/parse";
import {
  loadValidationContext,
  validateMappedRows,
} from "@/lib/ingestion/validate";
import { batchUpsertEnergyConsumption } from "@/lib/ingestion/upsert";
import type {
  IngestionCommitResult,
  IngestionPreviewResult,
} from "@/lib/ingestion/types";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

function toError(e: unknown): ActionResult<never> {
  const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
  if (message === "UNAUTHORIZED") {
    return { success: false, error: "Authentication required", code: "UNAUTHORIZED" };
  }
  if (message === "FORBIDDEN" || message.startsWith("FORBIDDEN_ROLE")) {
    return { success: false, error: "Insufficient permissions", code: "FORBIDDEN" };
  }
  return { success: false, error: message, code: "ERROR" };
}

/**
 * Preview import: parse + map + validate. No database writes.
 *
 * @example
 * ```ts
 * const result = await previewEnergyConsumptionImport({
 *   fileBase64: btoa(csvText),
 *   fileName: "forbrukning_2024.csv",
 *   dryRun: true,
 * });
 * ```
 */
export async function previewEnergyConsumptionImport(
  raw: unknown
): Promise<ActionResult<IngestionPreviewResult>> {
  try {
    const input = ingestionPreviewRequestSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    logger.info("ingestion.preview.start", {
      userId: user.id,
      fileName: input.fileName,
      entity: input.entity,
    });

    const data = await runIngestionPreview(supabase, {
      ...input,
      entity: "energy_consumption",
      dryRun: true,
    });

    return { success: true, data };
  } catch (e) {
    logger.error("ingestion.preview.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return toError(e);
  }
}

/**
 * Commit import: full pipeline with upsert, dead letters, and
 * automatic calculate_yearly_performance for affected building/years.
 *
 * @example
 * ```ts
 * // After user accepts preview mapping:
 * const result = await commitEnergyConsumptionImport({
 *   fileBase64,
 *   fileName: "forbrukning_2024.csv",
 *   columnMapping: preview.appliedMapping,
 *   acceptWarnings: true,
 *   recalculatePerformance: true,
 * });
 *
 * // result.data.performanceRecalculated → data_gap_status per building/year
 * ```
 */
export async function commitEnergyConsumptionImport(
  raw: unknown
): Promise<ActionResult<IngestionCommitResult>> {
  try {
    const input = ingestionCommitRequestSchema.parse({
      ...(raw as object),
      dryRun: false,
    });
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    logger.info("ingestion.commit.start", {
      userId: user.id,
      fileName: input.fileName,
    });

    const data = await runIngestionCommit(supabase, {
      ...input,
      entity: "energy_consumption",
      dryRun: false,
    });

    logger.info("ingestion.commit.done", {
      userId: user.id,
      batchId: data.batchId,
      upserted: data.upsertedCount,
      deadLetters: data.deadLettersPersisted,
      performanceJobs: data.performanceRecalculated.length,
    });

    return { success: true, data };
  } catch (e) {
    logger.error("ingestion.commit.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return toError(e);
  }
}

/**
 * Suggest column mapping for a file without full validation (fast UI step).
 */
export async function suggestImportColumnMapping(raw: {
  fileBase64: string;
  fileName: string;
}): Promise<
  ActionResult<{
    headers: string[];
    suggestedMapping: IngestionPreviewResult["suggestedMapping"];
    rowCount: number;
  }>
> {
  try {
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const sheet = parseImportFile(raw.fileBase64, raw.fileName);
    const { suggested } = mergeColumnMapping(sheet.headers);

    return {
      success: true,
      data: {
        headers: sheet.headers,
        suggestedMapping: suggested,
        rowCount: sheet.rows.length,
      },
    };
  } catch (e) {
    return toError(e);
  }
}

/**
 * Retry dead-lettered rows for a batch (or specific ids).
 */
export async function retryIngestionDeadLetters(
  raw: unknown
): Promise<
  ActionResult<{
    attempted: number;
    resolved: number;
    stillFailed: number;
  }>
> {
  try {
    const input = retryDeadLettersSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    let letters = await listPendingDeadLetters(supabase, {
      batchId: input.batchId,
    });

    if (input.deadLetterIds?.length) {
      letters = letters.filter((l) => input.deadLetterIds!.includes(l.id));
    }

    const ctx = await loadValidationContext(supabase);
    let resolved = 0;
    let stillFailed = 0;

    for (const letter of letters) {
      const payload =
        typeof letter.payload === "object" && letter.payload !== null
          ? (letter.payload as Record<string, unknown>)
          : {};

      // Re-validate raw payload as a single mapped row (expects canonical keys
      // if original raw used different headers, mapping must already be applied
      // when dead-lettered — we store original raw; retry uses schema parse on payload)
      const mapped = {
        rowNumber: letter.row_number,
        raw: payload,
        mapped: payload,
      };

      const { valid, deadLetters } = validateMappedRows([mapped], ctx);

      if (valid.length === 1) {
        const { upserted, errors } = await batchUpsertEnergyConsumption(
          supabase,
          valid,
          letter.batch_id
        );
        if (upserted > 0 && errors.length === 0) {
          await markDeadLetterResolved(supabase, letter.id);
          resolved += 1;

          // Recalculate performance for this building/year
          const row = valid[0]!;
          await supabase.rpc("calculate_yearly_performance", {
            p_building_id: row.data.building_id,
            p_year: row.data.year,
            p_override: false,
            p_override_reason: null,
          });
          continue;
        }
      }

      const nextRetry = (letter.retry_count ?? 0) + 1;
      const errMsg =
        deadLetters[0]?.error_message ??
        letter.error_message ??
        "retry failed";
      await markDeadLetterRetry(
        supabase,
        letter.id,
        nextRetry,
        input.maxRetries ?? letter.max_retries ?? 3,
        errMsg
      );
      stillFailed += 1;
    }

    logger.info("ingestion.retry.done", {
      userId: user.id,
      attempted: letters.length,
      resolved,
      stillFailed,
    });

    return {
      success: true,
      data: {
        attempted: letters.length,
        resolved,
        stillFailed,
      },
    };
  } catch (e) {
    return toError(e);
  }
}

/**
 * List dead letters for ops UI (Fas 3).
 */
export async function listIngestionDeadLetters(batchId?: string) {
  try {
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const data = await listPendingDeadLetters(supabase, { batchId });
    return { success: true as const, data };
  } catch (e) {
    return toError(e);
  }
}

// Re-export types for consumers
export type { IngestionPreviewResult, IngestionCommitResult };
