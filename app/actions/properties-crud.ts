"use server";

/**
 * CRUD for portfolios / properties / buildings / areas.
 * Supports full user workflows: create, edit, list, detail, soft lifecycle.
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import {
  propertyInsertSchema,
  propertyUpdateSchema,
  buildingInsertSchema,
  buildingUpdateSchema,
  buildingAreaInsertSchema,
} from "@/lib/validations/properties";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { recalculateYearlyPerformance } from "@/app/actions/performance";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

function err(e: unknown): ActionResult<never> {
  const message = e instanceof Error ? e.message : "UNKNOWN";
  if (message === "UNAUTHORIZED") {
    return { success: false, error: "Logga in krävs", code: "UNAUTHORIZED" };
  }
  if (message.startsWith("FORBIDDEN")) {
    return { success: false, error: "Otillräcklig behörighet", code: "FORBIDDEN" };
  }
  return { success: false, error: message };
}

// ---------------------------------------------------------------------------
// Portfolios
// ---------------------------------------------------------------------------

export async function listPortfolios(): Promise<
  ActionResult<
    Array<{
      id: string;
      name: string;
      description: string | null;
      base_currency: string;
    }>
  >
> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);
    const { data, error } = await supabase
      .from("portfolios")
      .select("id, name, description, base_currency")
      .order("name");
    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  } catch (e) {
    return err(e);
  }
}

export async function ensureDefaultPortfolio() {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  assertRole(user, WRITE_ROLES);

  const { data: existing } = await supabase
    .from("portfolios")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("portfolios")
    .insert({
      name: "Huvudportfölj",
      description: "Standardportfölj",
      base_currency: "SEK",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

// ---------------------------------------------------------------------------
// Properties list / get
// ---------------------------------------------------------------------------

export interface PropertyListItem {
  id: string;
  name: string;
  external_id: string | null;
  address: string | null;
  municipality: string | null;
  climate_zone: string | null;
  ownership_type: string;
  status: string;
  portfolio_id: string;
  portfolio_name: string | null;
  building_count: number;
}

export async function listProperties(search?: string): Promise<
  ActionResult<PropertyListItem[]>
> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    let q = supabase
      .from("properties")
      .select(
        "id, name, external_id, address, municipality, climate_zone, ownership_type, status, portfolio_id, portfolios(name)"
      )
      .order("name");

    if (search?.trim()) {
      const s = `%${search.trim()}%`;
      q = q.or(
        `name.ilike.${s},external_id.ilike.${s},municipality.ilike.${s},address.ilike.${s}`
      );
    }

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    const ids = (data ?? []).map((p) => p.id);
    const counts = new Map<string, number>();
    if (ids.length) {
      const { data: buildings } = await supabase
        .from("buildings")
        .select("id, property_id")
        .in("property_id", ids);
      for (const b of buildings ?? []) {
        counts.set(b.property_id, (counts.get(b.property_id) ?? 0) + 1);
      }
    }

    const rows: PropertyListItem[] = (data ?? []).map((p) => {
      const port = p.portfolios as { name: string } | null;
      return {
        id: p.id,
        name: p.name,
        external_id: p.external_id,
        address: p.address,
        municipality: p.municipality,
        climate_zone: p.climate_zone,
        ownership_type: p.ownership_type,
        status: p.status,
        portfolio_id: p.portfolio_id,
        portfolio_name: port?.name ?? null,
        building_count: counts.get(p.id) ?? 0,
      };
    });

    return { success: true, data: rows };
  } catch (e) {
    return err(e);
  }
}

export async function getProperty(id: string) {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    const { data: property, error } = await supabase
      .from("properties")
      .select("*, portfolios(id, name)")
      .eq("id", id)
      .single();
    if (error || !property) {
      return { success: false as const, error: error?.message ?? "Hittades inte" };
    }

    const { data: buildings } = await supabase
      .from("buildings")
      .select("*")
      .eq("property_id", id)
      .order("name");

    const buildingIds = (buildings ?? []).map((b) => b.id);
    let areas: Array<Record<string, unknown>> = [];
    let latestPi: Array<Record<string, unknown>> = [];
    if (buildingIds.length) {
      const { data: a } = await supabase
        .from("areas")
        .select("*")
        .in("building_id", buildingIds)
        .order("valid_from", { ascending: false });
      areas = a ?? [];

      const year = new Date().getFullYear() - 1;
      const { data: pi } = await supabase
        .from("performance_indicators")
        .select(
          "building_id, year, energy_intensity, data_gap_status, data_completeness_percent, meps_2030_gap, crrem_stranding_year, energy_class"
        )
        .in("building_id", buildingIds)
        .eq("year", year);
      latestPi = pi ?? [];
    }

    const { data: risks } = await supabase
      .from("physical_risks")
      .select("*")
      .eq("property_id", id)
      .order("risk_score", { ascending: false });

    return {
      success: true as const,
      data: {
        property,
        buildings: buildings ?? [],
        areas,
        performance: latestPi,
        physical_risks: risks ?? [],
      },
    };
  } catch (e) {
    return err(e);
  }
}

export async function createProperty(raw: unknown) {
  try {
    const input = propertyInsertSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    let portfolioId = input.portfolio_id;
    if (!portfolioId) {
      portfolioId = await ensureDefaultPortfolio();
    }

    const { data, error } = await supabase
      .from("properties")
      .insert({
        portfolio_id: portfolioId,
        external_id: input.external_id ?? null,
        name: input.name,
        address: input.address ?? null,
        municipality: input.municipality ?? null,
        climate_zone: input.climate_zone ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        ownership_type: input.ownership_type ?? "owned",
        status: input.status ?? "active",
      })
      .select("*")
      .single();

    if (error) return { success: false as const, error: error.message };

    // property_manager: auto-assign access
    if (user.role === "property_manager") {
      await supabase.from("user_properties").insert({
        user_id: user.id,
        property_id: data.id,
      });
    }

    logger.info("property.created", { id: data.id, userId: user.id });
    return { success: true as const, data };
  } catch (e) {
    return err(e);
  }
}

export async function updateProperty(raw: unknown) {
  try {
    const input = propertyUpdateSchema.parse(raw);
    const { id, ...patch } = input;
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { data, error } = await supabase
      .from("properties")
      .update({
        ...patch,
        external_id: patch.external_id === undefined ? undefined : patch.external_id,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return { success: false as const, error: error.message };
    logger.info("property.updated", { id, userId: user.id });
    return { success: true as const, data };
  } catch (e) {
    return err(e);
  }
}

export async function deleteProperty(id: string) {
  try {
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, ["admin", "portfolio_manager"]);

    // Soft-delete preferred: set status inactive
    const { data, error } = await supabase
      .from("properties")
      .update({ status: "inactive" })
      .eq("id", id)
      .select("id, status")
      .single();

    if (error) return { success: false as const, error: error.message };
    logger.info("property.deactivated", { id, userId: user.id });
    return { success: true as const, data };
  } catch (e) {
    return err(e);
  }
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

export async function createBuilding(raw: unknown) {
  try {
    const input = buildingInsertSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const {
      a_temp,
      bta,
      area_source,
      area_quality_class,
      ...buildingFields
    } = input;

    const { data: building, error } = await supabase
      .from("buildings")
      .insert({
        property_id: buildingFields.property_id,
        name: buildingFields.name,
        construction_year: buildingFields.construction_year ?? null,
        major_renovation_year: buildingFields.major_renovation_year ?? null,
        construction_type: buildingFields.construction_type ?? null,
        facade_share: buildingFields.facade_share ?? null,
        roof_share: buildingFields.roof_share ?? null,
        window_share: buildingFields.window_share ?? null,
        protected_status: buildingFields.protected_status ?? false,
        primary_use: buildingFields.primary_use ?? null,
      })
      .select("*")
      .single();

    if (error) return { success: false as const, error: error.message };

    if (a_temp != null) {
      await supabase.from("areas").insert({
        building_id: building.id,
        valid_from: new Date().toISOString().slice(0, 10),
        a_temp,
        bta: bta ?? null,
        source: area_source ?? "manuell inmatning",
        quality_class: area_quality_class ?? "C",
      });
    }

    logger.info("building.created", { id: building.id, userId: user.id });
    return { success: true as const, data: building };
  } catch (e) {
    return err(e);
  }
}

export async function updateBuilding(raw: unknown) {
  try {
    const input = buildingUpdateSchema.parse(raw);
    const { id, ...patch } = input;
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { data, error } = await supabase
      .from("buildings")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return { success: false as const, error: error.message };
    return { success: true as const, data };
  } catch (e) {
    return err(e);
  }
}

export async function createAreaVersion(raw: unknown) {
  try {
    const input = buildingAreaInsertSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { data, error } = await supabase
      .from("areas")
      .insert({
        building_id: input.building_id,
        valid_from: input.valid_from,
        valid_to: input.valid_to ?? null,
        a_temp: input.a_temp,
        bta: input.bta ?? null,
        loa_total: input.loa_total ?? null,
        source: input.source ?? null,
        quality_class: input.quality_class ?? "C",
      })
      .select("*")
      .single();

    if (error) return { success: false as const, error: error.message };
    return { success: true as const, data };
  } catch (e) {
    return err(e);
  }
}

/** Recompute performance for a building across recent years after data change */
export async function recalculateBuildingYears(
  buildingId: string,
  years?: number[]
) {
  try {
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const ys =
      years ??
      [0, 1, 2].map((o) => new Date().getFullYear() - 1 - o);

    const results = [];
    for (const year of ys) {
      const res = await recalculateYearlyPerformance({
        building_id: buildingId,
        year,
      });
      if (res.success) results.push(res.data);
    }
    return { success: true as const, data: results };
  } catch (e) {
    return err(e);
  }
}

export async function getBuildingDetail(buildingId: string) {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    const { data: building, error } = await supabase
      .from("buildings")
      .select("*, properties(*)")
      .eq("id", buildingId)
      .single();
    if (error || !building) {
      return { success: false as const, error: error?.message ?? "Ej funnen" };
    }

    const { data: areas } = await supabase
      .from("areas")
      .select("*")
      .eq("building_id", buildingId)
      .order("valid_from", { ascending: false });

    const { data: performance } = await supabase
      .from("performance_indicators")
      .select("*")
      .eq("building_id", buildingId)
      .order("year", { ascending: false });

    const { data: actions } = await supabase
      .from("actions")
      .select("*")
      .eq("building_id", buildingId)
      .order("priority_score", { ascending: false });

    const { data: spaces } = await supabase
      .from("spaces_safe")
      .select("*")
      .eq("building_id", buildingId);

    return {
      success: true as const,
      data: {
        building,
        areas: areas ?? [],
        performance: performance ?? [],
        actions: actions ?? [],
        spaces: spaces ?? [],
      },
    };
  } catch (e) {
    return err(e);
  }
}
