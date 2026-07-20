"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  getDashboardKpis,
  getRiskHeatmap,
  getTopRiskLists,
} from "@/app/actions/dashboard";
import { countOpenWorkflowAlerts } from "@/app/actions/risk-workflow";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { RiskHeatmap } from "@/components/dashboard/risk-heatmap";
import { TopRiskLists } from "@/components/dashboard/top-risk-lists";
import { DataGapChart } from "@/components/dashboard/data-gap-chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HelpTip } from "@/components/ui/help-tip";
import { TERMS } from "@/lib/labels";
import { BookOpen, AlertTriangle, Sparkles } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";

export function DashboardView() {
  const [year, setYear] = useState(new Date().getFullYear() - 1);

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

  const alertsQ = useQuery({
    queryKey: ["workflow-alerts"],
    queryFn: async () => {
      const res = await countOpenWorkflowAlerts();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  return (
    <div className="flex h-full flex-col gap-1.5 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="text-sm font-semibold text-foreground">
            {TERMS.overview.label}
          </h1>
          <HelpTip text={TERMS.overview.help} />
          <span className="hidden text-xs text-terminal-muted sm:inline">
            Portföljens energi, krav och datakvalitet
          </span>
          {(kpisQ.isFetching || heatQ.isFetching || topQ.isFetching) && (
            <span className="text-2xs text-terminal-muted">Uppdaterar…</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/guide"
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-2xs text-terminal-muted transition hover:bg-terminal-row hover:text-terminal-accent"
          >
            <BookOpen className="h-3 w-3" />
            Guide
          </Link>
          <label className="flex items-center gap-1.5 text-2xs text-terminal-muted">
            <span>År</span>
            <Select
              value={String(year)}
              onValueChange={(v) => setYear(Number(v))}
            >
              <SelectTrigger className="h-7 w-24">
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
        </div>
      </div>

      {kpisQ.error && (
        <div className="panel rounded-md px-3 py-2 text-xs text-destructive">
          {(kpisQ.error as Error).message}
        </div>
      )}

      {alertsQ.data &&
        (alertsQ.data.openCompliance > 0 ||
          alertsQ.data.openPhysical > 0 ||
          alertsQ.data.declarationSuggestions > 0) && (
          <div className="flex flex-wrap gap-2">
            {alertsQ.data.openCompliance > 0 && (
              <Link
                href="/risks"
                className="inline-flex items-center gap-1.5 rounded-md border border-gap-incomplete/40 bg-gap-incomplete/10 px-2.5 py-1 text-2xs text-gap-incomplete hover:bg-gap-incomplete/20"
              >
                <AlertTriangle className="h-3 w-3" />
                {alertsQ.data.openCompliance} öppna MEPS/CRREM-risker
              </Link>
            )}
            {alertsQ.data.openPhysical > 0 && (
              <Link
                href="/risks"
                className="inline-flex items-center gap-1.5 rounded-md border border-gap-extrapolated/40 bg-gap-extrapolated/10 px-2.5 py-1 text-2xs text-gap-extrapolated hover:bg-gap-extrapolated/20"
              >
                <AlertTriangle className="h-3 w-3" />
                {alertsQ.data.openPhysical} öppna fysiska risker
              </Link>
            )}
            {alertsQ.data.declarationSuggestions > 0 && (
              <Link
                href="/actions"
                className="inline-flex items-center gap-1.5 rounded-md border border-terminal-accent/40 bg-terminal-accent/10 px-2.5 py-1 text-2xs text-terminal-accent hover:bg-terminal-accent/20"
              >
                <Sparkles className="h-3 w-3" />
                {alertsQ.data.declarationSuggestions} deklarationsförslag
              </Link>
            )}
          </div>
        )}

      {kpisQ.data && <KpiCards kpis={kpisQ.data} />}

      <Group orientation="vertical" className="min-h-0 flex-1">
        <Panel defaultSize="48" minSize="20" className="min-h-0">
          <Group orientation="horizontal" className="h-full">
            <Panel defaultSize="55" minSize="30" className="min-h-0">
              {heatQ.data ? (
                <RiskHeatmap cells={heatQ.data} />
              ) : (
                <div className="panel flex h-full items-center justify-center rounded-md text-xs text-muted-foreground">
                  {heatQ.isLoading
                    ? "Laddar risköversikt…"
                    : "Ingen data för valt år"}
                </div>
              )}
            </Panel>
            <Separator className="w-1.5 bg-terminal-border transition hover:bg-terminal-accent" />
            <Panel defaultSize="45" minSize="25" className="min-h-0">
              {kpisQ.data ? (
                <DataGapChart kpis={kpisQ.data} />
              ) : (
                <div className="panel h-full rounded-md" />
              )}
            </Panel>
          </Group>
        </Panel>
        <Separator className="h-1.5 bg-terminal-border transition hover:bg-terminal-accent" />
        <Panel defaultSize="52" minSize="25" className="min-h-0">
          {topQ.data ? (
            <TopRiskLists
              stranded={topQ.data.stranded}
              mepsGap={topQ.data.mepsGap}
            />
          ) : (
            <div className="panel flex h-full items-center justify-center rounded-md text-xs text-muted-foreground">
              {topQ.isLoading ? "Laddar prioriteringslistor…" : "Ingen data"}
            </div>
          )}
        </Panel>
      </Group>
    </div>
  );
}
