import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type TestIds = {
  portfolioId: string;
  propertyId: string;
  buildingId: string;
  areaId: string;
  elSourceId: string;
  fvSourceId: string;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name} for e2e`);
  return v;
}

export function serviceClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export function anonClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function ensureEnergySources(sb: SupabaseClient) {
  const { data } = await sb.from("energy_sources").select("id, name");
  let el = data?.find((s) => s.name.includes("El (nordisk"));
  let fv = data?.find((s) => s.name.includes("Fjärrvärme"));
  if (!el) {
    const { data: created, error } = await sb
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
    el = { id: created.id, name: "El (nordisk residualmix)" };
  }
  if (!fv) {
    const { data: created, error } = await sb
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
    fv = { id: created.id, name: "Fjärrvärme (svensk medel)" };
  }
  return { elSourceId: el.id, fvSourceId: fv.id };
}

/**
 * Create an isolated building for e2e with optional missing months.
 * missingMonths: number of calendar months without data at end of year.
 */
export async function seedBuildingScenario(
  sb: SupabaseClient,
  opts: {
    label: string;
    year: number;
    missingMonths?: number; // 0, 2, 4...
    encryptTenant?: boolean;
  }
): Promise<TestIds> {
  const { elSourceId, fvSourceId } = await ensureEnergySources(sb);
  const tag = `e2e-${opts.label}-${Date.now()}`;

  const { data: portfolio, error: pErr } = await sb
    .from("portfolios")
    .insert({ name: `E2E Portfolio ${tag}`, base_currency: "SEK" })
    .select("id")
    .single();
  if (pErr) throw pErr;

  const { data: property, error: prErr } = await sb
    .from("properties")
    .insert({
      portfolio_id: portfolio.id,
      name: `E2E Fastighet ${tag}`,
      external_id: `E2E-${tag}`,
      municipality: "Stockholm",
      status: "active",
    })
    .select("id")
    .single();
  if (prErr) throw prErr;

  const { data: building, error: bErr } = await sb
    .from("buildings")
    .insert({
      property_id: property.id,
      name: `E2E Hus ${opts.label}`,
      construction_year: 2000,
      primary_use: "office",
    })
    .select("id")
    .single();
  if (bErr) throw bErr;

  const { data: area, error: aErr } = await sb
    .from("areas")
    .insert({
      building_id: building.id,
      valid_from: "2018-01-01",
      a_temp: 5000,
      bta: 5500,
      source: "e2e",
      quality_class: "B",
    })
    .select("id")
    .single();
  if (aErr) throw aErr;

  const monthsPresent = 12 - (opts.missingMonths ?? 0);
  const rows: Array<Record<string, unknown>> = [];
  for (let m = 1; m <= monthsPresent; m++) {
    rows.push({
      building_id: building.id,
      energy_source_id: elSourceId,
      year: opts.year,
      month: m,
      consumption_kwh: 40_000 + m * 100,
      is_estimated: false,
      quality_class: "A",
    });
    rows.push({
      building_id: building.id,
      energy_source_id: fvSourceId,
      year: opts.year,
      month: m,
      consumption_kwh: 60_000 + (m <= 2 || m === 12 ? 20_000 : 0),
      is_estimated: false,
      quality_class: "A",
    });
  }
  // Prior year full data for interpolation baseline
  for (let m = 1; m <= 12; m++) {
    rows.push({
      building_id: building.id,
      energy_source_id: elSourceId,
      year: opts.year - 1,
      month: m,
      consumption_kwh: 38_000 + m * 80,
      is_estimated: false,
      quality_class: "B",
    });
    rows.push({
      building_id: building.id,
      energy_source_id: fvSourceId,
      year: opts.year - 1,
      month: m,
      consumption_kwh: 55_000,
      is_estimated: false,
      quality_class: "B",
    });
  }

  const { error: cErr } = await sb.from("energy_consumption").insert(rows);
  if (cErr) throw cErr;

  // Space with encrypted tenant (via RPC)
  const { data: space, error: sErr } = await sb
    .from("spaces")
    .insert({
      building_id: building.id,
      name: `Lokal ${tag}`,
      space_type: "office",
      loa: 200,
      is_heated: true,
    })
    .select("id")
    .single();
  if (sErr) throw sErr;

  if (opts.encryptTenant !== false) {
    await sb.rpc("set_space_tenant_name", {
      p_space_id: space.id,
      p_tenant_name: "E2E Hemligt Hyresgäst AB",
    });
  }

  return {
    portfolioId: portfolio.id,
    propertyId: property.id,
    buildingId: building.id,
    areaId: area.id,
    elSourceId,
    fvSourceId,
  };
}

export async function calculatePerformance(
  sb: SupabaseClient,
  buildingId: string,
  year: number,
  override = false,
  reason: string | null = null
) {
  const { data, error } = await sb.rpc("calculate_yearly_performance", {
    p_building_id: buildingId,
    p_year: year,
    p_override: override,
    p_override_reason: reason,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function createUserWithRole(
  sb: SupabaseClient,
  opts: {
    email: string;
    password: string;
    role: "admin" | "portfolio_manager" | "property_manager" | "viewer";
    propertyIds?: string[];
  }
) {
  const { data: created, error } = await sb.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
  });
  if (error) throw error;
  const userId = created.user.id;

  const { error: pErr } = await sb.from("user_profiles").upsert({
    id: userId,
    email: opts.email,
    role: opts.role,
    is_active: true,
    full_name: `E2E ${opts.role}`,
  });
  if (pErr) throw pErr;

  if (opts.propertyIds?.length) {
    const { error: jErr } = await sb.from("user_properties").insert(
      opts.propertyIds.map((property_id) => ({
        user_id: userId,
        property_id,
      }))
    );
    if (jErr) throw jErr;
  }

  return userId;
}

export async function cleanupBuilding(sb: SupabaseClient, ids: TestIds) {
  await sb.from("energy_consumption").delete().eq("building_id", ids.buildingId);
  await sb
    .from("performance_indicators")
    .delete()
    .eq("building_id", ids.buildingId);
  await sb.from("spaces").delete().eq("building_id", ids.buildingId);
  await sb.from("areas").delete().eq("building_id", ids.buildingId);
  await sb.from("buildings").delete().eq("id", ids.buildingId);
  await sb.from("user_properties").delete().eq("property_id", ids.propertyId);
  await sb.from("properties").delete().eq("id", ids.propertyId);
  await sb.from("portfolios").delete().eq("id", ids.portfolioId);
}
