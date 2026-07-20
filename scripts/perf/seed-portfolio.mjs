/**
 * Seed ~180 properties × 8 years monthly energy data for performance testing.
 *
 * Usage:
 *   node --env-file=.env.local scripts/perf/seed-portfolio.mjs
 *   PERF_PROPERTIES=180 PERF_YEARS=8 node --env-file=.env.local scripts/perf/seed-portfolio.mjs
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const PROPERTIES = Number(process.env.PERF_PROPERTIES ?? 180);
const YEARS = Number(process.env.PERF_YEARS ?? 8);
const BATCH = 500;
const END_YEAR = Number(process.env.PERF_END_YEAR ?? new Date().getFullYear() - 1);
const START_YEAR = END_YEAR - YEARS + 1;

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

async function ensureSources() {
  const { data } = await sb.from("energy_sources").select("id, name");
  let el = data?.find((s) => /el/i.test(s.name));
  let fv = data?.find((s) => /fjärr|fjarr|district/i.test(s.name));
  if (!el) {
    const { data: c, error } = await sb
      .from("energy_sources")
      .insert({
        name: "El (nordisk residualmix)",
        source_type: "electricity",
        primary_energy_factor: 1.8,
        emission_factor_kg_co2e_per_kwh: 0.09,
        scope: "scope2",
      })
      .select("id")
      .single();
    if (error) throw error;
    el = c;
  }
  if (!fv) {
    const { data: c, error } = await sb
      .from("energy_sources")
      .insert({
        name: "Fjärrvärme (svensk medel)",
        source_type: "district_heating",
        primary_energy_factor: 0.7,
        emission_factor_kg_co2e_per_kwh: 0.045,
        scope: "scope2",
      })
      .select("id")
      .single();
    if (error) throw error;
    fv = c;
  }
  return { el: el.id, fv: fv.id };
}

async function insertBatches(table, rows) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await sb.from(table).insert(chunk);
    if (error) throw new Error(`${table} batch ${i}: ${error.message}`);
  }
}

async function main() {
  const t0 = Date.now();
  log(`Seeding ${PROPERTIES} properties × ${YEARS} years (${START_YEAR}–${END_YEAR})`);
  const { el, fv } = await ensureSources();

  const { data: portfolio, error: pErr } = await sb
    .from("portfolios")
    .insert({
      name: `PERF Portfolio ${Date.now()}`,
      description: "Performance test seed – safe to delete",
      base_currency: "SEK",
    })
    .select("id")
    .single();
  if (pErr) throw pErr;

  const propertyRows = [];
  for (let i = 0; i < PROPERTIES; i++) {
    propertyRows.push({
      portfolio_id: portfolio.id,
      name: `PERF Fastighet ${String(i + 1).padStart(3, "0")}`,
      external_id: `PERF-${portfolio.id.slice(0, 8)}-${i + 1}`,
      municipality: ["Stockholm", "Göteborg", "Malmö", "Uppsala"][i % 4],
      status: "active",
      ownership_type: "owned",
    });
  }
  await insertBatches("properties", propertyRows);

  const { data: properties } = await sb
    .from("properties")
    .select("id")
    .eq("portfolio_id", portfolio.id);
  if (!properties?.length) throw new Error("No properties created");

  const buildingRows = properties.map((p, i) => ({
    property_id: p.id,
    name: `Hus ${i + 1}`,
    construction_year: 1970 + (i % 40),
    primary_use: "office",
  }));
  await insertBatches("buildings", buildingRows);

  const { data: buildings } = await sb
    .from("buildings")
    .select("id, property_id")
    .in(
      "property_id",
      properties.map((p) => p.id)
    );
  if (!buildings?.length) throw new Error("No buildings");

  const areaRows = buildings.map((b) => ({
    building_id: b.id,
    valid_from: "2015-01-01",
    a_temp: 3000 + Math.floor(Math.random() * 7000),
    bta: 4000,
    source: "perf-seed",
    quality_class: "C",
  }));
  await insertBatches("areas", areaRows);

  // Monthly consumption: buildings × years × 12 × 2 sources
  const expected =
    buildings.length * YEARS * 12 * 2;
  log(`Inserting ~${expected} energy_consumption rows…`);

  let buffer = [];
  let inserted = 0;
  for (const b of buildings) {
    for (let y = START_YEAR; y <= END_YEAR; y++) {
      for (let m = 1; m <= 12; m++) {
        buffer.push({
          building_id: b.id,
          energy_source_id: el,
          year: y,
          month: m,
          consumption_kwh: 30_000 + (m * 200) + Math.floor(Math.random() * 5000),
          is_estimated: false,
          quality_class: "B",
        });
        buffer.push({
          building_id: b.id,
          energy_source_id: fv,
          year: y,
          month: m,
          consumption_kwh:
            45_000 +
            (m <= 3 || m >= 11 ? 15_000 : 0) +
            Math.floor(Math.random() * 3000),
          is_estimated: false,
          quality_class: "B",
        });
        if (buffer.length >= BATCH) {
          await insertBatches("energy_consumption", buffer);
          inserted += buffer.length;
          buffer = [];
          if (inserted % 10_000 === 0) log(`  …${inserted} rows`);
        }
      }
    }
  }
  if (buffer.length) {
    await insertBatches("energy_consumption", buffer);
    inserted += buffer.length;
  }

  // Calculate latest year for all buildings (dashboard path)
  log(`Calculating performance for year ${END_YEAR}…`);
  let calcOk = 0;
  const calcT0 = Date.now();
  for (const b of buildings) {
    const { error } = await sb.rpc("calculate_yearly_performance", {
      p_building_id: b.id,
      p_year: END_YEAR,
      p_override: false,
      p_override_reason: null,
    });
    if (!error) calcOk += 1;
  }
  const calcMs = Date.now() - calcT0;

  const totalMs = Date.now() - t0;
  const summary = {
    portfolio_id: portfolio.id,
    properties: properties.length,
    buildings: buildings.length,
    years: YEARS,
    consumption_rows: inserted,
    calc_ok: calcOk,
    calc_ms: calcMs,
    calc_per_building_ms: Math.round(calcMs / Math.max(calcOk, 1)),
    total_ms: totalMs,
  };
  log("DONE", JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
