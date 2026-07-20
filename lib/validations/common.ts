import { z } from "zod";
import { qualityClassSchema, uuidSchema } from "./enums";

/** Shared coercion helpers for CSV/Excel string cells. */

export function coerceNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\s/g, "").replace(",", ".");
    const n = Number(normalized);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function coerceBoolean(value: unknown): boolean | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "1", "yes", "ja", "y"].includes(v)) return true;
    if (["false", "0", "no", "nej", "n"].includes(v)) return false;
  }
  return undefined;
}

export const nonNegativeNumber = z.number().finite().min(0);
export const positiveNumber = z.number().finite().positive();

export const yearSchema = z.number().int().min(2000).max(2100);
export const monthSchema = z.number().int().min(1).max(12);

export const dataQualityLogInsertSchema = z.object({
  entity_type: z.string().min(1),
  entity_id: uuidSchema.nullish(),
  field: z.string().nullish(),
  old_value: z.string().nullish(),
  new_value: z.string().nullish(),
  quality_class: qualityClassSchema.nullish(),
  override_reason: z.string().nullish(),
  operation: z.string().default("UPDATE"),
});

export type DataQualityLogInsert = z.infer<typeof dataQualityLogInsertSchema>;
