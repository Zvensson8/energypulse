import { z } from "zod";
import { qualityClassSchema, uuidSchema } from "./enums";

/** Canonical fields the engine can map CSV/Excel columns onto. */
export const energyConsumptionCanonicalFields = [
  "building_id",
  "building_external_id",
  "building_name",
  "space_id",
  "energy_source_id",
  "energy_source_name",
  "year",
  "month",
  "consumption_kwh",
  "is_weather_corrected",
  "is_estimated",
  "quality_class",
] as const;

export type EnergyConsumptionCanonicalField =
  (typeof energyConsumptionCanonicalFields)[number];

export const columnMappingSchema = z.record(
  z.string(),
  z.enum(energyConsumptionCanonicalFields).or(z.literal("__ignore__"))
);

export const ingestionEntitySchema = z.enum([
  "energy_consumption",
  "areas",
  "actions",
]);

export const ingestionPreviewRequestSchema = z.object({
  entity: ingestionEntitySchema.default("energy_consumption"),
  /** Base64-encoded file content (CSV or Excel). */
  fileBase64: z.string().min(1),
  fileName: z.string().min(1),
  /** Optional explicit mapping: sourceColumn -> canonical field */
  columnMapping: columnMappingSchema.optional(),
  /**
   * When true, only validate + return preview (no DB writes).
   * Default for first step of the pipeline.
   */
  dryRun: z.boolean().optional().default(true),
  /** Optional: scope import to one building (speeds up lookups). */
  building_id: uuidSchema.optional(),
  /** Auto-recalculate performance_indicators after successful commit. */
  recalculatePerformance: z.boolean().optional().default(true),
  /** Max rows to process (safety). */
  maxRows: z.number().int().min(1).max(50_000).optional().default(20_000),
});

export const ingestionCommitRequestSchema = ingestionPreviewRequestSchema.extend({
  dryRun: z.literal(false).optional().default(false),
  /** Accept rows that only have warnings (e.g. >30% YoY deviation). */
  acceptWarnings: z.boolean().optional().default(false),
  /** Batch id from a previous preview (optional, for audit continuity). */
  batchId: uuidSchema.optional(),
});

export const rowIssueSchema = z.object({
  rowNumber: z.number().int().min(1),
  severity: z.enum(["error", "warning"]),
  code: z.string(),
  message: z.string(),
  field: z.string().optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

export const deadLetterStatusSchema = z.enum([
  "pending",
  "retrying",
  "failed",
  "resolved",
]);

export const retryDeadLettersSchema = z.object({
  batchId: uuidSchema.optional(),
  deadLetterIds: z.array(uuidSchema).optional(),
  maxRetries: z.number().int().min(1).max(10).optional().default(3),
});

export type ColumnMapping = z.infer<typeof columnMappingSchema>;
export type IngestionPreviewRequest = z.infer<typeof ingestionPreviewRequestSchema>;
export type IngestionCommitRequest = z.infer<typeof ingestionCommitRequestSchema>;
export type RowIssue = z.infer<typeof rowIssueSchema>;

/** Suggested header aliases for auto column mapping (server-side). */
export const ENERGY_CONSUMPTION_HEADER_ALIASES: Record<
  string,
  EnergyConsumptionCanonicalField
> = {
  building_id: "building_id",
  buildingid: "building_id",
  "building id": "building_id",
  byggnad_id: "building_id",
  building_external_id: "building_external_id",
  external_id: "building_external_id",
  fastighetsbeteckning: "building_external_id",
  building_name: "building_name",
  byggnad: "building_name",
  building: "building_name",
  space_id: "space_id",
  lokal_id: "space_id",
  energy_source_id: "energy_source_id",
  energikalla_id: "energy_source_id",
  energy_source_name: "energy_source_name",
  energikalla: "energy_source_name",
  energy_source: "energy_source_name",
  source: "energy_source_name",
  year: "year",
  ar: "year",
  år: "year",
  month: "month",
  manad: "month",
  månad: "month",
  consumption_kwh: "consumption_kwh",
  kwh: "consumption_kwh",
  forbrukning: "consumption_kwh",
  förbrukning: "consumption_kwh",
  consumption: "consumption_kwh",
  is_weather_corrected: "is_weather_corrected",
  weather_corrected: "is_weather_corrected",
  vaderkorrigerad: "is_weather_corrected",
  is_estimated: "is_estimated",
  estimated: "is_estimated",
  quality_class: "quality_class",
  quality: "quality_class",
  kvalitet: "quality_class",
};

export { qualityClassSchema };
