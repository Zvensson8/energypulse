import { z } from "zod";
import {
  ownershipTypeSchema,
  propertyStatusSchema,
  spaceTypeSchema,
  qualityClassSchema,
  uuidSchema,
} from "./enums";
import { coerceNumber } from "./common";

export const propertyInsertSchema = z.object({
  portfolio_id: uuidSchema.optional(),
  external_id: z.string().max(100).nullable().optional(), // fastighetsbeteckning
  name: z.string().min(1, "Namn krävs").max(200),
  address: z.string().max(300).nullable().optional(),
  municipality: z.string().max(100).nullable().optional(),
  climate_zone: z.string().max(10).nullable().optional(),
  latitude: z.preprocess(
    coerceNumber,
    z.number().min(-90).max(90).nullable().optional()
  ),
  longitude: z.preprocess(
    coerceNumber,
    z.number().min(-180).max(180).nullable().optional()
  ),
  ownership_type: ownershipTypeSchema.optional().default("owned"),
  status: propertyStatusSchema.optional().default("active"),
});

export const propertyUpdateSchema = propertyInsertSchema.partial().extend({
  id: uuidSchema,
});

export const buildingInsertSchema = z.object({
  property_id: uuidSchema,
  name: z.string().min(1).max(200),
  construction_year: z.preprocess(
    coerceNumber,
    z.number().int().min(1600).max(2100).nullable().optional()
  ),
  major_renovation_year: z.preprocess(
    coerceNumber,
    z.number().int().min(1600).max(2100).nullable().optional()
  ),
  construction_type: z.string().max(100).nullable().optional(),
  facade_share: z.preprocess(
    coerceNumber,
    z.number().min(0).max(1).nullable().optional()
  ),
  roof_share: z.preprocess(
    coerceNumber,
    z.number().min(0).max(1).nullable().optional()
  ),
  window_share: z.preprocess(
    coerceNumber,
    z.number().min(0).max(1).nullable().optional()
  ),
  protected_status: z.boolean().optional().default(false),
  primary_use: spaceTypeSchema.nullable().optional(),
  // Optional initial Atemp
  a_temp: z.preprocess(
    coerceNumber,
    z.number().positive("Atemp måste vara > 0").optional()
  ),
  bta: z.preprocess(coerceNumber, z.number().positive().optional()),
  area_source: z.string().max(100).optional(),
  area_quality_class: qualityClassSchema.optional().default("C"),
});

export const buildingUpdateSchema = buildingInsertSchema
  .omit({ a_temp: true, bta: true, area_source: true, area_quality_class: true })
  .partial()
  .extend({ id: uuidSchema });

export const buildingAreaInsertSchema = z.object({
  building_id: uuidSchema,
  valid_from: z.string().min(1),
  valid_to: z.string().nullable().optional(),
  a_temp: z.number().positive("Atemp måste vara > 0"),
  bta: z.number().positive().nullable().optional(),
  loa_total: z.number().positive().nullable().optional(),
  source: z.string().max(200).nullable().optional(),
  quality_class: qualityClassSchema.optional().default("C"),
});

export type PropertyInsert = z.infer<typeof propertyInsertSchema>;
export type PropertyUpdate = z.infer<typeof propertyUpdateSchema>;
export type BuildingInsert = z.infer<typeof buildingInsertSchema>;
export type BuildingUpdate = z.infer<typeof buildingUpdateSchema>;
