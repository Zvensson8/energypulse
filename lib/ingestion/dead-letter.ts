import type { AppSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type { DeadLetterRecord } from "./types";
import { logger } from "@/lib/logger";

/**
 * Dead-letter store for failed ingestion rows.
 *
 * Prefer table `ingestion_dead_letters` (Fas 2 migration).
 * Fallback: persist as data_quality_logs with operation=DEAD_LETTER
 * so the engine works even before the optional table is applied.
 */

export async function persistDeadLetters(
  supabase: AppSupabaseClient,
  letters: DeadLetterRecord[]
): Promise<number> {
  if (letters.length === 0) return 0;
  const log = logger.child({ module: "ingestion.dead-letter" });

  const rows = letters.map((l) => ({
    batch_id: l.batch_id,
    row_number: l.row_number,
    payload: l.payload as Json,
    error_code: l.error_code,
    error_message: l.error_message,
    retry_count: l.retry_count,
    max_retries: l.max_retries,
    status: l.status,
    last_error_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("ingestion_dead_letters").insert(rows);

  if (!error) {
    log.info("Persisted dead letters", { count: rows.length });
    return rows.length;
  }

  // Fallback: table may not exist yet
  log.warn("ingestion_dead_letters unavailable, using data_quality_logs fallback", {
    error: error.message,
  });

  const fallback = letters.map((l) => ({
    entity_type: "ingestion_dead_letter",
    entity_id: l.batch_id,
    field: `row_${l.row_number}`,
    old_value: null,
    new_value: JSON.stringify({
      payload: l.payload,
      error_code: l.error_code,
      error_message: l.error_message,
      retry_count: l.retry_count,
      status: l.status,
    }),
    operation: "DEAD_LETTER",
    override_reason: null,
  }));

  const { error: logErr } = await supabase.from("data_quality_logs").insert(fallback);
  if (logErr) {
    log.error("Failed to persist dead letters", { error: logErr.message });
    return 0;
  }
  return fallback.length;
}

export async function listPendingDeadLetters(
  supabase: AppSupabaseClient,
  opts: { batchId?: string; limit?: number } = {}
) {
  let q = supabase
    .from("ingestion_dead_letters")
    .select("*")
    .in("status", ["pending", "retrying"])
    .order("created_at", { ascending: true })
    .limit(opts.limit ?? 500);

  if (opts.batchId) {
    q = q.eq("batch_id", opts.batchId);
  }

  const { data, error } = await q;
  if (error) {
    logger.warn("listPendingDeadLetters failed", { error: error.message });
    return [];
  }
  return data ?? [];
}

export async function markDeadLetterRetry(
  supabase: AppSupabaseClient,
  id: string,
  retryCount: number,
  maxRetries: number,
  errorMessage?: string
) {
  const status = retryCount >= maxRetries ? "failed" : "retrying";
  await supabase
    .from("ingestion_dead_letters")
    .update({
      retry_count: retryCount,
      status,
      last_error_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq("id", id);
}

export async function markDeadLetterResolved(
  supabase: AppSupabaseClient,
  id: string
) {
  await supabase
    .from("ingestion_dead_letters")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);
}
