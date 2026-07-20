"use server";

/**
 * Global search for cmd+k palette: properties, buildings, actions.
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { z } from "zod";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type SearchResultType = "property" | "building" | "action";

export interface SearchHit {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  meta?: string;
}

const schema = z.object({
  query: z.string().min(1).max(100),
  limit: z.number().int().min(1).max(30).optional().default(15),
});

export async function globalSearch(
  raw: unknown
): Promise<ActionResult<SearchHit[]>> {
  try {
    const { query, limit } = schema.parse(raw);
    const supabase = await createClient();
    await requireUser(supabase);

    const q = query.trim();
    const like = `%${q}%`;
    const hits: SearchHit[] = [];

    const [{ data: properties }, { data: buildings }, { data: actions }] =
      await Promise.all([
        supabase
          .from("properties")
          .select("id, name, municipality, external_id, address")
          .or(
            `name.ilike.${like},municipality.ilike.${like},external_id.ilike.${like},address.ilike.${like}`
          )
          .limit(limit),
        supabase
          .from("buildings")
          .select("id, name, property_id, primary_use")
          .ilike("name", like)
          .limit(limit),
        supabase
          .from("actions")
          .select("id, title, building_id, status, category")
          .ilike("title", like)
          .limit(limit),
      ]);

    for (const p of properties ?? []) {
      hits.push({
        type: "property",
        id: p.id,
        title: p.name,
        subtitle: [p.municipality, p.external_id, p.address]
          .filter(Boolean)
          .join(" · "),
        href: `/buildings?search=${encodeURIComponent(p.name)}`,
        meta: "Fastighet",
      });
    }

    // Resolve property names for buildings
    const propIds = [
      ...new Set((buildings ?? []).map((b) => b.property_id)),
    ];
    const { data: props } = propIds.length
      ? await supabase.from("properties").select("id, name").in("id", propIds)
      : { data: [] as { id: string; name: string }[] };
    const pMap = new Map((props ?? []).map((p) => [p.id, p.name]));

    for (const b of buildings ?? []) {
      hits.push({
        type: "building",
        id: b.id,
        title: b.name,
        subtitle: pMap.get(b.property_id) ?? b.property_id.slice(0, 8),
        href: `/buildings?building=${b.id}`,
        meta: b.primary_use ?? "Byggnad",
      });
    }

    for (const a of actions ?? []) {
      hits.push({
        type: "action",
        id: a.id,
        title: a.title,
        subtitle: `${a.category} · ${a.status}`,
        href: `/buildings?building=${a.building_id}`,
        meta: "Åtgärd",
      });
    }

    return { success: true, data: hits.slice(0, limit) };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "UNKNOWN",
    };
  }
}
