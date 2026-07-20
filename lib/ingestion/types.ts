import type { EnergyConsumptionInsert } from "@/lib/validations/energy-consumption";
import type { ColumnMapping, RowIssue } from "@/lib/validations/ingestion";
import type { QualityClass } from "@/lib/supabase/database.types";

export type IngestionEntity = "energy_consumption" | "areas" | "actions";

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, unknown>[];
  fileName: string;
  format: "csv" | "xlsx";
}

export interface MappedRow {
  rowNumber: number;
  raw: Record<string, unknown>;
  mapped: Record<string, unknown>;
}

export interface ValidatedConsumptionRow {
  rowNumber: number;
  data: EnergyConsumptionInsert;
  quality_class: QualityClass;
  warnings: RowIssue[];
  /** YoY deviation fraction if computed (e.g. 0.35 = +35%). */
  yoyDeviation?: number;
}

export interface IngestionPreviewResult {
  ok: boolean;
  batchId: string;
  entity: IngestionEntity;
  fileName: string;
  headers: string[];
  suggestedMapping: ColumnMapping;
  appliedMapping: ColumnMapping;
  totalRows: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  /** First N valid rows for UI preview. */
  previewRows: ValidatedConsumptionRow[];
  issues: RowIssue[];
  deadLetterCount: number;
  dataGapNotes: string[];
  areaCoverageNotes: string[];
}

export interface IngestionCommitResult extends IngestionPreviewResult {
  upsertedCount: number;
  deadLettersPersisted: number;
  performanceRecalculated: Array<{
    building_id: string;
    year: number;
    data_gap_status: string;
    data_completeness_percent: number;
  }>;
  committed: boolean;
}

export interface DeadLetterRecord {
  id?: string;
  batch_id: string;
  row_number: number;
  payload: Record<string, unknown>;
  error_code: string;
  error_message: string;
  retry_count: number;
  max_retries: number;
  status: "pending" | "retrying" | "failed" | "resolved";
}

/** YoY deviation threshold (business rule). */
export const YOY_DEVIATION_WARNING_THRESHOLD = 0.3;

/** Default max missing months from data_gap_config if fetch fails. */
export const DEFAULT_MAX_MISSING_MONTHS = 3;
