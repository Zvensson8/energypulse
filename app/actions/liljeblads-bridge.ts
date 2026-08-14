"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import { ensureDefaultPortfolio } from "@/app/actions/properties-crud";
import {
  createLiljebladsWorkOrder,
  isLiljebladsConfigured,
  listLiljebladsComponentRisks,
  listLiljebladsComponents,
  listLiljebladsProperties,
  type LiljebladsComponent,
  type LiljebladsProperty,
} from "@/lib/integrations/liljeblads";
import { uuidSchema } from "@/lib/validations/enums";
import { z } from "zod";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

function fail(e: unknown): ActionResult<never> {
  const message = e instanceof Error ? e.message : "UNKNOWN";
  if (message === "UNAUTHORIZED") {
    return { success: false, error: "Logga in krävs", code: "UNAUTHORIZED" };
  }
  return { success: false, error: message };
}

export async function getLiljebladsBridgeStatus(): Promise<
  ActionResult<{ configured: boolean }>
> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);
    return { success: true, data: { configured: isLiljebladsConfigured() } };
  } catch (e) {
    return fail(e);
  }
}

export async function fetchLiljebladsPropertyOptions(): Promise<
  ActionResult<LiljebladsProperty[]>
> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);
    if (!isLiljebladsConfigured()) {
      return { success: false, error: "Liljeblads är inte konfigurerat" };
    }
    const rows = await listLiljebladsProperties();
    return { success: true, data: rows };
  } catch (e) {
    return fail(e);
  }
}

export async function fetchLinkedLiljebladsComponents(
  propertyId: string,
): Promise<
  ActionResult<{
    linked: boolean;
    liljeblads_property_id: string | null;
    components: LiljebladsComponent[];
  }>
> {
  try {
    uuidSchema.parse(propertyId);
    const supabase = await createClient();
    await requireUser(supabase);

    const { data: property, error } = await supabase
      .from("properties")
      .select("id, liljeblads_property_id")
      .eq("id", propertyId)
      .maybeSingle();
    if (error || !property) {
      return { success: false, error: error?.message ?? "Fastighet hittades inte" };
    }

    const link = property.liljeblads_property_id;
    if (!link) {
      return {
        success: true,
        data: { linked: false, liljeblads_property_id: null, components: [] },
      };
    }
    if (!isLiljebladsConfigured()) {
      return { success: false, error: "Liljeblads är inte konfigurerat" };
    }

    const [components, risks] = await Promise.all([
      listLiljebladsComponents(link),
      listLiljebladsComponentRisks(link).catch(() => []),
    ]);
    const riskById = new Map(risks.map((r) => [r.component_id, r]));
    const merged = components.map((c) => {
      const risk = riskById.get(c.id);
      if (!risk) return c;
      return {
        ...c,
        risk_score: risk.risk_score,
        risk_level: risk.risk_level,
        remaining_b10_years: risk.remaining_b10_years,
      };
    });
    return {
      success: true,
      data: {
        linked: true,
        liljeblads_property_id: link,
        components: merged,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function importLiljebladsProperties(): Promise<
  ActionResult<{ created: number; skipped: number }>
> {
  try {
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);
    if (!isLiljebladsConfigured()) {
      return { success: false, error: "Liljeblads är inte konfigurerat" };
    }

    const remote = await listLiljebladsProperties();
    const { data: existing } = await supabase
      .from("properties")
      .select("id, liljeblads_property_id");
    const linked = new Set(
      (existing ?? [])
        .map((p) => p.liljeblads_property_id)
        .filter((id): id is string => Boolean(id)),
    );

    const portfolioId = await ensureDefaultPortfolio();
    let created = 0;
    let skipped = 0;

    for (const row of remote) {
      if (linked.has(row.id)) {
        skipped += 1;
        continue;
      }
      const { error } = await supabase.from("properties").insert({
        portfolio_id: portfolioId,
        name: row.name || "Namnlös fastighet",
        address: row.address,
        external_id: row.property_number,
        liljeblads_property_id: row.id,
        status: "active",
        ownership_type: "owned",
      });
      if (error) {
        return { success: false, error: error.message };
      }
      created += 1;
    }

    return { success: true, data: { created, skipped } };
  } catch (e) {
    return fail(e);
  }
}

export async function linkLiljebladsProperty(raw: {
  propertyId: string;
  liljebladsPropertyId: string | null;
}): Promise<ActionResult<{ id: string; liljeblads_property_id: string | null }>> {
  try {
    const input = z
      .object({
        propertyId: uuidSchema,
        liljebladsPropertyId: uuidSchema.nullable(),
      })
      .parse(raw);

    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { data, error } = await supabase
      .from("properties")
      .update({ liljeblads_property_id: input.liljebladsPropertyId })
      .eq("id", input.propertyId)
      .select("id, liljeblads_property_id")
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Kunde inte spara länk" };
    }
    return { success: true, data };
  } catch (e) {
    return fail(e);
  }
}

export async function createWorkOrderFromAction(raw: {
  actionId: string;
  componentId?: string | null;
}): Promise<ActionResult<{ work_order_id: string }>> {
  try {
    const input = z
      .object({
        actionId: uuidSchema,
        componentId: uuidSchema.nullable().optional(),
      })
      .parse(raw);

    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    if (!isLiljebladsConfigured()) {
      return { success: false, error: "Liljeblads är inte konfigurerat" };
    }

    const { data: action, error: actionErr } = await supabase
      .from("actions")
      .select(
        `
        id, title, investment_cost, building_id,
        buildings!inner (
          id, property_id,
          properties!inner ( id, name, liljeblads_property_id )
        )
      `,
      )
      .eq("id", input.actionId)
      .maybeSingle();
    if (actionErr || !action) {
      return {
        success: false,
        error: actionErr?.message ?? "Åtgärden hittades inte",
      };
    }

    const buildings = action.buildings as
      | {
          properties:
            | { name: string; liljeblads_property_id: string | null }
            | { name: string; liljeblads_property_id: string | null }[]
            | null;
        }
      | {
          properties:
            | { name: string; liljeblads_property_id: string | null }
            | { name: string; liljeblads_property_id: string | null }[]
            | null;
        }[]
      | null;
    const building = Array.isArray(buildings) ? buildings[0] : buildings;
    const props = building?.properties;
    const property = Array.isArray(props) ? props[0] : props;
    const link = property?.liljeblads_property_id ?? null;
    if (!link) {
      return {
        success: false,
        error: "Koppla fastigheten till Liljeblads först.",
      };
    }

    const title = String(action.title ?? "Åtgärd");
    const cost =
      action.investment_cost != null
        ? String(Math.round(Number(action.investment_cost)))
        : null;

    const wo = await createLiljebladsWorkOrder({
      propertyId: link,
      actionText: title,
      componentId: input.componentId ?? null,
      priority: "medium",
      priceEstimate: cost,
      rawContext: `EnergyPulse åtgärd ${action.id} · ${property?.name ?? ""}`,
    });

    return { success: true, data: { work_order_id: wo.id } };
  } catch (e) {
    return fail(e);
  }
}
