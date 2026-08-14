"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import {
  summarizePropertyDecision,
  type PropertyDecision,
  type PropertyDecisionStatus,
  type PropertyPerfRow,
} from "@/lib/property-decision";

export type PropertyDecisionRow = {
  propertyId: string;
  name: string;
  address: string | null;
  externalId: string | null;
  buildingCount: number;
} & PropertyDecision;

export async function listPropertyDecisions(): Promise<
  | { success: true; data: PropertyDecisionRow[] }
  | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    const { data: properties, error } = await supabase
      .from("properties")
      .select("id, name, address, external_id")
      .eq("status", "active")
      .order("name");
    if (error) return { success: false, error: error.message };

    const ids = (properties ?? []).map((p) => p.id);
    if (ids.length === 0) return { success: true, data: [] };

    const { data: buildings } = await supabase
      .from("buildings")
      .select("id, property_id")
      .in("property_id", ids);

    const byProperty = new Map<string, string[]>();
    for (const b of buildings ?? []) {
      const list = byProperty.get(b.property_id) ?? [];
      list.push(b.id);
      byProperty.set(b.property_id, list);
    }

    const buildingIds = (buildings ?? []).map((b) => b.id);
    const perfByBuilding = new Map<string, PropertyPerfRow>();
    if (buildingIds.length) {
      const year = new Date().getFullYear() - 1;
      const { data: pis } = await supabase
        .from("performance_indicators")
        .select(
          "building_id, energy_intensity, data_gap_status, meps_2030_gap, crrem_stranding_year, energy_class, year",
        )
        .in("building_id", buildingIds)
        .order("year", { ascending: false });

      for (const pi of pis ?? []) {
        if (!perfByBuilding.has(pi.building_id)) {
          perfByBuilding.set(pi.building_id, pi);
        }
      }

      // If last calendar year missing, first row per building is already latest.
      void year;
    }

    const rank: Record<PropertyDecisionStatus, number> = {
      needs_decision: 0,
      missing_data: 1,
      ok: 2,
    };

    const rows: PropertyDecisionRow[] = (properties ?? []).map((p) => {
      const bIds = byProperty.get(p.id) ?? [];
      const perf = bIds
        .map((id) => perfByBuilding.get(id))
        .filter((x): x is PropertyPerfRow => Boolean(x));
      const decision = summarizePropertyDecision(bIds.length, perf, p.id);
      return {
        propertyId: p.id,
        name: p.name,
        address: p.address,
        externalId: p.external_id,
        buildingCount: bIds.length,
        ...decision,
      };
    });

    rows.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name, "sv"));
    return { success: true, data: rows };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Kunde inte hämta beslutslista",
    };
  }
}
