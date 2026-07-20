import type { AppSupabaseClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/lib/supabase/database.types";
import type { ValidatedConsumptionRow } from "./types";
import { logger } from "@/lib/logger";

const BATCH_SIZE = 200;

/**
 * Batch upsert energy_consumption.
 * Partiella unika index (building+source+year+month WHERE space_id IS NULL)
 * stöds inte som ON CONFLICT-target i PostgREST – vi gör:
 * 1) select existing keys
 * 2) update matches
 * 3) insert new
 * + quality log per batch.
 */
export async function batchUpsertEnergyConsumption(
  supabase: AppSupabaseClient,
  rows: ValidatedConsumptionRow[],
  batchId: string
): Promise<{ upserted: number; errors: string[] }> {
  const log = logger.child({ module: "ingestion.upsert", batchId });
  if (rows.length === 0) return { upserted: 0, errors: [] };

  const errors: string[] = [];
  let upserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const buildingIds = [...new Set(chunk.map((r) => r.data.building_id))];
    const years = [...new Set(chunk.map((r) => r.data.year))];

    const { data: existing, error: selErr } = await supabase
      .from("energy_consumption")
      .select("id, building_id, space_id, energy_source_id, year, month")
      .in("building_id", buildingIds)
      .in("year", years);

    if (selErr) {
      errors.push(selErr.message);
      log.error("Select existing consumption failed", { error: selErr.message });
      continue;
    }

    const keyOf = (r: {
      building_id: string;
      space_id: string | null;
      energy_source_id: string;
      year: number;
      month: number;
    }) =>
      `${r.building_id}|${r.space_id ?? "null"}|${r.energy_source_id}|${r.year}|${r.month}`;

    const existingMap = new Map(
      (existing ?? []).map((e) => [keyOf(e), e.id] as const)
    );

    const toInsert: TablesInsert<"energy_consumption">[] = [];
    const toUpdate: Array<{ id: string; row: ValidatedConsumptionRow }> = [];

    for (const row of chunk) {
      const key = keyOf({
        building_id: row.data.building_id,
        space_id: row.data.space_id ?? null,
        energy_source_id: row.data.energy_source_id,
        year: row.data.year,
        month: row.data.month,
      });
      const id = existingMap.get(key);
      if (id) {
        toUpdate.push({ id, row });
      } else {
        toInsert.push({
          building_id: row.data.building_id,
          space_id: row.data.space_id ?? null,
          energy_source_id: row.data.energy_source_id,
          year: row.data.year,
          month: row.data.month,
          consumption_kwh: row.data.consumption_kwh,
          is_weather_corrected: row.data.is_weather_corrected ?? false,
          is_estimated: row.data.is_estimated ?? false,
          quality_class: row.quality_class,
        });
      }
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase
        .from("energy_consumption")
        .insert(toInsert);
      if (insErr) {
        errors.push(insErr.message);
        log.error("Insert chunk failed", { error: insErr.message, n: toInsert.length });
      } else {
        upserted += toInsert.length;
      }
    }

    for (const { id, row } of toUpdate) {
      const { error: updErr } = await supabase
        .from("energy_consumption")
        .update({
          consumption_kwh: row.data.consumption_kwh,
          is_weather_corrected: row.data.is_weather_corrected ?? false,
          is_estimated: row.data.is_estimated ?? false,
          quality_class: row.quality_class,
        })
        .eq("id", id);
      if (updErr) {
        errors.push(updErr.message);
      } else {
        upserted += 1;
      }
    }
  }

  // Batch quality log
  await supabase.from("data_quality_logs").insert({
    entity_type: "energy_consumption",
    entity_id: batchId,
    field: "batch_upsert",
    old_value: null,
    new_value: JSON.stringify({
      upserted,
      rowCount: rows.length,
      errors: errors.slice(0, 20),
    }),
    operation: "INGESTION_BATCH",
    quality_class: "B",
  });

  log.info("Batch upsert complete", { upserted, errors: errors.length });
  return { upserted, errors };
}
