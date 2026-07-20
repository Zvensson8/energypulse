"use server";

/**
 * Portfolio-level spaces list (via spaces_safe) + optional decrypt.
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { decryptTenantName, createSpace } from "@/app/actions/spaces";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export type PortfolioSpaceRow = {
  id: string;
  building_id: string;
  building_name: string;
  property_id: string;
  property_name: string;
  name: string | null;
  space_type: string;
  tenant_name: string | null;
  has_tenant: boolean;
  contract_start: string | null;
  contract_end: string | null;
  loa: number | null;
  boa: number | null;
  is_heated: boolean;
};

function toError(e: unknown): ActionResult<never> {
  const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
  if (message === "UNAUTHORIZED") {
    return { success: false, error: "Inloggning krävs", code: "UNAUTHORIZED" };
  }
  return { success: false, error: message, code: "ERROR" };
}

export async function listPortfolioSpaces(opts?: {
  search?: string;
  buildingId?: string;
}): Promise<ActionResult<PortfolioSpaceRow[]>> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    // spaces_safe is a view – join buildings/properties via building_id
    let q = supabase
      .from("spaces_safe")
      .select(
        `
        id, building_id, name, space_type, tenant_name, has_tenant,
        contract_start, contract_end, loa, boa, is_heated
      `
      )
      .order("name")
      .limit(500);

    if (opts?.buildingId) {
      q = q.eq("building_id", opts.buildingId);
    }

    const { data: spaces, error } = await q;
    if (error) return { success: false, error: error.message };

    const buildingIds = [
      ...new Set((spaces ?? []).map((s) => s.building_id as string)),
    ];

    const bMap = new Map<
      string,
      { name: string; property_id: string; property_name: string }
    >();

    if (buildingIds.length > 0) {
      const { data: buildings } = await supabase
        .from("buildings")
        .select("id, name, property_id, properties(name)")
        .in("id", buildingIds);

      for (const b of buildings ?? []) {
        const prop = b.properties as unknown as
          | { name: string }
          | { name: string }[]
          | null;
        const pname = Array.isArray(prop) ? prop[0]?.name : prop?.name;
        bMap.set(b.id as string, {
          name: b.name as string,
          property_id: b.property_id as string,
          property_name: pname ?? "—",
        });
      }
    }

    let rows: PortfolioSpaceRow[] = (spaces ?? []).map((s) => {
      const b = bMap.get(s.building_id as string);
      return {
        id: s.id as string,
        building_id: s.building_id as string,
        building_name: b?.name ?? "—",
        property_id: b?.property_id ?? "",
        property_name: b?.property_name ?? "—",
        name: s.name as string | null,
        space_type: s.space_type as string,
        tenant_name: s.tenant_name as string | null,
        has_tenant: Boolean(s.has_tenant),
        contract_start: s.contract_start as string | null,
        contract_end: s.contract_end as string | null,
        loa: s.loa as number | null,
        boa: s.boa as number | null,
        is_heated: Boolean(s.is_heated),
      };
    });

    if (opts?.search?.trim()) {
      const q = opts.search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.name ?? "").toLowerCase().includes(q) ||
          r.building_name.toLowerCase().includes(q) ||
          r.property_name.toLowerCase().includes(q) ||
          r.space_type.toLowerCase().includes(q)
      );
    }

    return { success: true, data: rows };
  } catch (e) {
    return toError(e);
  }
}

export { decryptTenantName, createSpace };
