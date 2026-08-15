"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import {
  ensureDefaultPortfolio,
  insertDefaultBuilding,
} from "@/app/actions/properties-crud";
import {
  createLiljebladsWorkOrder,
  isLiljebladsConfigured,
  liljebladsWorkOrderUrl,
  listLiljebladsComponentRisks,
  listLiljebladsComponents,
  listLiljebladsProperties,
  upsertLiljebladsPlanItem,
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
    const merged = components
      .map((c) => {
        const risk = riskById.get(c.id);
        if (!risk) return c;
        return {
          ...c,
          risk_score: risk.risk_score,
          risk_level: risk.risk_level,
          remaining_b10_years: risk.remaining_b10_years,
          age_years: risk.age_years,
          confidence: risk.confidence,
          recommendation: risk.recommendation,
          expected_lifespan_years: risk.expected_lifespan_years,
          median_life_years: risk.median_life_years,
          acute_count: risk.acute_count,
        };
      })
      .sort((a, b) => (b.risk_score ?? -1) - (a.risk_score ?? -1));
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
      const { data: createdProp, error } = await supabase
        .from("properties")
        .insert({
          portfolio_id: portfolioId,
          name: row.name || "Namnlös fastighet",
          address: row.address,
          external_id: row.property_number,
          liljeblads_property_id: row.id,
          status: "active",
          ownership_type: "owned",
        })
        .select("id, name")
        .single();
      if (error) {
        return { success: false, error: error.message };
      }
      if (createdProp) {
        await insertDefaultBuilding(supabase, createdProp.id, createdProp.name);
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
}): Promise<
  ActionResult<{
    work_order_id: string;
    url: string;
    already_existed: boolean;
  }>
> {
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
        id, title, investment_cost, building_id, status,
        liljeblads_work_order_id,
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

    if (action.liljeblads_work_order_id) {
      return {
        success: true,
        data: {
          work_order_id: action.liljeblads_work_order_id,
          url: liljebladsWorkOrderUrl(action.liljeblads_work_order_id),
          already_existed: true,
        },
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

    const nextStatus =
      action.status === "proposed" || action.status === "approved"
        ? "in_progress"
        : action.status;

    const { error: updErr } = await supabase
      .from("actions")
      .update({
        liljeblads_work_order_id: wo.id,
        sent_to_work_order_at: new Date().toISOString(),
        liljeblads_component_id: input.componentId ?? null,
        status: nextStatus,
      })
      .eq("id", action.id);
    if (updErr) {
      return { success: false, error: updErr.message };
    }

    return {
      success: true,
      data: {
        work_order_id: wo.id,
        url: liljebladsWorkOrderUrl(wo.id),
        already_existed: false,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

const CATEGORY_TO_ACTION_TYPE: Record<string, string> = {
  envelope: "overhaul",
  hvac: "replace",
  lighting: "replace",
  controls: "service",
  renewable: "replace",
  behaviour: "inspect",
  other: "service",
};

function planYearQuarter(plannedYear: number | null): {
  year: number;
  quarter: number;
} {
  const now = new Date();
  const thisYear = now.getFullYear();
  const year =
    plannedYear != null && plannedYear >= 2000 ? plannedYear : thisYear;
  if (year > thisYear) return { year, quarter: 1 };
  const next = Math.floor(now.getMonth() / 3) + 2;
  if (next > 4) return { year: thisYear + 1, quarter: 1 };
  return { year, quarter: next };
}

export async function sendActionToMaintenancePlan(raw: {
  actionId: string;
  componentId?: string | null;
}): Promise<
  ActionResult<{ plan_item_id: string; created: boolean; skipped?: string }>
> {
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
        id, title, category, status, description,
        investment_cost, estimated_saving_kwh, planned_year,
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

    if (action.status === "proposed") {
      return {
        success: true,
        data: {
          plan_item_id: "",
          created: false,
          skipped: "Föreslagen åtgärd stannar i EnergyPulse. Godkänn först.",
        },
      };
    }
    if (action.status === "completed" || action.status === "cancelled") {
      return {
        success: true,
        data: {
          plan_item_id: "",
          created: false,
          skipped: `Status ${action.status} skickas inte.`,
        },
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

    const { year, quarter } = planYearQuarter(
      action.planned_year != null ? Number(action.planned_year) : null,
    );
    const saving =
      action.estimated_saving_kwh != null
        ? `Spar ${Number(action.estimated_saving_kwh).toFixed(0)} kWh/år.`
        : "";
    const notes = [action.description, saving, "EnergyPulse"]
      .filter((s) => Boolean(s && String(s).trim()))
      .join(" ");

    const item = await upsertLiljebladsPlanItem({
      propertyId: link,
      actionText: String(action.title ?? "Åtgärd"),
      externalId: action.id,
      year,
      quarter,
      actionType: CATEGORY_TO_ACTION_TYPE[String(action.category)] ?? "service",
      estimatedCost:
        action.investment_cost != null
          ? Number(action.investment_cost)
          : null,
      notes,
      componentId: input.componentId ?? null,
    });

    const { error: updErr } = await supabase
      .from("actions")
      .update({
        liljeblads_plan_item_id: item.id,
        sent_to_plan_at: new Date().toISOString(),
      })
      .eq("id", action.id);
    if (updErr) {
      return { success: false, error: updErr.message };
    }

    return {
      success: true,
      data: { plan_item_id: item.id, created: item.created },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function sendActionsToMaintenancePlan(raw: {
  actionIds: string[];
}): Promise<
  ActionResult<{ sent: number; skipped: number; errors: string[] }>
> {
  try {
    const input = z
      .object({
        actionIds: z.array(uuidSchema).min(1).max(50),
      })
      .parse(raw);

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const actionId of input.actionIds) {
      const res = await sendActionToMaintenancePlan({ actionId });
      if (!res.success) {
        errors.push(res.error);
        continue;
      }
      if (res.data.skipped) skipped += 1;
      else sent += 1;
    }
    return { success: true, data: { sent, skipped, errors } };
  } catch (e) {
    return fail(e);
  }
}
