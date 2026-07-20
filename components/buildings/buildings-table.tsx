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
  History,
  LineChart,
  ShieldAlert,
  X,
  Search,
  Building2,
  Upload,
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

const ROW_H = 48;

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
            className="truncate text-left font-medium text-primary hover:underline"
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
    <div className="page-shell flex flex-col">
      <div className="shrink-0 space-y-4 border-b border-border bg-background px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              <h1 className="page-title">Byggnader</h1>
            </div>
            <p className="page-subtitle">
              Filtrera, öppna underlag och exportera. Klicka en byggnad för mer
              detalj.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/import">
                <Upload className="h-4 w-4" />
                Importera data
              </Link>
            </Button>
            <Button
              variant="outline"
              disabled={exporting}
              onClick={() => void onExport()}
            >
              <Download className="h-4 w-4" />
              Excel
            </Button>
            <Button
              variant="outline"
              disabled={exportingPdf}
              onClick={() => void onExportPdf()}
            >
              <Download className="h-4 w-4" />
              PDF
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mx-auto max-w-7xl space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Sök byggnad eller fastighet…"
                className="pl-9"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              År
              <Select
                value={String(year)}
                onValueChange={(v) => setYear(Number(v))}
              >
                <SelectTrigger className="w-28">
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
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Riskår ≤
              <Select value={strandingMax} onValueChange={setStrandingMax}>
                <SelectTrigger className="w-36">
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
            </label>
            <span className="ml-auto text-sm tabular text-muted-foreground">
              {data?.total ?? 0} byggnader
              {isFetching ? " · …" : ""}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Datakvalitet:
            </span>
            {(
              [
                ["all", "Alla"],
                ["COMPLETE", "Komplett"],
                ["EXTRAPOLATED_WARNING", "Uppskattad"],
                ["INCOMPLETE_DATA", "Saknas data"],
              ] as const
            ).map(([s, label]) => (
              <Button
                key={s}
                size="sm"
                variant={gapFilter === s ? "default" : "outline"}
                onClick={() => oneClickGap(s === "all" ? "all" : s)}
              >
                {label}
              </Button>
            ))}
            <span className="ml-2 text-xs font-medium text-muted-foreground">
              Klass:
            </span>
            {(["all", "A", "B", "C", "D", "E", "F", "G"] as const).map((c) => (
              <Button
                key={c}
                size="sm"
                variant={classFilter === c ? "default" : "outline"}
                className="min-w-9"
                onClick={() => oneClickClass(c === "all" ? "all" : c)}
              >
                {c === "all" ? "Alla" : c}
              </Button>
            ))}
            {(gapFilter !== "all" ||
              classFilter !== "all" ||
              strandingMax !== "all" ||
              search) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setGapFilter("all");
                  setClassFilter("all");
                  setStrandingMax("all");
                  setSearch("");
                }}
              >
                <X className="h-4 w-4" /> Rensa filter
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8">
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
                className="sticky top-0 z-20 flex border-b border-border bg-secondary/80 text-xs font-semibold text-muted-foreground backdrop-blur"
                style={{ height: ROW_H }}
              >
                {table.getHeaderGroups().map((hg) =>
                  hg.headers.map((header) => {
                    const pinned = header.column.getIsPinned();
                    return (
                      <div
                        key={header.id}
                        className={cn(
                          "flex shrink-0 items-center gap-1 px-3 py-2",
                          pinned &&
                            "sticky z-30 border-r border-border bg-secondary",
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
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : header.column.getIsSorted() === "desc" ? (
                              <ArrowDown className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5" />
                            )}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {isLoading && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Laddar byggnader…
                </div>
              )}
              {error && (
                <div className="p-8 text-center text-sm text-red-600">
                  {(error as Error).message}
                </div>
              )}
              {!isLoading && !error && rows.length === 0 && (
                <div className="p-10 text-center">
                  <Building2 className="mx-auto h-10 w-10 text-muted-foreground/40" />
                  <p className="mt-3 font-medium">Inga byggnader matchar</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Rensa filter eller importera energidata.
                  </p>
                  <Button className="mt-4" asChild>
                    <Link href="/import">
                      <Upload className="h-4 w-4" /> Importera
                    </Link>
                  </Button>
                </div>
              )}

              {virtualizer.getVirtualItems().map((vRow) => {
                const row = rows[vRow.index]!;
                return (
                  <div
                    key={row.id}
                    className={cn(
                      "absolute left-0 flex w-full border-b border-border/60 transition hover:bg-secondary/60",
                      row.original.data_gap_status === "INCOMPLETE_DATA" &&
                        "bg-red-50/50"
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
                            "flex shrink-0 items-center px-3 py-2 text-sm",
                            pinned &&
                              "sticky z-10 border-r border-border bg-card"
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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
          <span className="tabular">
            Sida {page + 1} av {totalPages} · {data?.rows.length ?? 0} av{" "}
            {data?.total ?? 0} visas
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Föregående
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Nästa
            </Button>
          </div>
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
