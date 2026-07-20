"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listRiskScores,
  refreshPortfolioRiskScores,
  getPortfolioRiskSummary,
  type RiskScoreRow,
} from "@/app/actions/risk-scores";
// Plan generation moved to /renovation scenario compare
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
import { formatNumber, cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ClipboardList,
  ShieldAlert,
  ArrowRight,
  Building2,
  ListTodo,
} from "lucide-react";

const MEPS_SV: Record<string, string> = {
  compliant: "Uppfyller",
  at_risk: "Risk",
  non_compliant: "Ej uppfyllt",
};

function scoreTone(score: number): {
  text: string;
  bar: string;
  chip: string;
} {
  if (score >= 70)
    return {
      text: "text-red-600",
      bar: "bg-red-500",
      chip: "border-red-200 bg-red-50 text-red-700",
    };
  if (score >= 40)
    return {
      text: "text-amber-600",
      bar: "bg-amber-500",
      chip: "border-amber-200 bg-amber-50 text-amber-800",
    };
  return {
    text: "text-emerald-600",
    bar: "bg-emerald-500",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}

export function RiskScoresView() {
  const qc = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [filter, setFilter] = useState<"all" | "high" | "financial">("all");
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

  const s = summaryQ.data;
  const rows = useMemo(() => {
    let list = listQ.data ?? [];
    if (filter === "high") list = list.filter((r) => r.combined_score >= 60);
    if (filter === "financial")
      list = list.filter((r) => r.financial_risk_flag);
    return list;
  }, [listQ.data, filter]);

  return (
    <div className="page-shell">
      <div className="page-inner">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              <h1 className="page-title">Kombinerad risk</h1>
              <HelpTip text="EPBD/MEPS (40 %) + CRREM misalignment (35 %) + fysisk risk (15 %) + datakvalitet (10 %) = 0–100. Finansiell risk om misalignment < 2035 (CSRD/ESRS E1)." />
            </div>
            <p className="page-subtitle">
              Börja med hög risk → skapa renovationsplan → slutför åtgärder.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <Button
              variant="outline"
              disabled={refresh.isPending}
              onClick={() => void refresh.mutateAsync()}
            >
              {refresh.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Räkna om portfölj
            </Button>
            <Button asChild>
              <Link href="/renovation">
                <ClipboardList className="h-4 w-4" />
                Renovationsplaner
              </Link>
            </Button>
          </div>
        </div>

        {/* Steps */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Step
            n="1"
            title="Räkna om risk"
            body="Uppdaterar score från MEPS, CRREM, fysisk risk och datakvalitet."
          />
          <Step
            n="2"
            title="Filtrera högrisk"
            body="Fokusera på score ≥ 60 eller finansiell risk före 2035."
          />
          <Step
            n="3"
            title="Jämför planer"
            body="Öppna Renovering och jämför billig / balanserad / aggressiv."
          />
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi
            label="Snitt risk"
            value={
              s?.avgCombined != null ? formatNumber(s.avgCombined, 1) : "—"
            }
            help="Portföljsnitt 0–100"
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <Kpi
            label="Hög risk ≥60"
            value={String(s?.highRiskCount ?? "—")}
            tone="text-red-600"
            active={filter === "high"}
            onClick={() => setFilter("high")}
          />
          <Kpi
            label="MEPS ej uppfyllt"
            value={String(s?.nonCompliantCount ?? "—")}
            tone="text-red-600"
          />
          <Kpi
            label="Finansiell risk"
            value={String(s?.financialRiskCount ?? "—")}
            help="Misalignment < 2035"
            tone="text-amber-600"
            active={filter === "financial"}
            onClick={() => setFilter("financial")}
          />
          <Kpi label="Byggnader" value={String(s?.buildingCount ?? "—")} />
        </div>

        {msg && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {msg}{" "}
            {msg.includes("Renovationsplan") && (
              <Link href="/renovation" className="font-medium underline">
                Öppna planer
              </Link>
            )}
          </div>
        )}
        {(refresh.isError || listQ.error) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {((refresh.error || listQ.error) as Error)?.message}
            {" · "}Kör Fas 8-migrering om tabellen saknas.
          </div>
        )}

        {listQ.isLoading && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Laddar risker…
          </div>
        )}

        {!listQ.isLoading && rows.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <h3 className="mt-3 text-lg font-semibold">
              {filter === "all" ? "Inga risk scores" : "Inga träffar i filtret"}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {filter === "all"
                ? "Klicka «Räkna om portfölj» efter att energidata importerats."
                : "Byt filter eller räkna om portföljen."}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button onClick={() => void refresh.mutateAsync()}>
                <RefreshCw className="h-4 w-4" /> Räkna om
              </Button>
              <Button variant="outline" asChild>
                <Link href="/import">Importera data</Link>
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-3">
          {rows.map((r) => (
            <RiskCard
              key={r.building_id}
              row={r}

            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
        {n}
      </div>
      <div className="mt-2 text-sm font-semibold">{title}</div>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function Kpi({
  label,
  value,
  help,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: string;
  help?: string;
  tone?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-2xl border bg-card p-4 text-left shadow-sm transition",
        onClick && "hover:-translate-y-0.5 hover:shadow-md",
        active ? "border-primary ring-2 ring-primary/20" : "border-border"
      )}
    >
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        {label}
        {help && <HelpTip text={help} />}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular", tone)}>
        {value}
      </div>
    </Comp>
  );
}

function RiskCard({ row: r }: { row: RiskScoreRow }) {
  const tone = scoreTone(r.combined_score);

  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/20 hover:shadow-md sm:p-5">
      <div className="flex flex-wrap items-start gap-4">
        {/* Score dial */}
        <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-border bg-secondary/50">
          <span className={cn("text-xl font-bold tabular", tone.text)}>
            {formatNumber(r.combined_score, 0)}
          </span>
          <span className="text-[10px] text-muted-foreground">score</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/buildings?building=${r.building_id}`}
              className="text-base font-semibold text-foreground hover:text-primary"
            >
              {r.building_name}
            </Link>
            {r.energy_class && (
              <Badge variant="outline">Klass {r.energy_class}</Badge>
            )}
            {r.financial_risk_flag && (
              <Badge variant="warning">
                <ShieldAlert className="mr-1 h-3 w-3" />
                Finansiell risk
              </Badge>
            )}
            {r.meps_status && (
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
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {r.property_name}
            {r.crrem_misalignment_year
              ? ` · Misalign ${r.crrem_misalignment_year}`
              : ""}
            {r.meps_2030_gap != null
              ? ` · Gap 2030: ${formatNumber(r.meps_2030_gap, 0)}`
              : ""}
          </p>

          {/* Component bars */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Bar label="MEPS" value={r.meps_score} />
            <Bar label="CRREM" value={r.crrem_score} />
            <Bar label="Fysisk" value={r.physical_score} />
            <Bar label="Data" value={r.data_quality_score} />
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full rounded-full transition-all", tone.bar)}
              style={{ width: `${Math.min(100, r.combined_score)}%` }}
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
          <Button asChild className="sm:min-w-[10rem]">
            <Link href="/renovation">
              <ClipboardList className="h-4 w-4" />
              Jämför planer
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/buildings?building=${r.building_id}`}>
              <Building2 className="h-4 w-4" />
              Byggnad
            </Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/actions">
              <ListTodo className="h-4 w-4" />
              Åtgärder
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

function Bar({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  const v = value ?? 0;
  const tone = scoreTone(v);
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular">{formatNumber(value, 0)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn("h-full rounded-full", tone.bar)}
          style={{ width: `${Math.min(100, v)}%` }}
        />
      </div>
    </div>
  );
}
