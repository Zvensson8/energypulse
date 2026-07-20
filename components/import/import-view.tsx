"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  useCommitEnergyImport,
  usePreviewEnergyImport,
  useSuggestColumnMapping,
} from "@/lib/hooks/use-ingestion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HelpTip } from "@/components/ui/help-tip";
import { Badge } from "@/components/ui/badge";
import { energyConsumptionCanonicalFields } from "@/lib/validations/ingestion";
import type { ColumnMapping } from "@/lib/validations/ingestion";
import type {
  IngestionCommitResult,
  IngestionPreviewResult,
} from "@/lib/ingestion/types";
import {
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Download,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

const FIELD_LABELS: Record<string, string> = {
  building_id: "Byggnad-ID (UUID)",
  building_external_id: "Fastighets-/byggnadsbeteckning",
  building_name: "Byggnadsnamn",
  space_id: "Lokal-ID",
  energy_source_id: "Energikälla-ID",
  energy_source_name: "Energikälla (namn)",
  year: "År",
  month: "Månad",
  consumption_kwh: "Förbrukning (kWh)",
  is_weather_corrected: "Väderkorrigerad",
  is_estimated: "Uppskattad",
  quality_class: "Kvalitetsklass",
  __ignore__: "— Ignorera kolumn —",
};

type Step = "file" | "mapping" | "preview" | "done";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data:*;base64,XXXX
      const b64 = result.includes(",") ? result.split(",")[1]! : result;
      resolve(b64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Läsning misslyckades"));
    reader.readAsDataURL(file);
  });
}

export function ImportView() {
  const [step, setStep] = useState<Step>("file");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [rowCount, setRowCount] = useState(0);
  const [preview, setPreview] = useState<IngestionPreviewResult | null>(null);
  const [commitResult, setCommitResult] =
    useState<IngestionCommitResult | null>(null);
  const [acceptWarnings, setAcceptWarnings] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const suggest = useSuggestColumnMapping();
  const previewMut = usePreviewEnergyImport();
  const commitMut = useCommitEnergyImport();

  const busy =
    suggest.isPending || previewMut.isPending || commitMut.isPending;

  const onFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setLocalError(null);
      setCommitResult(null);
      setPreview(null);
      try {
        const name = file.name;
        const lower = name.toLowerCase();
        if (
          !lower.endsWith(".csv") &&
          !lower.endsWith(".xlsx") &&
          !lower.endsWith(".xls") &&
          !lower.endsWith(".xlsm")
        ) {
          setLocalError("Välj en CSV- eller Excel-fil (.csv, .xlsx).");
          return;
        }
        if (file.size > 15 * 1024 * 1024) {
          setLocalError("Filen är för stor (max 15 MB).");
          return;
        }
        const b64 = await fileToBase64(file);
        setFileName(name);
        setFileBase64(b64);
        const res = await suggest.mutateAsync({
          fileBase64: b64,
          fileName: name,
        });
        setHeaders(res.headers);
        setMapping(res.suggestedMapping);
        setRowCount(res.rowCount);
        setStep("mapping");
      } catch (e) {
        setLocalError(
          e instanceof Error ? e.message : "Kunde inte läsa filen"
        );
      }
    },
    [suggest]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      void onFile(f ?? null);
    },
    [onFile]
  );

  const runPreview = async () => {
    if (!fileBase64 || !fileName) return;
    setLocalError(null);
    try {
      const res = await previewMut.mutateAsync({
        fileBase64,
        fileName,
        columnMapping: mapping,
        dryRun: true,
        entity: "energy_consumption",
      });
      setPreview(res);
      setStep("preview");
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Förhandsgranskning misslyckades");
    }
  };

  const runCommit = async () => {
    if (!fileBase64 || !fileName) return;
    setLocalError(null);
    try {
      const res = await commitMut.mutateAsync({
        fileBase64,
        fileName,
        columnMapping: mapping,
        dryRun: false,
        acceptWarnings,
        recalculatePerformance: true,
        entity: "energy_consumption",
        batchId: preview?.batchId,
      });
      setCommitResult(res);
      setStep("done");
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Import misslyckades");
    }
  };

  const reset = () => {
    setStep("file");
    setFileName(null);
    setFileBase64(null);
    setHeaders([]);
    setMapping({});
    setRowCount(0);
    setPreview(null);
    setCommitResult(null);
    setLocalError(null);
  };

  const mappedCount = useMemo(
    () =>
      Object.values(mapping).filter((v) => v && v !== "__ignore__").length,
    [mapping]
  );

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Importera energidata
            </h1>
            <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-terminal-muted">
              Ladda upp månadsförbrukning (CSV eller Excel). Systemet validerar,
              sparar och räknar om prestanda automatiskt.
            </p>
          </div>
          <Link
            href="/guide"
            className="inline-flex items-center gap-1 text-2xs text-terminal-muted hover:text-terminal-accent"
          >
            <BookOpen className="h-3 w-3" /> Guide
          </Link>
        </div>

        {/* Steps indicator */}
        <ol className="flex flex-wrap gap-1.5 text-2xs">
          {(
            [
              ["file", "1. Fil"],
              ["mapping", "2. Kolumner"],
              ["preview", "3. Kontroll"],
              ["done", "4. Klart"],
            ] as const
          ).map(([id, label]) => (
            <li
              key={id}
              className={cn(
                "rounded-full px-2.5 py-1 font-medium",
                step === id
                  ? "bg-terminal-accent/20 text-terminal-accent"
                  : "bg-terminal-row text-terminal-muted"
              )}
            >
              {label}
            </li>
          ))}
        </ol>

        {localError && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {localError}
          </div>
        )}

        {/* Step: file */}
        {step === "file" && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={cn(
              "panel flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-12 transition",
              dragOver
                ? "border-terminal-accent bg-terminal-accent/5"
                : "border-terminal-border"
            )}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-terminal-accent/10 text-terminal-accent">
              <Upload className="h-7 w-7" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">
                Dra och släpp fil här
              </p>
              <p className="mt-1 text-xs text-terminal-muted">
                eller välj CSV / Excel (.xlsx) med månadsdata
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <label>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
                />
                <Button asChild disabled={busy} className="cursor-pointer gap-1.5">
                  <span>
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                    )}
                    Välj fil
                  </span>
                </Button>
              </label>
              <Button variant="terminal" className="gap-1.5" asChild>
                <a href="/examples/energypulse_exempel_import.csv" download>
                  <Download className="h-3.5 w-3.5" />
                  Ladda ner exempel-CSV
                </a>
              </Button>
            </div>
            <p className="max-w-sm text-center text-2xs text-terminal-muted">
              Kolumner som behövs: byggnad (namn eller beteckning), energikälla,
              år, månad, kWh. Använd semikolon (;) som avgränsare i CSV. Övriga
              kolumner kan ignoreras.
            </p>
          </div>
        )}

        {/* Step: mapping */}
        {(step === "mapping" || step === "preview") && fileName && (
          <div className="panel space-y-3 rounded-md p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <FileSpreadsheet className="h-4 w-4 text-terminal-accent" />
                <span className="font-medium">{fileName}</span>
                <span className="text-terminal-muted">
                  {rowCount} rader · {mappedCount} kolumner mappade
                </span>
              </div>
              <Button variant="terminal" size="sm" onClick={reset}>
                Byt fil
              </Button>
            </div>

            <div className="flex items-center gap-1 text-xs font-medium text-foreground">
              Kolumnmappning
              <HelpTip text="Koppla filens kolumnrubriker till rätt fält i EnergyPulse. Föreslagen mappning baseras på vanliga svenska/engelska namn." />
            </div>

            <div className="max-h-64 space-y-1.5 overflow-auto">
              {headers.map((h) => (
                <div
                  key={h}
                  className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[1fr_auto_1fr] sm:gap-2"
                >
                  <div className="truncate rounded-md bg-terminal-row px-2 py-1.5 text-xs">
                    {h}
                  </div>
                  <ArrowRight className="mx-auto hidden h-3.5 w-3.5 text-terminal-muted sm:block" />
                  <Select
                    value={mapping[h] ?? "__ignore__"}
                    onValueChange={(v) =>
                      setMapping((m) => ({
                        ...m,
                        [h]: v as ColumnMapping[string],
                      }))
                    }
                    disabled={step === "preview"}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__ignore__">
                        {FIELD_LABELS.__ignore__}
                      </SelectItem>
                      {energyConsumptionCanonicalFields.map((f) => (
                        <SelectItem key={f} value={f}>
                          {FIELD_LABELS[f] ?? f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {step === "mapping" && (
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  onClick={() => void runPreview()}
                  disabled={busy}
                  className="gap-1.5"
                >
                  {previewMut.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Förhandsgranska
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step: preview */}
        {step === "preview" && preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                label="Rader totalt"
                value={String(preview.totalRows)}
              />
              <Stat
                label="Giltiga"
                value={String(preview.validCount)}
                tone="ok"
              />
              <Stat
                label="Varningar"
                value={String(preview.warningCount)}
                tone="warn"
              />
              <Stat
                label="Fel"
                value={String(preview.errorCount)}
                tone="err"
              />
            </div>

            {(preview.dataGapNotes.length > 0 ||
              preview.areaCoverageNotes.length > 0) && (
              <div className="panel rounded-md p-3 text-xs text-terminal-muted">
                {preview.dataGapNotes.map((n, i) => (
                  <p key={`dg-${i}`}>{n}</p>
                ))}
                {preview.areaCoverageNotes.map((n, i) => (
                  <p key={`ar-${i}`}>{n}</p>
                ))}
              </div>
            )}

            {preview.issues.length > 0 && (
              <div className="panel max-h-48 overflow-auto rounded-md">
                <div className="panel-header !normal-case">
                  Problem ({preview.issues.length})
                </div>
                <ul className="divide-y divide-terminal-border/50 text-xs">
                  {preview.issues.slice(0, 40).map((iss, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 px-3 py-1.5"
                    >
                      {iss.severity === "error" ? (
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-gap-incomplete" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-gap-extrapolated" />
                      )}
                      <span>
                        <span className="text-terminal-muted">
                          Rad {iss.rowNumber}:
                        </span>{" "}
                        {iss.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.previewRows.length > 0 && (
              <div className="panel overflow-auto rounded-md">
                <div className="panel-header !normal-case">
                  Förhandstitt (giltiga rader)
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-terminal-row text-2xs text-terminal-muted">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Rad</th>
                      <th className="px-2 py-1.5 text-left">År</th>
                      <th className="px-2 py-1.5 text-left">Mån</th>
                      <th className="px-2 py-1.5 text-right">kWh</th>
                      <th className="px-2 py-1.5 text-left">Kvalitet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.previewRows.slice(0, 12).map((r) => (
                      <tr
                        key={r.rowNumber}
                        className="border-t border-terminal-border/40"
                      >
                        <td className="px-2 py-1 tabular">{r.rowNumber}</td>
                        <td className="px-2 py-1 tabular">{r.data.year}</td>
                        <td className="px-2 py-1 tabular">{r.data.month}</td>
                        <td className="px-2 py-1 text-right tabular">
                          {formatNumber(r.data.consumption_kwh, 0)}
                        </td>
                        <td className="px-2 py-1">{r.quality_class}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="panel flex flex-wrap items-center gap-3 rounded-md p-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={acceptWarnings}
                  onCheckedChange={(v) => setAcceptWarnings(v === true)}
                />
                Acceptera rader med varningar (t.ex. stor årsavvikelse)
              </label>
              <div className="ml-auto flex gap-2">
                <Button
                  variant="terminal"
                  onClick={() => setStep("mapping")}
                  disabled={busy}
                >
                  Justera mappning
                </Button>
                <Button
                  onClick={() => void runCommit()}
                  disabled={busy || preview.validCount === 0}
                  className="gap-1.5"
                >
                  {commitMut.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Importera {preview.validCount} rader
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step: done */}
        {step === "done" && commitResult && (
          <div className="panel space-y-4 rounded-md p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gap-complete/15 text-gap-complete">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Import klar</h2>
                <p className="mt-0.5 text-xs text-terminal-muted">
                  {commitResult.upsertedCount} rader sparade
                  {commitResult.deadLettersPersisted > 0 &&
                    ` · ${commitResult.deadLettersPersisted} rader i kö för granskning`}
                </p>
              </div>
            </div>

            {commitResult.performanceRecalculated.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-xs font-medium text-foreground">
                  Uppdaterad prestanda
                </h3>
                <div className="max-h-48 overflow-auto rounded-md border border-terminal-border">
                  <table className="w-full text-xs">
                    <thead className="bg-terminal-row text-2xs text-terminal-muted">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Byggnad</th>
                        <th className="px-2 py-1.5 text-left">År</th>
                        <th className="px-2 py-1.5 text-left">Datakvalitet</th>
                        <th className="px-2 py-1.5 text-right">Komplett</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commitResult.performanceRecalculated.map((p, i) => (
                        <tr
                          key={i}
                          className="border-t border-terminal-border/40"
                        >
                          <td className="px-2 py-1">
                            <Link
                              href={`/buildings?building=${p.building_id}`}
                              className="text-terminal-accent hover:underline"
                            >
                              {p.building_id.slice(0, 8)}…
                            </Link>
                          </td>
                          <td className="px-2 py-1 tabular">{p.year}</td>
                          <td className="px-2 py-1">
                            <Badge
                              variant={
                                p.data_gap_status === "COMPLETE"
                                  ? "success"
                                  : p.data_gap_status ===
                                      "EXTRAPOLATED_WARNING"
                                    ? "warning"
                                    : "danger"
                              }
                            >
                              {p.data_gap_status === "COMPLETE"
                                ? "Komplett"
                                : p.data_gap_status ===
                                    "EXTRAPOLATED_WARNING"
                                  ? "Uppskattad"
                                  : "Saknas data"}
                            </Badge>
                          </td>
                          <td className="px-2 py-1 text-right tabular">
                            {formatNumber(p.data_completeness_percent, 0)} %
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/dashboard">Till översikt</Link>
              </Button>
              <Button variant="terminal" asChild>
                <Link href="/buildings">Byggnader</Link>
              </Button>
              <Button variant="terminal" onClick={reset}>
                Importera mer
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "err";
}) {
  return (
    <div className="panel rounded-md p-2.5">
      <div className="text-2xs text-terminal-muted">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-lg font-semibold tabular",
          tone === "ok" && "text-gap-complete",
          tone === "warn" && "text-gap-extrapolated",
          tone === "err" && "text-gap-incomplete"
        )}
      >
        {value}
      </div>
    </div>
  );
}
