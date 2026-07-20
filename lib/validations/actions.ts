import { z } from "zod";
import {
  actionCategorySchema,
  actionStatusSchema,
  uuidSchema,
} from "./enums";
import { coerceNumber, nonNegativeNumber, yearSchema } from "./common";

/** actions – speglar public.actions (Fas 1). currency default SEK. */
export const actionRowSchema = z.object({
  id: uuidSchema,
  building_id: uuidSchema,
  title: z.string().min(1),
  category: actionCategorySchema,
  description: z.string().nullable(),
  estimated_saving_kwh: z.number().finite().nullable(),
  estimated_saving_co2: z.number().finite().nullable(),
  investment_cost: z.number().finite().nullable(),
  currency: z.string().length(3),
  payback_years: z.number().finite().nullable(),
  status: actionStatusSchema,
  priority_score: z.number().finite().nullable(),
  planned_year: z.number().int().nullable(),
  completed_date: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const actionInsertSchema = z.object({
  id: uuidSchema.optional(),
  building_id: uuidSchema,
  title: z.string().min(1).max(500),
  category: actionCategorySchema.optional().default("other"),
  description: z.string().nullable().optional(),
  estimated_saving_kwh: nonNegativeNumber.nullable().optional(),
  estimated_saving_co2: nonNegativeNumber.nullable().optional(),
  investment_cost: nonNegativeNumber.nullable().optional(),
  currency: z.string().length(3).optional().default("SEK"),
  payback_years: z.number().finite().min(0).nullable().optional(),
  status: actionStatusSchema.optional().default("proposed"),
  priority_score: z.number().finite().nullable().optional(),
  planned_year: yearSchema.nullable().optional(),
  completed_date: z.string().nullable().optional(),
});

export const actionUpdateSchema = actionInsertSchema.partial().extend({
  id: uuidSchema,
});

export const actionImportRawSchema = z.object({
  building_id: z.string().optional(),
  building_external_id: z.string().optional(),
  title: z.string().min(1),
  category: z.preprocess(
    (v) => (v == null || v === "" ? "other" : String(v).toLowerCase()),
    actionCategorySchema
  ),
  description: z.string().optional().nullable(),
  estimated_saving_kwh: z.preprocess(coerceNumber, nonNegativeNumber.optional()),
  estimated_saving_co2: z.preprocess(coerceNumber, nonNegativeNumber.optional()),
  investment_cost: z.preprocess(coerceNumber, nonNegativeNumber.optional()),
  currency: z.string().length(3).optional().default("SEK"),
  payback_years: z.preprocess(coerceNumber, z.number().finite().min(0).optional()),
  status: z.preprocess(
    (v) => (v == null || v === "" ? "proposed" : String(v).toLowerCase()),
    actionStatusSchema
  ),
  planned_year: z.preprocess(coerceNumber, yearSchema.optional()),
});

export type ActionRow = z.infer<typeof actionRowSchema>;
export type ActionInsert = z.infer<typeof actionInsertSchema>;
