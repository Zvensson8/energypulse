"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getDashboardBundle } from "@/app/actions/dashboard";
import { getCsrdMetrics } from "@/app/actions/csrd-metrics";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { RiskHeatmap } from "@/components/dashboard/risk-heatmap";
import { TopRiskLists } from "@/components/dashboard/top-risk-lists";
import { DataGapChart } from "@/components/dashboard/data-gap-chart";
import { DecisionBoard } from "@/components/dashboard/decision-board";
import { YoyStrip } from "@/components/dashboard/yoy-strip";
import { CsrdMetricsPanel } from "@/components/dashboard/csrd-metrics-panel";
import { PropertyFilter } from "@/components/filters/property-filter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/ui/help-tip";
import { TERMS } from "@/lib/labels";
import { toUserError } from "@/lib/errors";
import {
  AlertTriangle,
  Sparkles,
  Upload,
  ListTodo,
  Activity,
  FileText,
  Loader2,
  Scale,
  RefreshCw,
} from "lucide-react";

const LS_YEAR = "ep.dashboard.year";
const LS_PROPERTY = "ep.dashboard.property";

export function DashboardView() {
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [propertyId, setPropertyId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [showCsrd, setShowCsrd] = useState(false);

  useEffect(() => {
    try {
      const y = localStorage.getItem(LS_YEAR);
      const p = localStorage.getItem(LS_PROPERTY);
      if (y && !Number.isNaN(Number(y))) setYear(Number(y));
      if (p) setPropertyId(p);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_YEAR, String(year));
      if (propertyId) localStorage.setItem(LS_PROPERTY, propertyId);
      else localStorage.removeItem(LS_PROPERTY);
    } catch {
      /* ignore */
    }
  }, [year, propertyId, hydrated]);

  /** One server round-trip for the whole board (CSRD loaded lazily). */
  const bundleQ = useQuery({
    queryKey: ["dashboard-bundle", year, propertyId || "all"],
    queryFn: async () => {
      const res = await getDashboardBundle({
        year,
        propertyId: propertyId || undefined,
        includeCsrd: false,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    staleTime: 120_000,
  });

  const csrdQ = useQuery({
    queryKey: ["dashboard-csrd", year, propertyId || "all"],
    queryFn: async () => {
      const res = await getCsrdMetrics({
        year,
        propertyId: propertyId || undefined,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    enabled: showCsrd,
    staleTime: 120_000,
  });

  const d = bundleQ.data;
  const kpis = d?.kpis;
  const heatCells = d?.heatmap;
  const top = d?.top;
  const yoy = d?.yoy;
  const board = d?.board;
  const alerts = d?.alerts;
  const riskSum = d?.riskSummary;

  return (
    <div className="page-shell">
      <div className="page-inner space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">Beslutstavla</h1>
              <HelpTip text="Portföljöversikt med prioriteter och år-mot-år. Data hämtas i ett anrop för snabbare laddning. CSRD laddas på begäran." />
            </div>
            <p className="page-subtitle">
              {TERMS.overview.help} Klicka dig vidare till risk, åtgärder eller
              rapport.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PropertyFilter
              value={propertyId}
              onChange={setPropertyId}
              includeAllLabel="Hela portföljen"
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              År
              <Select
                value={String(year)}
                onValueChange={(v) => setYear(Number(v))}
              >
                <SelectTrigger className="h-10 w-28">
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
            <Button
              variant="outline"
              size="icon"
              title="Uppdatera"
              disabled={bundleQ.isFetching}
              onClick={() => void bundleQ.refetch()}
            >
              <RefreshCw
                className={`h-4 w-4 ${bundleQ.isFetching ? "animate-spin" : ""}`}
              />
            </Button>
            <Button variant="outline" asChild>
              <Link href="/import">
                <Upload className="h-4 w-4" />
                Importera
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link
                href={
                  propertyId
                    ? `/reports?property=${propertyId}&type=property_full`
                    : "/reports"
                }
              >
                <FileText className="h-4 w-4" />
                Rapport
              </Link>
            </Button>
            <Button asChild>
              <Link href="/actions">
                <ListTodo className="h-4 w-4" />
                Åtgärder
              </Link>
            </Button>
          </div>
        </div>

        {bundleQ.isLoading && (
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Laddar beslutstavla…
          </div>
        )}

        {bundleQ.error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {toUserError(bundleQ.error)}
          </div>
        )}

        {d && (
          <>
            <div className="flex flex-wrap gap-2">
              {riskSum && (
                <Link
                  href="/risk-scores"
                  className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100"
                >
                  <Activity className="h-3.5 w-3.5" />
                  Snitt risk {riskSum.avgCombined ?? "—"} ·{" "}
                  {riskSum.highRiskCount} hög
                </Link>
              )}
              {riskSum && riskSum.financialRiskCount > 0 && (
                <Link
                  href="/risk-scores"
                  className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {riskSum.financialRiskCount} med misalignment före 2035
                </Link>
              )}
              {alerts && alerts.openCompliance > 0 && (
                <Link
                  href="/risks"
                  className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {alerts.openCompliance} öppna MEPS/CRREM-risker
                </Link>
              )}
              {alerts && alerts.declarationSuggestions > 0 && (
                <Link
                  href="/actions"
                  className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {alerts.declarationSuggestions} deklarationsförslag
                </Link>
              )}
            </div>

            {kpis && <KpiCards kpis={kpis} />}
            {yoy && <YoyStrip data={yoy} />}
            {board && <DecisionBoard items={board} year={year} />}

            {/* CSRD lazy */}
            {!showCsrd ? (
              <button
                type="button"
                onClick={() => setShowCsrd(true)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-dashed border-border bg-card px-4 py-4 text-left shadow-sm transition hover:border-primary/30 hover:shadow-md"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Scale className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">
                      CSRD / ESRS E1 – nyckeltal
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Ladda på begäran (sparar tid vid första sidladdning)
                    </span>
                  </span>
                </span>
                <span className="text-sm font-medium text-primary">Visa →</span>
              </button>
            ) : csrdQ.isLoading ? (
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Laddar CSRD-metriker…
              </div>
            ) : csrdQ.data ? (
              <CsrdMetricsPanel
                data={csrdQ.data}
                propertyId={propertyId || undefined}
              />
            ) : csrdQ.error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {toUserError(csrdQ.error)}
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-5">
              <div className="min-h-[280px] lg:col-span-3">
                {heatCells ? (
                  <RiskHeatmap cells={heatCells} />
                ) : (
                  <div className="panel flex h-full min-h-[280px] items-center justify-center text-sm text-muted-foreground">
                    Ingen data – importera energivärden först
                  </div>
                )}
              </div>
              <div className="min-h-[280px] lg:col-span-2">
                {kpis ? (
                  <DataGapChart kpis={kpis} />
                ) : (
                  <div className="panel h-full min-h-[280px]" />
                )}
              </div>
            </div>

            <div className="min-h-[320px]">
              {top ? (
                <TopRiskLists
                  stranded={top.stranded}
                  mepsGap={top.mepsGap}
                />
              ) : (
                <div className="panel flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
                  Ingen data
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
