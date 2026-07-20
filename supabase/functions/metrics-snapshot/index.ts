/**
 * Edge Function: periodic ops metrics snapshot + calc latency probe
 *
 * POST /functions/v1/metrics-snapshot
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

Deno.serve(async (_req) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: snapshot, error } = await sb.rpc("snapshot_ops_metrics");
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Calculation latency probe on a random building with consumption
  const { data: sample } = await sb
    .from("energy_consumption")
    .select("building_id, year")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let calcLatencyMs: number | null = null;
  if (sample?.building_id) {
    const t0 = performance.now();
    await sb.rpc("calculate_yearly_performance", {
      p_building_id: sample.building_id,
      p_year: sample.year,
      p_override: false,
      p_override_reason: null,
    });
    calcLatencyMs = Math.round(performance.now() - t0);
    await sb.from("ops_metrics").insert({
      metric_name: "calc_latency_ms",
      metric_value: calcLatencyMs,
      dimensions: {
        building_id: sample.building_id,
        year: sample.year,
      },
    });
  }

  // Override frequency (7d) already in snapshot; also store import failure rate proxy
  const since7 = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const { count: dead } = await sb
    .from("ingestion_dead_letters")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since7);
  const { count: ingestLogs } = await sb
    .from("data_quality_logs")
    .select("id", { count: "exact", head: true })
    .eq("operation", "INGESTION_BATCH")
    .gte("changed_at", since7);

  const failureRate =
    (ingestLogs ?? 0) + (dead ?? 0) > 0
      ? (dead ?? 0) / ((ingestLogs ?? 0) + (dead ?? 0))
      : 0;

  await sb.from("ops_metrics").insert({
    metric_name: "import_failure_rate_7d",
    metric_value: failureRate,
    dimensions: {
      dead_letters: dead ?? 0,
      ingest_batches: ingestLogs ?? 0,
    },
  });

  return new Response(
    JSON.stringify({
      ok: true,
      snapshot,
      calc_latency_ms: calcLatencyMs,
      import_failure_rate_7d: failureRate,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
