import { z } from "zod";
import {
  dataGapStatusSchema,
  energyClassSchema,
  uuidSchema,
} from "./enums";
import { nonNegativeNumber, yearSchema } from "./common";

/** performance_indicators – speglar public.performance_indicators (Fas 1). */
export const performanceIndicatorRowSchema = z.object({
  id: uuidSchema,
  building_id: uuidSchema,
  year: yearSchema,
  area_id: uuidSchema.nullable(),
  a_temp: z.number().finite().nullable(),
  total_energy_kwh: z.number().finite().nullable(),
  energy_intensity: z.number().finite().nullable(),
  primary_energy_intensity: z.number().finite().nullable(),
  energy_class: energyClassSchema.nullable(),
  ghg_intensity: z.number().finite().nullable(),
  scope1_kg_co2e: z.number().finite().nullable(),
  scope2_kg_co2e: z.number().finite().nullable(),
  scope3_kg_co2e: z.number().finite().nullable(),
  crrem_stranding_year: z.number().int().nullable(),
  meps_2030_gap: z.number().finite().nullable(),
  meps_2033_gap: z.number().finite().nullable(),
  calculation_method: z.string(),
  crrem_version_used: z.string().nullable(),
  data_gap_status: dataGapStatusSchema,
  data_completeness_percent: z.number().min(0).max(100),
  override_applied: z.boolean(),
  override_reason: z.string().nullable(),
  calculated_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const overrideRequestSchema = z.object({
  building_id: uuidSchema,
  year: yearSchema,
  override_reason: z
    .string()
    .trim()
    .min(5, "override_reason must be at least 5 characters")
    .max(2000),
});

export const calculatePerformanceRequestSchema = z.object({
  building_id: uuidSchema,
  year: yearSchema,
  override: z.boolean().optional().default(false),
  override_reason: z.string().trim().min(5).max(2000).optional(),
});

export type PerformanceIndicatorRow = z.infer<typeof performanceIndicatorRowSchema>;
export type OverrideRequest = z.infer<typeof overrideRequestSchema>;
export type CalculatePerformanceRequest = z.infer<
  typeof calculatePerformanceRequestSchema
>;
