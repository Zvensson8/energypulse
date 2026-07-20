/**
 * EnergyPulse pilot-seed runner
 *
 * 1) Applies supabase/seed/pilot_fastigheter.sql via Management API or psql-less REST
 *    (we re-implement seed in JS for reliability with service_role)
 * 2) Runs calculate_yearly_performance for all pilot buildings × years
 * 3) Demonstrates override on INCOMPLETE building
 * 4) Prints Swedish report (data_gap_status, completeness)
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-pilot.mjs
 *   # or set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Saknar NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PILOT = {
  portfolio: "a1111111-1111-4111-8111-111111111111",
  properties: [
    "b1000001-0001-4001-8001-000000000001",
    "b1000002-0002-4002-8002-000000000002",
    "b1000003-0003-4003-8003-000000000003",
  ],
  buildings: [
    "c1000001-0001-4001-8001-000000000001",
    "c1000002-0002-4002-8002-000000000002",
    "c1000003-0003-4003-8003-000000000003",
    "c1000004-0004-4004-8004-000000000004",
    "c1000005-0005-4005-8005-000000000005",
    "c1000006-0006-4006-8006-000000000006",
  ],
  years: [2023, 2024, 2025],
};

function log(...a) {
  console.log(...a);
}

async function tryRpcSqlFile() {
  // Prefer SQL file via supabase db execute if token available
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF || "jbnttxywunvvvivdfzeh";
  if (!token) return false;

  const sqlPath = resolve(__dirname, "../supabase/seed/pilot_fastigheter.sql");
  let sql = readFileSync(sqlPath, "utf8");
  // Management API may not like psql meta; strip \echo if any
  sql = sql.replace(/^\\.*$/gm, "");

  // Split on COMMIT; run as one query if possible
  const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) {
      const t = await res.text();
      log("SQL API misslyckades, faller tillbaka till JS-seed:", res.status, t.slice(0, 200));
      return false;
    }
    log("✓ pilot_fastigheter.sql körd via Management API");
    return true;
  } catch (e) {
    log("SQL API fel:", e.message);
    return false;
  }
}

/** Minimal JS seed if SQL path unavailable – assumes schema exists */
async function seedViaClient() {
  log("Kör JS-baserad seed (service_role)…");
  // Clean
  for (const bid of PILOT.buildings) {
    await sb.from("energy_consumption").delete().eq("building_id", bid);
    await sb.from("performance_indicators").delete().eq("building_id", bid);
    await sb.from("actions").delete().eq("building_id", bid);
    await sb.from("spaces").delete().eq("building_id", bid);
    await sb.from("areas").delete().eq("building_id", bid);
  }
  for (const pid of PILOT.properties) {
    await sb.from("physical_risks").delete().eq("property_id", pid);
    await sb.from("user_properties").delete().eq("property_id", pid);
    await sb.from("buildings").delete().eq("property_id", pid);
  }
  await sb.from("properties").delete().in("id", PILOT.properties);
  await sb.from("portfolios").delete().eq("id", PILOT.portfolio);

  // Ensure sources
  const sources = [
    {
      name: "El (nordisk residualmix)",
      source_type: "electricity",
      primary_energy_factor: 1.8,
      emission_factor_kg_co2e_per_kwh: 0.09,
      scope: "scope2",
    },
    {
      name: "Fjärrvärme (svensk medel)",
      source_type: "district_heating",
      primary_energy_factor: 0.7,
      emission_factor_kg_co2e_per_kwh: 0.045,
      scope: "scope2",
    },
    {
      name: "Fjärrkyla",
      source_type: "district_cooling",
      primary_energy_factor: 0.6,
      emission_factor_kg_co2e_per_kwh: 0.03,
      scope: "scope2",
    },
  ];
  for (const s of sources) {
    const { data: ex } = await sb
      .from("energy_sources")
      .select("id")
      .eq("name", s.name)
      .maybeSingle();
    if (!ex) await sb.from("energy_sources").insert(s);
  }

  await sb.from("portfolios").insert({
    id: PILOT.portfolio,
    name: "Trophi Pilotportfölj EnergyPulse",
    description:
      "Pilot: tre kommersiella fastigheter (Stockholm, Göteborg, Malmö).",
    base_currency: "SEK",
  });

  await sb.from("properties").insert([
    {
      id: PILOT.properties[0],
      portfolio_id: PILOT.portfolio,
      external_id: "PILOT-STOCKHOLM 1:12",
      name: "Klaraberg Kontor",
      address: "Klarabergsgatan 12, 111 21 Stockholm",
      municipality: "Stockholm",
      climate_zone: "III",
      latitude: 59.3326,
      longitude: 18.0649,
      ownership_type: "owned",
      status: "active",
    },
    {
      id: PILOT.properties[1],
      portfolio_id: PILOT.portfolio,
      external_id: "PILOT-GÖTEBORG 4:8",
      name: "Lindholmen Logistik",
      address: "Lindholmspiren 5, 417 56 Göteborg",
      municipality: "Göteborg",
      climate_zone: "II",
      latitude: 57.7067,
      longitude: 11.9383,
      ownership_type: "owned",
      status: "active",
    },
    {
      id: PILOT.properties[2],
      portfolio_id: PILOT.portfolio,
      external_id: "PILOT-MALMÖ 2:5",
      name: "Västra Hamnen Retail",
      address: "Universitetsgatan 8, 211 18 Malmö",
      municipality: "Malmö",
      climate_zone: "I",
      latitude: 55.6098,
      longitude: 12.9952,
      ownership_type: "leased",
      status: "active",
    },
  ]);

  const buildings = [
    {
      id: PILOT.buildings[0],
      property_id: PILOT.properties[0],
      name: "Hus A – Kontor",
      construction_year: 1987,
      major_renovation_year: 2015,
      primary_use: "office",
      protected_status: false,
    },
    {
      id: PILOT.buildings[1],
      property_id: PILOT.properties[0],
      name: "Hus B – Kontor (K-märkt)",
      construction_year: 1965,
      major_renovation_year: 2008,
      primary_use: "office",
      protected_status: true,
    },
    {
      id: PILOT.buildings[2],
      property_id: PILOT.properties[1],
      name: "Lager 1",
      construction_year: 2001,
      primary_use: "warehouse",
      protected_status: false,
    },
    {
      id: PILOT.buildings[3],
      property_id: PILOT.properties[1],
      name: "Kontorsflygel",
      construction_year: 2003,
      major_renovation_year: 2019,
      primary_use: "office",
      protected_status: false,
    },
    {
      id: PILOT.buildings[4],
      property_id: PILOT.properties[2],
      name: "Butikshus",
      construction_year: 2010,
      primary_use: "retail",
      protected_status: false,
    },
    {
      id: PILOT.buildings[5],
      property_id: PILOT.properties[2],
      name: "Kontor våning 3–5",
      construction_year: 2010,
      major_renovation_year: 2022,
      primary_use: "office",
      protected_status: false,
    },
  ];
  await sb.from("buildings").insert(buildings);

  await sb.from("areas").insert([
    {
      building_id: PILOT.buildings[0],
      valid_from: "2010-01-01",
      valid_to: "2014-12-31",
      a_temp: 8500,
      bta: 9200,
      source: "ritning 2010",
      quality_class: "B",
    },
    {
      building_id: PILOT.buildings[0],
      valid_from: "2015-01-01",
      a_temp: 9100,
      bta: 9800,
      source: "uppmätt efter renovering 2015",
      quality_class: "A",
    },
    {
      building_id: PILOT.buildings[1],
      valid_from: "2008-01-01",
      a_temp: 5800,
      bta: 6400,
      source: "EPC 2008",
      quality_class: "C",
    },
    {
      building_id: PILOT.buildings[2],
      valid_from: "2001-01-01",
      a_temp: 12000,
      bta: 15000,
      source: "ritning",
      quality_class: "B",
    },
    {
      building_id: PILOT.buildings[3],
      valid_from: "2003-01-01",
      valid_to: "2018-12-31",
      a_temp: 2900,
      bta: 3200,
      source: "ritning",
      quality_class: "C",
    },
    {
      building_id: PILOT.buildings[3],
      valid_from: "2019-01-01",
      a_temp: 3100,
      bta: 3400,
      source: "uppmätt 2019",
      quality_class: "A",
    },
    {
      building_id: PILOT.buildings[4],
      valid_from: "2010-01-01",
      a_temp: 4200,
      bta: 4800,
      source: "ritning",
      quality_class: "B",
    },
    {
      building_id: PILOT.buildings[5],
      valid_from: "2010-01-01",
      a_temp: 3300,
      bta: 3600,
      source: "ritning",
      quality_class: "B",
    },
  ]);

  // climate_data
  const season = [1.4, 1.25, 1.1, 0.8, 0.4, 0.1, 0.05, 0.05, 0.3, 0.7, 1.1, 1.35];
  const munis = [
    ["Stockholm", 380],
    ["Göteborg", 340],
    ["Malmö", 300],
  ];
  for (const [muni, base] of munis) {
    for (let y = 2023; y <= 2025; y++) {
      for (let mon = 1; mon <= 12; mon++) {
        await sb.from("climate_data").upsert(
          {
            municipality: muni,
            year: y,
            month: mon,
            heating_degree_days: Math.round(base * season[mon - 1] * 100) / 100,
            cooling_degree_days: [6, 7, 8].includes(mon) ? 20 : 0,
            source: "SMHI-referens pilot-seed",
          },
          { onConflict: "municipality,year,month", ignoreDuplicates: true }
        ).select();
        // ignore upsert errors for partial unique
      }
    }
  }

  const { data: src } = await sb.from("energy_sources").select("id, name");
  const el = src.find((s) => s.name.includes("El (nordisk"));
  const fv = src.find((s) => s.name.includes("Fjärrvärme"));
  const fk = src.find((s) => s.name.includes("Fjärrkyla"));

  const skip = (bid, y, m) => {
    if (bid === PILOT.buildings[0] && y === 2024 && [11, 12].includes(m)) return true;
    if (bid === PILOT.buildings[1] && y === 2025 && m >= 9) return true;
    if (bid === PILOT.buildings[3] && y === 2023 && m === 7) return true;
    if (bid === PILOT.buildings[4] && y === 2025 && m >= 10) return true;
    return false;
  };

  const useOf = Object.fromEntries(buildings.map((b) => [b.id, b.primary_use]));
  const cons = [];
  for (const bid of PILOT.buildings) {
    for (let y = 2023; y <= 2025; y++) {
      for (let m = 1; m <= 12; m++) {
        if (skip(bid, y, m)) continue;
        const use = useOf[bid];
        let elK = 45000 + m * 250;
        let fvK = 65000 + ([1, 2, 12].includes(m) ? 30000 : [6, 7, 8].includes(m) ? -25000 : 0);
        if (use === "warehouse") {
          elK = 55000 + m * 200;
          fvK = 90000 + ([1, 2, 12].includes(m) ? 40000 : [6, 7, 8].includes(m) ? -35000 : 0);
        } else if (use === "retail") {
          elK = 70000 + m * 300;
          fvK = 50000 + ([1, 2, 12].includes(m) ? 25000 : 0);
        }
        if (bid === PILOT.buildings[1]) {
          elK += 15000;
          fvK += 20000;
        }
        elK *= 1 - (y - 2023) * 0.01;
        fvK *= 1 - (y - 2023) * 0.008;
        cons.push({
          building_id: bid,
          energy_source_id: el.id,
          year: y,
          month: m,
          consumption_kwh: Math.round(elK * 1000) / 1000,
          quality_class: "B",
        });
        cons.push({
          building_id: bid,
          energy_source_id: fv.id,
          year: y,
          month: m,
          consumption_kwh: Math.round(Math.max(fvK, 5000) * 1000) / 1000,
          quality_class: "B",
        });
        // OBS: Lägg inte säsongskällor (t.ex. fjärrkyla endast sommar) utan att
        // data_gap-logiken hanterar "förväntade månader per källa" – annars
        // räknas vintermånader som saknade och ger falsk INCOMPLETE_DATA.
      }
    }
  }
  for (let i = 0; i < cons.length; i += 200) {
    const { error } = await sb.from("energy_consumption").insert(cons.slice(i, i + 200));
    if (error) throw error;
  }

  await sb.from("actions").insert([
    {
      building_id: PILOT.buildings[1],
      title: "Tilläggsisolering fasad + fönsterbyte",
      category: "envelope",
      description: "K-märkt hus B – antikvarisk samråd krävs.",
      estimated_saving_kwh: 180000,
      estimated_saving_co2: 12000,
      investment_cost: 4200000,
      currency: "SEK",
      payback_years: 12.5,
      status: "proposed",
      priority_score: 0.82,
      planned_year: 2027,
    },
    {
      building_id: PILOT.buildings[0],
      title: "Uppgradering ventilationsaggregat + VVX",
      category: "hvac",
      estimated_saving_kwh: 95000,
      estimated_saving_co2: 6500,
      investment_cost: 1850000,
      currency: "SEK",
      payback_years: 7.2,
      status: "approved",
      priority_score: 0.71,
      planned_year: 2026,
    },
    {
      building_id: PILOT.buildings[2],
      title: "LED-belysning lager + närvarostyrning",
      category: "lighting",
      estimated_saving_kwh: 120000,
      estimated_saving_co2: 8000,
      investment_cost: 980000,
      currency: "SEK",
      payback_years: 4.1,
      status: "in_progress",
      priority_score: 0.65,
      planned_year: 2026,
    },
    {
      building_id: PILOT.buildings[4],
      title: "Solceller tak butikshus",
      category: "renewable",
      estimated_saving_kwh: 110000,
      estimated_saving_co2: 9000,
      investment_cost: 2100000,
      currency: "SEK",
      payback_years: 9,
      status: "proposed",
      priority_score: 0.58,
      planned_year: 2028,
    },
  ]);

  await sb.from("physical_risks").insert([
    {
      property_id: PILOT.properties[0],
      risk_type: "heat",
      probability: "medium",
      consequence: "medium",
      risk_score: 6,
      source: "SMHI",
      assessed_at: "2025-06-01",
      notes: "Ökad kyllast i innerstad.",
    },
    {
      property_id: PILOT.properties[1],
      risk_type: "flood",
      probability: "medium",
      consequence: "high",
      risk_score: 8,
      source: "MSB",
      assessed_at: "2025-05-15",
      notes: "Lindholmen – havsnivå och skyfall.",
    },
    {
      property_id: PILOT.properties[2],
      risk_type: "heat",
      probability: "high",
      consequence: "medium",
      risk_score: 7.5,
      source: "SMHI",
      assessed_at: "2025-04-20",
      notes: "Värmeböljor Malmö, hög glasad andel.",
    },
  ]);

  // Spaces + tenant encrypt
  const { data: sp1 } = await sb
    .from("spaces")
    .insert({
      building_id: PILOT.buildings[0],
      name: "Plan 4–6 kontor",
      space_type: "office",
      loa: 2400,
      is_heated: true,
    })
    .select("id")
    .single();
  if (sp1) {
    await sb.rpc("set_space_tenant_name", {
      p_space_id: sp1.id,
      p_tenant_name: "Nordic Consulting AB",
    });
  }

  log("✓ JS-seed klar");
}

async function calculateAll() {
  log("\n=== calculate_yearly_performance ===\n");
  const results = [];
  for (const bid of PILOT.buildings) {
    for (const year of PILOT.years) {
      const { data, error } = await sb.rpc("calculate_yearly_performance", {
        p_building_id: bid,
        p_year: year,
        p_override: false,
        p_override_reason: null,
      });
      if (error) {
        log(`✗ ${bid.slice(0, 8)} ${year}: ${error.message}`);
        continue;
      }
      const row = Array.isArray(data) ? data[0] : data;
      results.push(row);
    }
  }
  return results;
}

async function demoOverride() {
  // Hus B 2025 – 4 saknade månader
  const bid = PILOT.buildings[1];
  const year = 2025;
  const reason =
    "Pilot: godkänt av portföljchef – saknade höstmånader bedöms ej materiala för Q-rapport";

  log("\n=== Override-exempel (Hus B 2025) ===\n");
  const { data: before } = await sb
    .from("performance_indicators")
    .select("data_gap_status, meps_2030_gap, crrem_stranding_year, override_applied")
    .eq("building_id", bid)
    .eq("year", year)
    .maybeSingle();
  log("Före:", before);

  const { data, error } = await sb.rpc("calculate_yearly_performance", {
    p_building_id: bid,
    p_year: year,
    p_override: true,
    p_override_reason: reason,
  });
  if (error) {
    log("Override fel:", error.message);
    return;
  }
  const row = Array.isArray(data) ? data[0] : data;
  log("Efter override:", {
    data_gap_status: row.data_gap_status,
    meps_2030_gap: row.meps_2030_gap,
    crrem_stranding_year: row.crrem_stranding_year,
    override_applied: row.override_applied,
    override_reason: row.override_reason,
  });
}

async function printReport() {
  log("\n=== Rapport: data_gap_status per byggnad/år ===\n");
  const { data: buildings } = await sb
    .from("buildings")
    .select("id, name")
    .in("id", PILOT.buildings);

  const { data: pi } = await sb
    .from("performance_indicators")
    .select(
      "building_id, year, data_gap_status, data_completeness_percent, energy_intensity, meps_2030_gap, crrem_stranding_year, energy_class, override_applied"
    )
    .in("building_id", PILOT.buildings)
    .order("year");

  const bMap = Object.fromEntries((buildings ?? []).map((b) => [b.id, b.name]));

  console.table(
    (pi ?? []).map((r) => ({
      byggnad: bMap[r.building_id] ?? r.building_id.slice(0, 8),
      år: r.year,
      data_gap_status: r.data_gap_status,
      completeness_pct: Number(r.data_completeness_percent),
      Atemp_intensitet: r.energy_intensity != null ? Number(r.energy_intensity).toFixed(1) : null,
      MEPS_2030_gap: r.meps_2030_gap != null ? Number(r.meps_2030_gap).toFixed(1) : null,
      stranding: r.crrem_stranding_year,
      klass: r.energy_class,
      override: r.override_applied,
    }))
  );

  const gapDist = {};
  for (const r of pi ?? []) {
    gapDist[r.data_gap_status] = (gapDist[r.data_gap_status] ?? 0) + 1;
  }
  log("\nFördelning data_gap_status:", gapDist);
  log("\nÖppna dashboard: /dashboard  |  Byggnader: /buildings  |  Fastigheter: /properties");
  log("Fastighetsbeteckningar: PILOT-STOCKHOLM 1:12, PILOT-GÖTEBORG 4:8, PILOT-MALMÖ 2:5");
}

async function linkProfilesIfEnv() {
  // Optional: assign existing admin to all pilot properties as property access demo
  const adminEmail = process.env.E2E_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    log("\n( Hoppar över user_profiles – sätt ADMIN_EMAIL för koppling )");
    return;
  }
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 50 });
  const admin = users?.users?.find((u) => u.email === adminEmail);
  if (!admin) {
    log("Admin-användare hittades inte:", adminEmail);
    return;
  }
  await sb.from("user_profiles").upsert({
    id: admin.id,
    email: adminEmail,
    role: "admin",
    is_active: true,
    full_name: "Pilotadmin",
  });
  log("✓ Admin-profil uppdaterad:", adminEmail);

  // Create demo PM + viewer if not exist
  const demos = [
    { email: "pilot.forvaltare@example.com", role: "property_manager", props: [PILOT.properties[0]] },
    { email: "pilot.lasare@example.com", role: "viewer", props: [PILOT.properties[0], PILOT.properties[1]] },
  ];
  for (const d of demos) {
    let uid;
    const existing = users?.users?.find((u) => u.email === d.email);
    if (existing) {
      uid = existing.id;
    } else {
      const { data: created, error } = await sb.auth.admin.createUser({
        email: d.email,
        password: "PilotDemo123!",
        email_confirm: true,
      });
      if (error) {
        log("Kunde inte skapa", d.email, error.message);
        continue;
      }
      uid = created.user.id;
      log(`✓ Skapade ${d.role}: ${d.email} / PilotDemo123!`);
    }
    await sb.from("user_profiles").upsert({
      id: uid,
      email: d.email,
      role: d.role,
      is_active: true,
      full_name: `Pilot ${d.role}`,
    });
    await sb.from("user_properties").delete().eq("user_id", uid);
    await sb.from("user_properties").insert(
      d.props.map((property_id) => ({ user_id: uid, property_id }))
    );
  }
}

async function main() {
  log("EnergyPulse pilot-seed\n");
  const sqlOk = await tryRpcSqlFile();
  if (!sqlOk) {
    await seedViaClient();
  }

  await calculateAll();
  await demoOverride();
  await printReport();
  await linkProfilesIfEnv();
  log("\nKlart.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
