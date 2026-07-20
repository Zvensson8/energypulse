"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnPinningState,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  FileSearch,
  Filter,
  History,
  LineChart,
  ShieldAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  queryBuildingPerformance,
  type BuildingPerformanceRow,
  type BuildingsTableQuery,
} from "@/app/actions/buildings-table";
import { exportBuildingPerformanceExcel } from "@/app/actions/export";
import { exportBuildingPerformancePdf } from "@/app/actions/export-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EnergyClassBadge } from "@/components/energy/energy-class-badge";
import { DataGapBadge } from "@/components/energy/data-gap-badge";
import { FormulaTooltip } from "@/components/energy/formula-tooltip";
import { ProvenanceModal } from "@/components/energy/provenance-modal";
import { OverrideDialog } from "@/components/energy/override-dialog";
import { AuditTrailSheet } from "@/components/energy/audit-trail-sheet";
import {
  cn,
  formatNumber,
  formatPercent,
} from "@/lib/utils";
import type { DataGapStatus, EnergyClass } from "@/lib/supabase/database.types";

const ROW_H = 26;

export function BuildingsTable({
  initialBuildingId,
  initialSearch,
  initialGap,
}: {
  initialBuildingId?: string;
  initialSearch?: string;
  initialGap?: DataGapStatus;
}) {
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "meps_2030_gap", desc: true },
  ]);
  const [gapFilter, setGapFilter] = useState<DataGapStatus | "all">(
    initialGap ?? "all"
  );
  const [classFilter, setClassFilter] = useState<EnergyClass | "all">("all");
  const [strandingMax, setStrandingMax] = useState<string>("all");
  const [search, setSearch] = useState(initialSearch ?? "");
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [pinning, setPinning] = useState<ColumnPinningState>({
    left: ["building_name", "property_name"],
  });
  const [provenance, setProvenance] = useState<{
    buildingId: string;
    year: number;
    buildingName?: string;
    dataGapStatus?: DataGapStatus;
    completeness?: number;
  } | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const openProvenance = useCallback(
    (buildingId: string, y: number, row?: BuildingPerformanceRow) => {
      setProvenance({
        buildingId,
        year: y,
        buildingName: row?.building_name,
        dataGapStatus: row?.data_gap_status,
        completeness: row?.data_completeness_percent,
      });
    },
    []
  );

  const queryInput: BuildingsTableQuery = useMemo(() => {
    const sort = sorting[0];
    return {
      page,
      pageSize,
      sortBy: (sort?.id as BuildingsTableQuery["sortBy"]) ?? "meps_2030_gap",
      sortDir: sort?.desc ? "desc" : "asc",
      year,
      data_gap_status: gapFilter === "all" ? null : gapFilter,
      energy_class: classFilter === "all" ? null : classFilter,
      crrem_stranding_year_max:
        strandingMax === "all" ? null : Number(strandingMax),
      search: search.trim() || null,
    };
  }, [
    page,
    pageSize,
    sorting,
    year,
    gapFilter,
    classFilter,
    strandingMax,
    search,
  ]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["buildings-table", queryInput],
    queryFn: async () => {
      const res = await queryBuildingPerformance(queryInput);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    setPage(0);
  }, [gapFilter, classFilter, strandingMax, search, year, sorting]);

  const columns = useMemo<ColumnDef<BuildingPerformanceRow>[]>(
    () => [
      {
        accessorKey: "building_name",
        header: "Byggnad",
        size: 140,
        cell: ({ row }) => (
          <button
            type="button"
            className="truncate text-left hover:text-terminal-accent"
            onClick={() =>
              setProvenance({
                buildingId: row.original.building_id,
                year: row.original.year,
              })
            }
            title="Visa underlag och beräkning"
          >
            {row.original.building_name}
          </button>
        ),
      },
      {
        accessorKey: "property_name",
        header: "Fastighet",
        size: 130,
        cell: ({ getValue }) => (
          <span className="truncate">{String(getValue() ?? "")}</span>
        ),
      },
      {
        accessorKey: "municipality",
        header: "Kommun",
        size: 90,
        cell: ({ getValue }) => (
          <span className="truncate text-terminal-muted">
            {String(getValue() ?? "—")}
          </span>
        ),
      },
      {
        accessorKey: "energy_class",
        header: "Klass",
        size: 48,
        cell: ({ getValue }) => (
          <EnergyClassBadge value={getValue() as EnergyClass | null} />
        ),
      },
      {
        accessorKey: "energy_intensity",
        header: "kWh/m²",
        size: 72,
        cell: ({ row, getValue }) => (
          <FormulaTooltip
            field="energy_intensity"
            row={row.original}
            onOpenProvenance={(id, y) => openProvenance(id, y, row.original)}
          >
            <span className="tabular">
              {formatNumber(getValue() as number | null, 1)}
            </span>
          </FormulaTooltip>
        ),
      },
      {
        accessorKey: "primary_energy_intensity",
        header: "Primär",
        size: 64,
        cell: ({ row, getValue }) => (
          <FormulaTooltip
            field="primary_energy_intensity"
            row={row.original}
            onOpenProvenance={(id, y) => openProvenance(id, y, row.original)}
          >
            <span className="tabular">
              {formatNumber(getValue() as number | null, 1)}
            </span>
          </FormulaTooltip>
        ),
      },
      {
        accessorKey: "ghg_intensity",
        header: "CO₂e",
        size: 64,
        cell: ({ row, getValue }) => (
          <FormulaTooltip
            field="ghg_intensity"
            row={row.original}
            onOpenProvenance={(id, y) => openProvenance(id, y, row.original)}
          >
            <span className="tabular">
              {formatNumber(getValue() as number | null, 2)}
            </span>
          </FormulaTooltip>
        ),
      },
      {
        accessorKey: "meps_2030_gap",
        header: "Gap 2030",
        size: 72,
        cell: ({ row, getValue }) => {
          const v = getValue() as number | null;
          return (
            <FormulaTooltip
              field="meps_2030_gap"
              row={row.original}
              onOpenProvenance={(id, y) => openProvenance(id, y, row.original)}
            >
              <span
                className={cn(
                  "tabular",
                  v != null && v > 0
                    ? "text-gap-incomplete"
                    : "text-gap-complete"
                )}
              >
                {formatNumber(v, 1)}
              </span>
            </FormulaTooltip>
          );
        },
      },
      {
        accessorKey: "meps_2033_gap",
        header: "Gap 2033",
        size: 72,
        cell: ({ row, getValue }) => {
          const v = getValue() as number | null;
          return (
            <FormulaTooltip
              field="meps_2033_gap"
              row={row.original}
              onOpenProvenance={(id, y) => openProvenance(id, y, row.original)}
            >
              <span
                className={cn(
                  "tabular",
                  v != null && v > 0
                    ? "text-gap-incomplete"
                    : "text-gap-complete"
                )}
              >
                {formatNumber(v, 1)}
              </span>
            </FormulaTooltip>
          );
        },
      },
      {
        accessorKey: "crrem_stranding_year",
        header: "Riskår",
        size: 60,
        cell: ({ row, getValue }) => (
          <FormulaTooltip
            field="crrem_stranding_year"
            row={row.original}
            onOpenProvenance={(id, y) => openProvenance(id, y, row.original)}
          >
            <span className="tabular text-gap-extrapolated">
              {(getValue() as number | null) ?? "—"}
            </span>
          </FormulaTooltip>
        ),
      },
      {
        accessorKey: "data_gap_status",
        header: "Datakvalitet",
        size: 120,
        cell: ({ row }) => (
          <DataGapBadge
            status={row.original.data_gap_status}
            completeness={row.original.data_completeness_percent}
          />
        ),
      },
      {
        accessorKey: "data_completeness_percent",
        header: "Komplett",
        size: 70,
        cell: ({ getValue }) => (
          <span className="tabular">
            {formatPercent(getValue() as number)}
          </span>
        ),
      },
      {
        accessorKey: "a_temp",
        header: "Atemp m²",
        size: 72,
        cell: ({ getValue }) => (
          <span className="tabular text-terminal-muted">
            {formatNumber(getValue() as number | null, 0)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        size: 88,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-0">
            <Button
              variant="ghost"
              size="icon-sm"
              title="Visa underlag"
              onClick={() => openProvenance(row.original.building_id, row.original.year, row.original)}
            >
              <FileSearch className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Historik / ändringar"
              onClick={() => {
                openProvenance(row.original.building_id, row.original.year, row.original);
                setAuditOpen(true);
              }}
            >
              <History className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon-sm" title="Klimatrisk (CRREM)" asChild>
              <Link
                href={`/crrem?building=${row.original.building_id}&year=${row.original.year}`}
              >
                <LineChart className="h-3 w-3" />
              </Link>
            </Button>
            {row.original.data_gap_status === "INCOMPLETE_DATA" && (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Manuell justering (ofullständig data)"
                className="text-gap-incomplete"
                onClick={() => {
                  openProvenance(
                    row.original.building_id,
                    row.original.year,
                    row.original
                  );
                  setOverrideOpen(true);
                }}
              >
                <ShieldAlert className="h-3 w-3" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [openProvenance]
  );

  const table = useReactTable({
    data: data?.rows ?? [],
    columns,
    state: { sorting, columnPinning: pinning },
    onSortingChange: setSorting,
    onColumnPinningChange: setPinning,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    pageCount: data ? Math.ceil(data.total / pageSize) : 0,
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
  });

  const oneClickGap = useCallback((status: DataGapStatus | "all") => {
    setGapFilter((prev) => (prev === status ? "all" : status));
  }, []);

  const oneClickClass = useCallback((cls: EnergyClass | "all") => {
    setClassFilter((prev) => (prev === cls ? "all" : cls));
  }, []);

  const downloadBase64 = (
    fileBase64: string,
    fileName: string,
    mime: string
  ) => {
    const bin = atob(fileBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onExport = async () => {
    setExporting(true);
    try {
      const res = await exportBuildingPerformanceExcel(queryInput);
      if (!res.success) throw new Error(res.error);
      downloadBase64(
        res.data.fileBase64,
        res.data.fileName,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
    } finally {
      setExporting(false);
    }
  };

  const onExportPdf = async () => {
    setExportingPdf(true);
    try {
      const res = await exportBuildingPerformancePdf(queryInput);
      if (!res.success) throw new Error(res.error);
      downloadBase64(
        res.data.fileBase64,
        res.data.fileName,
        "application/pdf"
      );
    } finally {
      setExportingPdf(false);
    }
  };

  // Highlight initial building
  useEffect(() => {
    if (initialBuildingId && data?.rows) {
      const hit = data.rows.find((r) => r.building_id === initialBuildingId);
      if (hit) {
        openProvenance(hit.building_id, hit.year, hit);
      }
    }
  }, [initialBuildingId, data?.rows, openProvenance]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="flex h-full flex-col gap-1.5 p-2">
      {/* Toolbar */}
      <div className="panel flex flex-wrap items-center gap-1.5 rounded-md px-2 py-1.5">
        <span className="mr-1 text-xs font-semibold text-foreground">
          Byggnader
        </span>
        <Filter className="h-3.5 w-3.5 text-terminal-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök byggnad eller fastighet…"
          className="h-7 w-52 text-xs"
        />
        <label className="flex items-center gap-1 text-2xs text-terminal-muted">
          År
          <Select
            value={String(year)}
            onValueChange={(v) => setYear(Number(v))}
          >
            <SelectTrigger className="h-7 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 1, 2, 3, 4].map((o) => {
                const y = new Date().getFullYear() - 1 - o;
                return (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </label>

        {/* One-click data quality filters */}
        <div className="flex items-center gap-0.5 border-l border-terminal-border pl-1.5">
          <span className="text-2xs text-terminal-muted">Data:</span>
          {(
            [
              "all",
              "COMPLETE",
              "EXTRAPOLATED_WARNING",
              "INCOMPLETE_DATA",
            ] as const
          ).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={gapFilter === s ? "default" : "terminal"}
              className="h-7 px-1.5 text-2xs"
              onClick={() => oneClickGap(s === "all" ? "all" : s)}
              title={
                s === "all"
                  ? "Visa alla"
                  : s === "COMPLETE"
                    ? "Komplett data"
                    : s === "EXTRAPOLATED_WARNING"
                      ? "Uppskattad data"
                      : "Saknas data"
              }
            >
              {s === "all"
                ? "Alla"
                : s === "COMPLETE"
                  ? "Komplett"
                  : s === "EXTRAPOLATED_WARNING"
                    ? "Uppskattad"
                    : "Saknas"}
            </Button>
          ))}
        </div>

        {/* One-click energy class */}
        <div className="flex items-center gap-0.5 border-l border-terminal-border pl-1.5">
          <span className="text-2xs text-terminal-muted">Klass:</span>
          {(["all", "A", "B", "C", "D", "E", "F", "G"] as const).map((c) => (
            <Button
              key={c}
              size="sm"
              variant={classFilter === c ? "default" : "terminal"}
              className="h-7 min-w-[1.5rem] px-1 text-2xs"
              onClick={() => oneClickClass(c === "all" ? "all" : c)}
            >
              {c === "all" ? "Alla" : c}
            </Button>
          ))}
        </div>

        {/* Risk year filter */}
        <div className="flex items-center gap-0.5 border-l border-terminal-border pl-1.5">
          <span className="text-2xs text-terminal-muted">Riskår ≤</span>
          <Select value={strandingMax} onValueChange={setStrandingMax}>
            <SelectTrigger className="h-7 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla</SelectItem>
              <SelectItem value={String(new Date().getFullYear())}>
                I år
              </SelectItem>
              <SelectItem value={String(new Date().getFullYear() + 5)}>
                Inom 5 år
              </SelectItem>
              <SelectItem value={String(new Date().getFullYear() + 10)}>
                Inom 10 år
              </SelectItem>
              <SelectItem value={String(new Date().getFullYear() + 20)}>
                Inom 20 år
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(gapFilter !== "all" ||
          classFilter !== "all" ||
          strandingMax !== "all" ||
          search) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-0.5 text-2xs"
            onClick={() => {
              setGapFilter("all");
              setClassFilter("all");
              setStrandingMax("all");
              setSearch("");
            }}
          >
            <X className="h-3 w-3" /> Rensa
          </Button>
        )}

        <div className="ml-auto flex items-center gap-1">
          <span className="text-2xs text-terminal-muted tabular">
            {data?.total ?? 0} rader
            {isFetching ? " · …" : ""}
          </span>
          <Button
            size="sm"
            variant="terminal"
            className="h-7 gap-1"
            disabled={exporting}
            onClick={() => void onExport()}
            title="Exportera till Excel"
          >
            <Download className="h-3 w-3" />
            Excel
          </Button>
          <Button
            size="sm"
            variant="terminal"
            className="h-7 gap-1"
            disabled={exportingPdf}
            onClick={() => void onExportPdf()}
            title="Exportera till PDF"
          >
            <Download className="h-3 w-3" />
            PDF
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="panel relative min-h-0 flex-1 overflow-hidden">
        <div ref={parentRef} className="h-full overflow-auto">
          <div
            style={{
              height: virtualizer.getTotalSize() + ROW_H,
              position: "relative",
            }}
          >
            {/* Header */}
            <div
              className="sticky top-0 z-20 flex border-b border-terminal-border bg-terminal-row text-2xs font-medium uppercase tracking-wide text-terminal-muted"
              style={{ height: ROW_H }}
            >
              {table.getHeaderGroups().map((hg) =>
                hg.headers.map((header) => {
                  const pinned = header.column.getIsPinned();
                  return (
                    <div
                      key={header.id}
                      className={cn(
                        "flex shrink-0 items-center gap-0.5 density-cell",
                        pinned &&
                          "sticky z-30 border-r border-terminal-border bg-terminal-row",
                        header.column.getCanSort() &&
                          "cursor-pointer select-none hover:text-foreground"
                      )}
                      style={{
                        width: header.getSize(),
                        left:
                          pinned === "left"
                            ? `${header.column.getStart("left")}px`
                            : undefined,
                      }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {header.column.getCanSort() && (
                        <span className="opacity-50">
                          {header.column.getIsSorted() === "asc" ? (
                            <ArrowUp className="h-2.5 w-2.5" />
                          ) : header.column.getIsSorted() === "desc" ? (
                            <ArrowDown className="h-2.5 w-2.5" />
                          ) : (
                            <ArrowUpDown className="h-2.5 w-2.5" />
                          )}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {isLoading && (
              <div className="p-4 text-center text-table text-muted-foreground">
                Laddar…
              </div>
            )}
            {error && (
              <div className="p-4 text-center text-table text-destructive">
                {(error as Error).message}
              </div>
            )}

            {virtualizer.getVirtualItems().map((vRow) => {
              const row = rows[vRow.index]!;
              return (
                <div
                  key={row.id}
                  className={cn(
                    "absolute left-0 flex w-full border-b border-terminal-border/40 hover:bg-terminal-row/50",
                    row.original.data_gap_status === "INCOMPLETE_DATA" &&
                      "bg-gap-incomplete/5"
                  )}
                  style={{
                    height: ROW_H,
                    transform: `translateY(${vRow.start + ROW_H}px)`,
                  }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const pinned = cell.column.getIsPinned();
                    return (
                      <div
                        key={cell.id}
                        className={cn(
                          "flex shrink-0 items-center density-cell font-mono",
                          pinned &&
                            "sticky z-10 border-r border-terminal-border bg-terminal-panel"
                        )}
                        style={{
                          width: cell.column.getSize(),
                          left:
                            pinned === "left"
                              ? `${cell.column.getStart("left")}px`
                              : undefined,
                        }}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between panel px-2 py-1 text-2xs text-terminal-muted">
        <span className="tabular">
          Sida {page + 1}/{totalPages} · visat {data?.rows.length ?? 0} av{" "}
          {data?.total ?? 0}
        </span>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="terminal"
            className="h-6"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Föregående
          </Button>
          <Button
            size="sm"
            variant="terminal"
            className="h-6"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Nästa
          </Button>
        </div>
      </div>

      <ProvenanceModal
        open={Boolean(provenance) && !overrideOpen && !auditOpen}
        onOpenChange={(o) => {
          if (!o) setProvenance(null);
        }}
        buildingId={provenance?.buildingId ?? null}
        year={provenance?.year ?? year}
        onOpenOverride={() => setOverrideOpen(true)}
        onOpenAudit={() => setAuditOpen(true)}
        onOpenCrrem={() => {
          if (provenance) {
            window.location.href = `/crrem?building=${provenance.buildingId}&year=${provenance.year}`;
          }
        }}
      />

      <OverrideDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        buildingId={provenance?.buildingId ?? null}
        buildingName={provenance?.buildingName}
        year={provenance?.year ?? year}
        dataGapStatus={provenance?.dataGapStatus}
        completeness={provenance?.completeness}
      />

      <AuditTrailSheet
        open={auditOpen}
        onOpenChange={setAuditOpen}
        buildingId={provenance?.buildingId ?? null}
        buildingName={provenance?.buildingName}
        year={provenance?.year ?? year}
      />
    </div>
  );
}
