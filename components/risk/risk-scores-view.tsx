"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listRiskScores,
  refreshPortfolioRiskScores,
  getPortfolioRiskSummary,
} from "@/app/actions/risk-scores";
import { generateRenovationPlan } from "@/app/actions/renovation-plans";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { HelpTip } from "@/components/ui/help-tip";
import { formatNumber } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ClipboardList,
  ShieldAlert,
} from "lucide-react";

const MEPS_SV: Record<string, string> = {
  compliant: "Uppfyller",
  at_risk: "Risk",
  non_compliant: "Ej uppfyllt",
};

function scoreColor(score: number): string {
  if (score >= 70) return "text-gap-incomplete";
  if (score >= 40) return "text-gap-extrapolated";
  return "text-gap-complete";
}

function scoreBar(score: number): string {
  if (score >= 70) return "bg-gap-incomplete";
  if (score >= 40) return "bg-gap-extrapolated";
  return "bg-gap-complete";
}

export function RiskScoresView() {
  const qc = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [msg, setMsg] = useState<string | null>(null);

  const summaryQ = useQuery({
    queryKey: ["risk-summary", year],
    queryFn: async () => {
      const res = await getPortfolioRiskSummary(year);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const listQ = useQuery({
    queryKey: ["risk-scores", year],
    queryFn: async () => {
      const res = await listRiskScores({ year });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const refresh = useMutation({
    mutationFn: async () => {
      const res = await refreshPortfolioRiskScores(year);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (d) => {
      setMsg(`Beräknade risk för ${d.count} byggnader (${d.year}).`);
      void qc.invalidateQueries({ queryKey: ["risk-scores"] });
      void qc.invalidateQueries({ queryKey: ["risk-summary"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-kpis"] });
    },
  });

  const genPlan = useMutation({
    mutationFn: async (buildingId: string) => {
      const res = await generateRenovationPlan({
        building_id: buildingId,
        year,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (p) => {
      setMsg(`Renovationsplan skapad: ${p.title}`);
      void qc.invalidateQueries({ queryKey: ["renovation-plans"] });
    },
  });

  const s = summaryQ.data;

  return (
    <div className="flex h-full flex-col gap-1.5 p-2">
      <div className="panel flex flex-wrap items-center gap-2 rounded-md px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-terminal-accent" />
          <h1 className="text-sm font-semibold">Kombinerad risk</h1>
          <HelpTip text="EPBD/MEPS (40 %) + CRREM misalignment (35 %) + fysisk risk (15 %) + datakvalitet (10 %) = 0–100. Financial risk om misalignment < 2035 (CSRD/ESRS E1)." />
        </div>
        <label className="flex items-center gap-1 text-2xs text-terminal-muted">
          År
          <Select
            value={String(year)}
            onValueChange={(v) => setYear(Number(v))}
          >
            <SelectTrigger className="h-8 w-20">
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
          size="sm"
          className="ml-auto h-8 gap-1"
          disabled={refresh.isPending}
          onClick={() => void refresh.mutateAsync()}
        >
          {refresh.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Räkna om portfölj
        </Button>
        <Button size="sm" variant="terminal" className="h-8" asChild>
          <Link href="/renovation">Renovationsplaner</Link>
        </Button>
      </div>

      {msg && (
        <div className="rounded-md border border-gap-complete/30 bg-gap-complete/10 px-3 py-1.5 text-xs text-gap-complete">
          {msg}
        </div>
      )}
      {(refresh.isError || listQ.error) && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {(refresh.error as Error)?.message ||
            (listQ.error as Error)?.message}
          {" · "}Kör Fas 8-migrering om tabellen saknas.
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        <Kpi
          label="Snitt risk"
          value={s?.avgCombined != null ? formatNumber(s.avgCombined, 1) : "—"}
          help="Portföljsnitt 0–100"
        />
        <Kpi
          label="Hög risk ≥60"
          value={String(s?.highRiskCount ?? "—")}
          accent="text-gap-incomplete"
        />
        <Kpi
          label="MEPS ej uppfyllt"
          value={String(s?.nonCompliantCount ?? "—")}
          accent="text-gap-incomplete"
        />
        <Kpi
          label="Finansiell risk"
          value={String(s?.financialRiskCount ?? "—")}
          help="Misalignment < 2035"
          accent="text-gap-extrapolated"
        />
        <Kpi label="Byggnader" value={String(s?.buildingCount ?? "—")} />
      </div>

      <div className="panel min-h-0 flex-1 overflow-auto rounded-md">
        {listQ.isLoading && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Laddar risker…
          </div>
        )}
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-terminal-row text-2xs text-terminal-muted">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Byggnad</th>
              <th className="px-2 py-2 text-right font-medium">Kombinerad</th>
              <th className="px-2 py-2 text-right font-medium">MEPS</th>
              <th className="px-2 py-2 text-right font-medium">CRREM</th>
              <th className="px-2 py-2 text-right font-medium">Fysisk</th>
              <th className="px-2 py-2 text-right font-medium">Data</th>
              <th className="px-2 py-2 text-left font-medium">MEPS-status</th>
              <th className="px-2 py-2 text-right font-medium">Misalign</th>
              <th className="px-2 py-2 text-center font-medium">Fin.</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {(listQ.data ?? []).map((r) => (
              <tr
                key={r.building_id}
                className="border-t border-terminal-border/50 hover:bg-terminal-row/50"
              >
                <td className="px-2 py-1.5">
                  <Link
                    href={`/buildings?building=${r.building_id}`}
                    className="font-medium text-terminal-accent hover:underline"
                  >
                    {r.building_name}
                  </Link>
                  <div className="text-2xs text-terminal-muted">
                    {r.property_name}
                    {r.energy_class ? ` · klass ${r.energy_class}` : ""}
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right">
                  <div
                    className={`font-semibold tabular ${scoreColor(r.combined_score)}`}
                  >
                    {formatNumber(r.combined_score, 1)}
                  </div>
                  <div className="mt-0.5 h-1 w-16 ml-auto overflow-hidden rounded-full bg-terminal-row">
                    <div
                      className={`h-full ${scoreBar(r.combined_score)}`}
                      style={{ width: `${Math.min(100, r.combined_score)}%` }}
                    />
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right tabular">
                  {formatNumber(r.meps_score, 0)}
                </td>
                <td className="px-2 py-1.5 text-right tabular">
                  {formatNumber(r.crrem_score, 0)}
                </td>
                <td className="px-2 py-1.5 text-right tabular">
                  {formatNumber(r.physical_score, 0)}
                </td>
                <td className="px-2 py-1.5 text-right tabular">
                  {formatNumber(r.data_quality_score, 0)}
                </td>
                <td className="px-2 py-1.5">
                  {r.meps_status ? (
                    <Badge
                      variant={
                        r.meps_status === "compliant"
                          ? "success"
                          : r.meps_status === "at_risk"
                            ? "warning"
                            : "danger"
                      }
                    >
                      {MEPS_SV[r.meps_status] ?? r.meps_status}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular text-gap-extrapolated">
                  {r.crrem_misalignment_year ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-center">
                  {r.financial_risk_flag ? (
                    <ShieldAlert className="mx-auto h-3.5 w-3.5 text-gap-incomplete" />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-0.5 text-2xs"
                    disabled={genPlan.isPending}
                    onClick={() => void genPlan.mutateAsync(r.building_id)}
                    title="Generera renovationsplan"
                  >
                    <ClipboardList className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
            {!listQ.isLoading && (listQ.data?.length ?? 0) === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-terminal-muted" />
                  Inga risk scores. Klicka &quot;Räkna om portfölj&quot; (kräver
                  Fas 8-migrering).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  help,
  accent,
}: {
  label: string;
  value: string;
  help?: string;
  accent?: string;
}) {
  return (
    <div className="panel rounded-md p-2.5">
      <div className="flex items-center gap-1 text-2xs text-terminal-muted">
        {label}
        {help && <HelpTip text={help} />}
      </div>
      <div className={`mt-0.5 text-lg font-semibold tabular ${accent ?? ""}`}>
        {value}
      </div>
    </div>
  );
}
