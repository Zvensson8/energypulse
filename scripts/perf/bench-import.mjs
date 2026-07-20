/**
 * Benchmark import of 12 months for one building. Target: < 60_000 ms.
 *
 * Simulates ingestion path: batch insert + calculate_yearly_performance.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_MS = Number(process.env.PERF_IMPORT_TARGET_MS ?? 60_000);
const YEAR = Number(process.env.PERF_END_YEAR ?? new Date().getFullYear() - 1);

if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const t0 = performance.now();

  const { data: sources } = await sb.from("energy_sources").select("id, name");
  const el = sources?.find((s) => /el/i.test(s.name));
  const fv = sources?.find((s) => /fjärr|fjarr|district/i.test(s.name));
  if (!el || !fv) throw new Error("energy_sources seed missing");

  const tag = `import-bench-${Date.now()}`;
  const { data: portfolio } = await sb
    .from("portfolios")
    .insert({ name: tag, base_currency: "SEK" })
    .select("id")
    .single();

  const { data: property } = await sb
    .from("properties")
    .insert({
      portfolio_id: portfolio.id,
      name: tag,
      municipality: "Stockholm",
      status: "active",
    })
    .select("id")
    .single();

  const { data: building } = await sb
    .from("buildings")
    .insert({
      property_id: property.id,
      name: tag,
      primary_use: "office",
    })
    .select("id")
    .single();

  await sb.from("areas").insert({
    building_id: building.id,
    valid_from: "2018-01-01",
    a_temp: 8000,
    quality_class: "B",
    source: "bench",
  });

  const tInsert0 = performance.now();
  const rows = [];
  for (let m = 1; m <= 12; m++) {
    rows.push({
      building_id: building.id,
      energy_source_id: el.id,
      year: YEAR,
      month: m,
      consumption_kwh: 50_000 + m * 100,
      quality_class: "A",
    });
    rows.push({
      building_id: building.id,
      energy_source_id: fv.id,
      year: YEAR,
      month: m,
      consumption_kwh: 70_000,
      quality_class: "A",
    });
  }
  const { error: iErr } = await sb.from("energy_consumption").insert(rows);
  if (iErr) throw iErr;
  const insertMs = performance.now() - tInsert0;

  const tCalc0 = performance.now();
  const { data: pi, error: cErr } = await sb.rpc("calculate_yearly_performance", {
    p_building_id: building.id,
    p_year: YEAR,
    p_override: false,
    p_override_reason: null,
  });
  if (cErr) throw cErr;
  const calcMs = performance.now() - tCalc0;
  const totalMs = performance.now() - t0;

  // cleanup
  await sb.from("energy_consumption").delete().eq("building_id", building.id);
  await sb.from("performance_indicators").delete().eq("building_id", building.id);
  await sb.from("areas").delete().eq("building_id", building.id);
  await sb.from("buildings").delete().eq("id", building.id);
  await sb.from("properties").delete().eq("id", property.id);
  await sb.from("portfolios").delete().eq("id", portfolio.id);

  const report = {
    target_ms: TARGET_MS,
    insert_ms: Math.round(insertMs),
    calc_ms: Math.round(calcMs),
    total_ms: Math.round(totalMs),
    rows: rows.length,
    data_gap_status: (Array.isArray(pi) ? pi[0] : pi)?.data_gap_status,
    pass: totalMs < TARGET_MS,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(2);
  console.log(`PASS: 12-month import+calc under ${TARGET_MS}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
