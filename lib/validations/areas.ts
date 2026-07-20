import { z } from "zod";
import { isoDateSchema, qualityClassSchema, uuidSchema } from "./enums";
import { coerceNumber, positiveNumber } from "./common";

/** areas – speglar public.areas (Fas 1). a_temp > 0, valid_to >= valid_from. */
export const areaRowSchema = z
  .object({
    id: uuidSchema,
    building_id: uuidSchema,
    valid_from: isoDateSchema,
    valid_to: isoDateSchema.nullable(),
    bta: z.number().finite().nullable(),
    a_temp: positiveNumber,
    loa_total: z.number().finite().nullable(),
    source: z.string().nullable(),
    quality_class: qualityClassSchema,
    created_at: z.string(),
    updated_at: z.string(),
  })
  .refine(
    (a) => a.valid_to === null || a.valid_to >= a.valid_from,
    { message: "valid_to must be >= valid_from", path: ["valid_to"] }
  );

export const areaInsertSchema = z
  .object({
    id: uuidSchema.optional(),
    building_id: uuidSchema,
    valid_from: isoDateSchema,
    valid_to: isoDateSchema.nullable().optional().default(null),
    bta: z.number().finite().nullable().optional(),
    a_temp: positiveNumber,
    loa_total: z.number().finite().nullable().optional(),
    source: z.string().nullable().optional(),
    quality_class: qualityClassSchema.optional().default("C"),
  })
  .refine(
    (a) => a.valid_to == null || a.valid_to >= a.valid_from,
    { message: "valid_to must be >= valid_from", path: ["valid_to"] }
  );

export const areaImportRawSchema = z.object({
  building_id: z.string().optional(),
  building_external_id: z.string().optional(),
  valid_from: z.string().min(1),
  valid_to: z.string().optional().nullable(),
  bta: z.preprocess(coerceNumber, z.number().finite().optional()),
  a_temp: z.preprocess(coerceNumber, positiveNumber),
  loa_total: z.preprocess(coerceNumber, z.number().finite().optional()),
  source: z.string().optional().nullable(),
  quality_class: z.preprocess(
    (v) => {
      if (v === null || v === undefined || v === "") return "C";
      return String(v).trim().toUpperCase();
    },
    qualityClassSchema
  ),
});

export type AreaRow = z.infer<typeof areaRowSchema>;
export type AreaInsert = z.infer<typeof areaInsertSchema>;
