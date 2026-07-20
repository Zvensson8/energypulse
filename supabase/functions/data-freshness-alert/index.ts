/**
 * Edge Function: data freshness alert
 *
 * Schedule via Supabase cron / external scheduler (e.g. hourly):
 *   POST /functions/v1/data-freshness-alert
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   FRESHNESS_MAX_DAYS (default 45)
 *   ALERT_WEBHOOK_URL (optional Slack/Teams webhook)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const MAX_DAYS = Number(Deno.env.get("FRESHNESS_MAX_DAYS") ?? "45");
const WEBHOOK = Deno.env.get("ALERT_WEBHOOK_URL");

Deno.serve(async (_req) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, key, {
    auth: { persistSession: false },
  });

  const t0 = performance.now();

  const { data: stale, error: sErr } = await sb.rpc("list_stale_buildings", {
    p_max_age_days: MAX_DAYS,
  });
  if (sErr) {
    return json({ ok: false, error: sErr.message }, 500);
  }

  const { data: snapshot, error: mErr } = await sb.rpc("snapshot_ops_metrics");
  if (mErr) {
    return json({ ok: false, error: mErr.message }, 500);
  }

  // Import failure rate (dead letters last 24h vs success proxy)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: dead24 } = await sb
    .from("ingestion_dead_letters")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  const { count: overrides24 } = await sb
    .from("data_quality_logs")
    .select("id", { count: "exact", head: true })
    .eq("operation", "OVERRIDE")
    .gte("changed_at", since);

  const latencyMs = Math.round(performance.now() - t0);
  await sb.from("ops_metrics").insert({
    metric_name: "edge_data_freshness_latency_ms",
    metric_value: latencyMs,
    dimensions: { fn: "data-freshness-alert" },
  });

  const payload = {
    ok: true,
    stale_buildings: stale?.length ?? 0,
    stale_sample: (stale ?? []).slice(0, 10),
    snapshot,
    import_dead_letters_24h: dead24 ?? 0,
    overrides_24h: overrides24 ?? 0,
    latency_ms: latencyMs,
    threshold_days: MAX_DAYS,
  };

  if (WEBHOOK && (stale?.length ?? 0) > 0) {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `EnergyPulse freshness alert: ${stale!.length} buildings older than ${MAX_DAYS}d. Dead-letters 24h=${dead24}. Overrides 24h=${overrides24}.`,
      }),
    });
  }

  return json(payload, 200);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
