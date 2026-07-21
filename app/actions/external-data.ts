"use server";

/**
 * Refresh / status for SMHI, Boverket, GSI integrations.
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import {
  fetchAllExternalForProperty,
  describeIntegrationStatus,
  isAnyExternalSourceEnabled,
  type ExternalRefreshReport,
  type PropertyGeoContext,
} from "@/lib/integrations";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { uuidSchema } from "@/lib/validations/enums";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

function toError(e: unknown): ActionResult<never> {
  const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
  if (message === "UNAUTHORIZED")
    return { success: false, error: "Inloggning krävs", code: "UNAUTHORIZED" };
  if (message === "FORBIDDEN" || message.startsWith("FORBIDDEN_ROLE"))
    return {
      success: false,
      error: "Otillräcklig behörighet",
      code: "FORBIDDEN",
    };
  return { success: false, error: message, code: "ERROR" };
}

export async function getExternalIntegrationFlags(): Promise<
  ActionResult<{
    sources: ReturnType<typeof describeIntegrationStatus>;
    anyEnabled: boolean;
  }>
> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);
    return {
      success: true,
      data: {
        sources: describeIntegrationStatus(),
        anyEnabled: isAnyExternalSourceEnabled(),
      },
    };
  } catch (e) {
    return toError(e);
  }
}

export async function getExternalDataStatus(
  propertyId: string
): Promise<
  ActionResult<
    Array<{
      source: string;
      status: string;
      message: string | null;
      fetched_at: string;
    }>
  >
> {
  try {
    const id = uuidSchema.parse(propertyId);
    const supabase = await createClient();
    await requireUser(supabase);

    const { data, error } = await supabase
      .from("external_data_snapshots")
      .select("source, status, message, fetched_at")
      .eq("property_id", id)
      .order("fetched_at", { ascending: false })
      .limit(30);

    if (error) {
      // Table may not be migrated yet
      if (error.message.includes("external_data_snapshots")) {
        return { success: true, data: [] };
      }
      return { success: false, error: error.message };
    }

    // Latest per source
    const seen = new Set<string>();
    const latest: Array<{
      source: string;
      status: string;
      message: string | null;
      fetched_at: string;
    }> = [];
    for (const row of data ?? []) {
      const src = row.source as string;
      if (seen.has(src)) continue;
      seen.add(src);
      latest.push({
        source: src,
        status: row.status as string,
        message: (row.message as string | null) ?? null,
        fetched_at: row.fetched_at as string,
      });
    }

    return { success: true, data: latest };
  } catch (e) {
    return toError(e);
  }
}

/**
 * Kör alla adapters, sparar snapshots.
 * applySuggestions=true skapar physical_risks från förslag (inte i stub som default).
 */
/** ~11 m – treat as same point */
const COORD_EPS = 0.0001;

function coordsChanged(
  lat: number,
  lon: number,
  prevLat?: number | null,
  prevLon?: number | null
): boolean {
  if (prevLat == null || prevLon == null) return true;
  return (
    Math.abs(prevLat - lat) >= COORD_EPS ||
    Math.abs(prevLon - lon) >= COORD_EPS
  );
}

/**
 * Fire-and-forget SMHI (m.fl.) when coordinates are set/changed on a property.
 * Never throws – property save must not fail if SMHI is down.
 */
export async function autoRefreshSmhiForProperty(opts: {
  propertyId: string;
  latitude?: number | null;
  longitude?: number | null;
  previousLatitude?: number | null;
  previousLongitude?: number | null;
  /** Default true – save heat/storm/flood suggestions as physical_risks */
  applySuggestions?: boolean;
}): Promise<{ triggered: boolean; reason?: string }> {
  const lat = opts.latitude;
  const lon = opts.longitude;
  if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) {
    return { triggered: false, reason: "missing_coords" };
  }
  if (
    !coordsChanged(
      lat,
      lon,
      opts.previousLatitude,
      opts.previousLongitude
    )
  ) {
    return { triggered: false, reason: "coords_unchanged" };
  }

  try {
    const res = await refreshPropertyExternalData({
      propertyId: opts.propertyId,
      applySuggestions: opts.applySuggestions ?? true,
    });
    if (!res.success) {
      logger.warn("external_data.auto_smhi_failed", {
        propertyId: opts.propertyId,
        error: res.error,
      });
      return { triggered: false, reason: res.error };
    }
    logger.info("external_data.auto_smhi", {
      propertyId: opts.propertyId,
      suggestions: res.data.smhi.suggestions.length,
      applied: res.data.appliedRiskIds.length,
      status: res.data.smhi.status,
    });
    return { triggered: true };
  } catch (e) {
    logger.warn("external_data.auto_smhi_error", {
      propertyId: opts.propertyId,
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      triggered: false,
      reason: e instanceof Error ? e.message : "error",
    };
  }
}

export async function refreshPropertyExternalData(raw: {
  propertyId: string;
  applySuggestions?: boolean;
}): Promise<ActionResult<ExternalRefreshReport>> {
  try {
    const input = z
      .object({
        propertyId: uuidSchema,
        applySuggestions: z.boolean().optional().default(false),
      })
      .parse(raw);

    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { data: prop, error: pErr } = await supabase
      .from("properties")
      .select(
        "id, name, latitude, longitude, municipality, climate_zone, address"
      )
      .eq("id", input.propertyId)
      .single();

    if (pErr || !prop) {
      return {
        success: false,
        error: pErr?.message ?? "Fastighet hittades inte",
      };
    }

    const ctx: PropertyGeoContext = {
      propertyId: prop.id as string,
      name: prop.name as string,
      latitude:
        prop.latitude != null ? Number(prop.latitude) : null,
      longitude:
        prop.longitude != null ? Number(prop.longitude) : null,
      municipality: (prop.municipality as string | null) ?? null,
      climate_zone: (prop.climate_zone as string | null) ?? null,
      address: (prop.address as string | null) ?? null,
    };

    const result = await fetchAllExternalForProperty(ctx);
    const snapshotIds: string[] = [];
    const appliedRiskIds: string[] = [];

    const sources = [
      {
        source: "smhi" as const,
        status: result.smhi.status,
        message: result.smhi.message ?? null,
        payload: result.smhi,
      },
      {
        source: "boverket" as const,
        status: result.boverket.status,
        message: result.boverket.message ?? null,
        payload: result.boverket,
      },
      {
        source: "gsi" as const,
        status: result.gsi.status,
        message: result.gsi.message ?? null,
        payload: result.gsi,
      },
    ];

    for (const s of sources) {
      const { data: snap, error } = await supabase
        .from("external_data_snapshots")
        .insert({
          property_id: input.propertyId,
          source: s.source,
          status: s.status,
          message: s.message,
          payload: JSON.parse(JSON.stringify(s.payload)) as import("@/lib/supabase/database.types").Json,
          fetched_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) {
        // Migration not applied yet – still return report without persisting
        if (
          error.message.includes("external_data_snapshots") ||
          error.message.includes("schema cache")
        ) {
          logger.warn("external_data.snapshot_table_missing", {
            error: error.message,
          });
          break;
        }
        logger.error("external_data.snapshot_failed", {
          source: s.source,
          error: error.message,
        });
        continue;
      }
      if (snap?.id) snapshotIds.push(snap.id as string);
    }

    // Apply hazard suggestions only when explicitly requested
    if (input.applySuggestions) {
      const all = [
        ...result.smhi.suggestions,
        ...result.gsi.suggestions,
      ];

      // Avoid duplicates: same source ref already open/monitoring
      const { data: existing } = await supabase
        .from("physical_risks")
        .select("id, source, risk_type, workflow_status")
        .eq("property_id", input.propertyId)
        .in("workflow_status", ["open", "monitoring"]);

      const existingKeys = new Set(
        (existing ?? []).map(
          (r) =>
            `${(r.source as string | null) ?? ""}|${r.risk_type as string}`
        )
      );

      for (const h of all) {
        const key = `${h.sourceRef}|${h.risk_type}`;
        if (existingKeys.has(key)) continue;
        // also skip same risk_type from smhi: prefix
        const sameType = (existing ?? []).some(
          (r) =>
            r.risk_type === h.risk_type &&
            String(r.source ?? "").startsWith("smhi:")
        );
        if (sameType && h.sourceRef.startsWith("smhi:")) continue;

        const scoreMap: Record<string, number> = {
          low: 1,
          medium: 2,
          high: 3,
          very_high: 4,
        };
        const risk_score =
          (scoreMap[h.probability] ?? 2) * (scoreMap[h.consequence] ?? 2);

        const { data: risk, error } = await supabase
          .from("physical_risks")
          .insert({
            property_id: input.propertyId,
            risk_type: h.risk_type,
            probability: h.probability,
            consequence: h.consequence,
            risk_score,
            source: h.sourceRef,
            notes: h.summary,
            assessed_at: new Date().toISOString().slice(0, 10),
          })
          .select("id")
          .single();

        if (!error && risk?.id) {
          appliedRiskIds.push(risk.id as string);
          existingKeys.add(key);
        }
      }
    }

    logger.info("external_data.refresh", {
      userId: user.id,
      propertyId: input.propertyId,
      snapshots: snapshotIds.length,
      applied: appliedRiskIds.length,
    });

    return {
      success: true,
      data: {
        ...result,
        appliedRiskIds,
        snapshotIds,
      },
    };
  } catch (e) {
    return toError(e);
  }
}
