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

    // Apply hazard suggestions only when explicitly requested and status ok/stub with items
    if (input.applySuggestions) {
      const all = [
        ...result.smhi.suggestions,
        ...result.gsi.suggestions,
      ];
      for (const h of all) {
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

        if (!error && risk?.id) appliedRiskIds.push(risk.id as string);
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
