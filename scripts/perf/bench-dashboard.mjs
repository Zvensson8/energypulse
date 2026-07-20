/**
 * Benchmark dashboard-related queries. Target: < 3000 ms.
 *
 * Usage:
 *   node --env-file=.env.local scripts/perf/bench-dashboard.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const YEAR = Number(process.env.PERF_END_YEAR ?? new Date().getFullYear() - 1);
const TARGET_MS = Number(process.env.PERF_DASHBOARD_TARGET_MS ?? 3000);

if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function time(label, fn) {
  const t0 = performance.now();
  const result = await fn();
  const ms = performance.now() - t0;
  return { label, ms, result };
}

async function main() {
  const runs = [];

  runs.push(
    await time("performance_indicators year", async () => {
      const { data, error, count } = await sb
        .from("performance_indicators")
        .select(
          "building_id, energy_intensity, meps_2030_gap, crrem_stranding_year, data_gap_status, data_completeness_percent, total_energy_kwh",
          { count: "exact" }
        )
        .eq("year", YEAR)
        .limit(500);
      if (error) throw error;
      return { rows: data?.length ?? 0, count };
    })
  );

  runs.push(
    await time("kpi aggregate (client-side)", async () => {
      const { data, error } = await sb
        .from("performance_indicators")
        .select(
          "total_energy_kwh, energy_intensity, meps_2030_gap, crrem_stranding_year, data_gap_status, data_completeness_percent"
        )
        .eq("year", YEAR);
      if (error) throw error;
      const rows = data ?? [];
      const totalEnergy = rows.reduce(
        (s, r) => s + Number(r.total_energy_kwh ?? 0),
        0
      );
      const incomplete = rows.filter(
        (r) => r.data_gap_status === "INCOMPLETE_DATA"
      ).length;
      return { n: rows.length, totalEnergy, incomplete };
    })
  );

  runs.push(
    await time("buildings join sample", async () => {
      const { data: pi } = await sb
        .from("performance_indicators")
        .select("building_id")
        .eq("year", YEAR)
        .limit(200);
      const ids = [...new Set((pi ?? []).map((p) => p.building_id))];
      if (!ids.length) return { buildings: 0 };
      const { data, error } = await sb
        .from("buildings")
        .select("id, name, property_id")
        .in("id", ids);
      if (error) throw error;
      return { buildings: data?.length ?? 0 };
    })
  );

  // Parallel dashboard-like burst (3 queries as UI does)
  runs.push(
    await time("parallel dashboard burst", async () => {
      const t0 = performance.now();
      await Promise.all([
        sb
          .from("performance_indicators")
          .select("*", { count: "exact" })
          .eq("year", YEAR)
          .limit(500),
        sb
          .from("performance_indicators")
          .select("data_gap_status")
          .eq("year", YEAR),
        sb
          .from("actions")
          .select("investment_cost, estimated_saving_kwh, status")
          .in("status", ["proposed", "approved", "in_progress"])
          .limit(500),
      ]);
      return { parallel_ms: performance.now() - t0 };
    })
  );

  const total = runs.reduce((s, r) => s + r.ms, 0);
  const worst = Math.max(...runs.map((r) => r.ms));
  const report = {
    year: YEAR,
    target_ms: TARGET_MS,
    runs: runs.map((r) => ({
      label: r.label,
      ms: Math.round(r.ms),
      detail: r.result,
    })),
    sum_ms: Math.round(total),
    worst_ms: Math.round(worst),
    pass: worst < TARGET_MS,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    console.error(
      `FAIL: worst query ${report.worst_ms}ms >= target ${TARGET_MS}ms`
    );
    process.exit(2);
  }
  console.log(`PASS: dashboard queries under ${TARGET_MS}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
