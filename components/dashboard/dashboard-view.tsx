"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  getDashboardKpis,
  getRiskHeatmap,
  getTopRiskLists,
  getYearOverYear,
  getDecisionBoard,
} from "@/app/actions/dashboard";
import { countOpenWorkflowAlerts } from "@/app/actions/risk-workflow";
import { getPortfolioRiskSummary } from "@/app/actions/risk-scores";
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
} from "lucide-react";

const LS_YEAR = "ep.dashboard.year";
const LS_PROPERTY = "ep.dashboard.property";

export function DashboardView() {
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [propertyId, setPropertyId] = useState("");
  const [hydrated, setHydrated] = useState(false);

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

  // Client-side filter for heatmap/top when property selected
  // (KPIs remain portfolio unless we filter in UI lists)

  const kpisQ = useQuery({
    queryKey: ["dashboard-kpis", year],
    queryFn: async () => {
      const res = await getDashboardKpis(year);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const heatQ = useQuery({
    queryKey: ["dashboard-heatmap", year],
    queryFn: async () => {
      const res = await getRiskHeatmap(year);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const topQ = useQuery({
    queryKey: ["dashboard-top", year],
    queryFn: async () => {
      const res = await getTopRiskLists(year, 12);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const yoyQ = useQuery({
    queryKey: ["dashboard-yoy", year, propertyId || "all"],
    queryFn: async () => {
      const res = await getYearOverYear(year, propertyId || undefined);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const boardQ = useQuery({
    queryKey: ["dashboard-board", year, propertyId || "all"],
    queryFn: async () => {
      const res = await getDecisionBoard(year, propertyId || undefined, 10);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
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
  });

  const alertsQ = useQuery({
    queryKey: ["workflow-alerts"],
    queryFn: async () => {
      const res = await countOpenWorkflowAlerts();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const riskSumQ = useQuery({
    queryKey: ["risk-summary", year],
    queryFn: async () => {
      const res = await getPortfolioRiskSummary(year);
      if (!res.success) return null;
      return res.data;
    },
  });

  const heatCells = propertyId
    ? (heatQ.data ?? []).filter((c) => c.property_id === propertyId)
    : heatQ.data;

  return (
    <div className="page-shell">
      <div className="page-inner space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">Beslutstavla</h1>
              <HelpTip text="Portföljöversikt med prioriteter, år-mot-år och CSRD-nyckeltal. Filtrera på fastighet för att zooma in." />
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

        {/* Alerts */}
        <div className="flex flex-wrap gap-2">
          {riskSumQ.data && (
            <Link
              href="/risk-scores"
              className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100"
            >
              <Activity className="h-3.5 w-3.5" />
              Snitt risk {riskSumQ.data.avgCombined ?? "—"} ·{" "}
              {riskSumQ.data.highRiskCount} hög
            </Link>
          )}
          {riskSumQ.data && riskSumQ.data.financialRiskCount > 0 && (
            <Link
              href="/risk-scores"
              className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {riskSumQ.data.financialRiskCount} med misalignment före 2035
            </Link>
          )}
          {alertsQ.data && alertsQ.data.openCompliance > 0 && (
            <Link
              href="/risks"
              className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {alertsQ.data.openCompliance} öppna MEPS/CRREM-risker
            </Link>
          )}
          {alertsQ.data && alertsQ.data.declarationSuggestions > 0 && (
            <Link
              href="/actions"
              className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {alertsQ.data.declarationSuggestions} deklarationsförslag
            </Link>
          )}
        </div>

        {kpisQ.error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {toUserError(kpisQ.error)}
          </div>
        )}

        {kpisQ.data && <KpiCards kpis={kpisQ.data} />}

        {yoyQ.data && <YoyStrip data={yoyQ.data} />}

        {boardQ.data && <DecisionBoard items={boardQ.data} year={year} />}

        {csrdQ.data && (
          <CsrdMetricsPanel
            data={csrdQ.data}
            propertyId={propertyId || undefined}
          />
        )}

        {(kpisQ.isFetching ||
          heatQ.isFetching ||
          topQ.isFetching ||
          boardQ.isFetching) && (
          <p className="text-xs text-muted-foreground">Uppdaterar…</p>
        )}

        <div className="grid gap-4 lg:grid-cols-5">
          <div className="min-h-[280px] lg:col-span-3">
            {heatCells ? (
              <RiskHeatmap cells={heatCells} />
            ) : (
              <div className="panel flex h-full min-h-[280px] items-center justify-center text-sm text-muted-foreground">
                {heatQ.isLoading
                  ? "Laddar risköversikt…"
                  : "Ingen data – importera energivärden först"}
              </div>
            )}
          </div>
          <div className="min-h-[280px] lg:col-span-2">
            {kpisQ.data ? (
              <DataGapChart kpis={kpisQ.data} />
            ) : (
              <div className="panel h-full min-h-[280px]" />
            )}
          </div>
        </div>

        <div className="min-h-[320px]">
          {topQ.data ? (
            <TopRiskLists
              stranded={topQ.data.stranded}
              mepsGap={topQ.data.mepsGap}
            />
          ) : (
            <div className="panel flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
              {topQ.isLoading ? "Laddar prioriteringslistor…" : "Ingen data"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
