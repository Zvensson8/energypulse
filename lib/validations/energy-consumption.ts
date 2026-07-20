import { z } from "zod";
import {
  qualityClassSchema,
  uuidSchema,
} from "./enums";
import {
  coerceBoolean,
  coerceNumber,
  monthSchema,
  nonNegativeNumber,
  yearSchema,
} from "./common";

/**
 * energy_consumption – speglar public.energy_consumption (Fas 1).
 * consumption_kwh >= 0, year 2000–2100, month 1–12.
 */
export const energyConsumptionRowSchema = z.object({
  id: uuidSchema,
  building_id: uuidSchema,
  space_id: uuidSchema.nullable(),
  energy_source_id: uuidSchema,
  year: yearSchema,
  month: monthSchema,
  consumption_kwh: nonNegativeNumber,
  is_weather_corrected: z.boolean(),
  is_estimated: z.boolean(),
  quality_class: qualityClassSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

export const energyConsumptionInsertSchema = z.object({
  id: uuidSchema.optional(),
  building_id: uuidSchema,
  space_id: uuidSchema.nullable().optional().default(null),
  energy_source_id: uuidSchema,
  year: yearSchema,
  month: monthSchema,
  consumption_kwh: nonNegativeNumber,
  is_weather_corrected: z.boolean().optional().default(false),
  is_estimated: z.boolean().optional().default(false),
  quality_class: qualityClassSchema.optional().default("C"),
});

export const energyConsumptionUpdateSchema = energyConsumptionInsertSchema.partial();

/**
 * CSV/Excel-rad innan UUID-resolution (kan ha external_id / energy_source_name).
 */
export const energyConsumptionImportRawSchema = z.object({
  building_id: z.string().optional(),
  building_external_id: z.string().optional(),
  building_name: z.string().optional(),
  space_id: z.string().optional().nullable(),
  energy_source_id: z.string().optional(),
  energy_source_name: z.string().optional(),
  year: z.preprocess(coerceNumber, yearSchema),
  month: z.preprocess(coerceNumber, monthSchema),
  consumption_kwh: z.preprocess(coerceNumber, nonNegativeNumber),
  is_weather_corrected: z.preprocess(
    (v) => coerceBoolean(v) ?? false,
    z.boolean()
  ),
  is_estimated: z.preprocess((v) => coerceBoolean(v) ?? false, z.boolean()),
  quality_class: z.preprocess(
    (v) => {
      if (v === null || v === undefined || v === "") return "C";
      return String(v).trim().toUpperCase();
    },
    qualityClassSchema
  ),
});

export type EnergyConsumptionRow = z.infer<typeof energyConsumptionRowSchema>;
export type EnergyConsumptionInsert = z.infer<typeof energyConsumptionInsertSchema>;
export type EnergyConsumptionImportRaw = z.infer<typeof energyConsumptionImportRawSchema>;
