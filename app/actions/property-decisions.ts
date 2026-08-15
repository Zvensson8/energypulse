"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import {
  summarizePropertyDecision,
  type PropertyDecision,
  type PropertyDecisionStatus,
  type PropertyPerfRow,
} from "@/lib/property-decision";

export type MorningAction = {
  id: string;
  title: string;
  investment_cost: number | null;
  liljeblads_work_order_id: string | null;
};

export type PropertyDecisionRow = {
  propertyId: string;
  name: string;
  address: string | null;
  externalId: string | null;
  buildingCount: number;
  linked: boolean;
  topAction: MorningAction | null;
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
      .select("id, name, address, external_id, liljeblads_property_id")
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
    }

    const highRiskWhy = new Map<string, string>();
    try {
      const { isLiljebladsConfigured, listLiljebladsComponentRisksAll } =
        await import("@/lib/integrations/liljeblads");
      if (isLiljebladsConfigured()) {
        const risks = await listLiljebladsComponentRisksAll();
        const byRemote = new Map<string, { name?: string; score: number }>();
        for (const r of risks) {
          if (r.risk_level !== "high" && r.risk_level !== "critical") continue;
          if (!r.property_id) continue;
          const score = r.risk_score ?? 0;
          const prev = byRemote.get(r.property_id);
          if (!prev || score > prev.score) {
            byRemote.set(r.property_id, { score });
          }
        }
        for (const p of properties ?? []) {
          const remote = p.liljeblads_property_id;
          if (!remote) continue;
          const hit = byRemote.get(remote);
          if (hit) {
            highRiskWhy.set(
              p.id,
              `Komponent högrisk · ${Math.round(hit.score)}`,
            );
          }
        }
      }
    } catch {
      // Morning list still works without Liljeblads.
    }

    const topByProperty = new Map<string, MorningAction>();
    if (buildingIds.length) {
      const { data: actions } = await supabase
        .from("actions")
        .select(
          "id, title, investment_cost, status, priority_score, building_id, liljeblads_work_order_id",
        )
        .in("building_id", buildingIds)
        .in("status", ["proposed", "approved", "in_progress"])
        .order("priority_score", { ascending: false, nullsFirst: false })
        .limit(400);

      const buildingToProperty = new Map<string, string>();
      for (const [pid, bids] of byProperty) {
        for (const bid of bids) buildingToProperty.set(bid, pid);
      }
      for (const a of actions ?? []) {
        const pid = buildingToProperty.get(a.building_id);
        if (!pid || topByProperty.has(pid)) continue;
        topByProperty.set(pid, {
          id: a.id,
          title: a.title,
          investment_cost: a.investment_cost,
          liljeblads_work_order_id: a.liljeblads_work_order_id,
        });
      }
    }

    const rank: Record<PropertyDecisionStatus, number> = {
      unlinked: 0,
      needs_decision: 1,
      missing_data: 2,
      ok: 3,
    };

    const rows: PropertyDecisionRow[] = (properties ?? []).map((p) => {
      const bIds = byProperty.get(p.id) ?? [];
      const perf = bIds
        .map((id) => perfByBuilding.get(id))
        .filter((x): x is PropertyPerfRow => Boolean(x));
      const linked = Boolean(p.liljeblads_property_id);
      const decision = summarizePropertyDecision(bIds.length, perf, p.id, {
        linked,
        highRiskWhy: highRiskWhy.get(p.id) ?? null,
      });
      return {
        propertyId: p.id,
        name: p.name,
        address: p.address,
        externalId: p.external_id,
        buildingCount: bIds.length,
        linked,
        topAction: topByProperty.get(p.id) ?? null,
        ...decision,
      };
    });

    rows.sort(
      (a, b) =>
        rank[a.status] - rank[b.status] || a.name.localeCompare(b.name, "sv"),
    );
    return { success: true, data: rows };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Kunde inte hämta beslutslista",
    };
  }
}
