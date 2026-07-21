"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import {
  dataQualityLevel,
  type DataQualityLevel,
} from "@/lib/errors";
import { z } from "zod";
import { uuidSchema } from "@/lib/validations/enums";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type DataQualitySummary = {
  year: number;
  total: number;
  incomplete: number;
  extrapolated: number;
  complete: number;
  level: DataQualityLevel;
};

export async function getDataQualitySummary(opts?: {
  year?: number;
  propertyId?: string;
}): Promise<ActionResult<DataQualitySummary>> {
  try {
    const input = z
      .object({
        year: z.number().int().optional(),
        propertyId: uuidSchema.optional(),
      })
      .parse(opts ?? {});
    const year = input.year ?? new Date().getFullYear() - 1;
    const supabase = await createClient();
    await requireUser(supabase);

    let buildingIds: string[] | null = null;
    if (input.propertyId) {
      const { data: buildings } = await supabase
        .from("buildings")
        .select("id")
        .eq("property_id", input.propertyId);
      buildingIds = (buildings ?? []).map((b) => b.id as string);
      if (buildingIds.length === 0) {
        return {
          success: true,
          data: {
            year,
            total: 0,
            incomplete: 0,
            extrapolated: 0,
            complete: 0,
            level: "warning",
          },
        };
      }
    }

    let q = supabase
      .from("performance_indicators")
      .select("building_id, data_gap_status")
      .eq("year", year)
      .limit(500);
    if (buildingIds) q = q.in("building_id", buildingIds);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    const rows = data ?? [];
    const incomplete = rows.filter(
      (r) => r.data_gap_status === "INCOMPLETE_DATA"
    ).length;
    const extrapolated = rows.filter(
      (r) => r.data_gap_status === "EXTRAPOLATED_WARNING"
    ).length;
    const complete = rows.filter(
      (r) => r.data_gap_status === "COMPLETE"
    ).length;

    return {
      success: true,
      data: {
        year,
        total: rows.length,
        incomplete,
        extrapolated,
        complete,
        level: dataQualityLevel(incomplete, extrapolated, rows.length),
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Kunde inte hämta datakvalitet",
    };
  }
}
