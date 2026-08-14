import { createServiceClient } from "@/lib/supabase/server";

export type EnergyBridgeBuilding = {
  building_id: string;
  name: string;
  year: number | null;
  energy_class: string | null;
  energy_intensity: number | null;
  meps_2030_gap: number | null;
  meps_status: string | null;
  crrem_stranding_year: number | null;
  combined_score: number | null;
  data_gap_status: string | null;
};

export type EnergyBridgePayload = {
  linked: boolean;
  energypulse_property_id: string | null;
  name: string | null;
  municipality: string | null;
  climate_zone: string | null;
  buildings: EnergyBridgeBuilding[];
  physical_risks: Array<{
    id: string;
    risk_type: string;
    risk_score: number | null;
    workflow_status: string | null;
  }>;
};

export function verifyBridgeSecret(req: Request): boolean {
  const expected = (process.env.ENERGYPULSE_BRIDGE_SECRET ?? "").trim();
  if (!expected || expected.length < 16) return false;
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const header = (req.headers.get("x-bridge-secret") ?? "").trim();
  return bearer === expected || header === expected;
}

export async function buildEnergyBridgePayload(
  liljebladsPropertyId: string,
): Promise<EnergyBridgePayload> {
  const supabase = createServiceClient();
  const { data: property } = await supabase
    .from("properties")
    .select("id, name, municipality, climate_zone")
    .eq("liljeblads_property_id", liljebladsPropertyId)
    .maybeSingle();

  if (!property) {
    return {
      linked: false,
      energypulse_property_id: null,
      name: null,
      municipality: null,
      climate_zone: null,
      buildings: [],
      physical_risks: [],
    };
  }

  const { data: buildings } = await supabase
    .from("buildings")
    .select("id, name")
    .eq("property_id", property.id)
    .order("name");

  const buildingIds = (buildings ?? []).map((b) => b.id);
  const latestByBuilding = new Map<string, EnergyBridgeBuilding>();

  if (buildingIds.length) {
    const { data: pis } = await supabase
      .from("performance_indicators")
      .select(
        "building_id, year, energy_class, energy_intensity, meps_2030_gap, meps_status, crrem_stranding_year, data_gap_status",
      )
      .in("building_id", buildingIds)
      .order("year", { ascending: false });

    const { data: scores } = await supabase
      .from("risk_scores")
      .select("building_id, year, combined_score")
      .in("building_id", buildingIds)
      .order("year", { ascending: false });

    const scoreMap = new Map<string, number | null>();
    for (const s of scores ?? []) {
      const key = `${s.building_id}:${s.year}`;
      if (!scoreMap.has(key)) scoreMap.set(key, s.combined_score);
    }

    for (const pi of pis ?? []) {
      if (latestByBuilding.has(pi.building_id)) continue;
      const b = (buildings ?? []).find((x) => x.id === pi.building_id);
      latestByBuilding.set(pi.building_id, {
        building_id: pi.building_id,
        name: b?.name ?? pi.building_id,
        year: pi.year,
        energy_class: pi.energy_class,
        energy_intensity: pi.energy_intensity,
        meps_2030_gap: pi.meps_2030_gap,
        meps_status: pi.meps_status,
        crrem_stranding_year: pi.crrem_stranding_year,
        combined_score:
          scoreMap.get(`${pi.building_id}:${pi.year}`) ?? null,
        data_gap_status: pi.data_gap_status,
      });
    }
  }

  const { data: risks } = await supabase
    .from("physical_risks")
    .select("id, risk_type, risk_score, workflow_status")
    .eq("property_id", property.id)
    .order("risk_score", { ascending: false })
    .limit(12);

  return {
    linked: true,
    energypulse_property_id: property.id,
    name: property.name,
    municipality: property.municipality,
    climate_zone: property.climate_zone,
    buildings: [...latestByBuilding.values()],
    physical_risks: (risks ?? []).map((r) => ({
      id: r.id,
      risk_type: r.risk_type,
      risk_score: r.risk_score,
      workflow_status: r.workflow_status,
    })),
  };
}
