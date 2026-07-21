"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getBuildingScorecard } from "@/app/actions/building-scorecard";
import { exportBuildingDecisionPdf } from "@/app/actions/export-decision-pdf";
import { DataQualityBanner } from "@/components/ui/data-quality-banner";
import { toUserError } from "@/lib/errors";
import { EmptyState } from "@/components/ui/empty-state";
import {
  simulateAction,
  type SimulationResult,
} from "@/app/actions/action-application";
import { calculateBuildingRiskScore } from "@/app/actions/risk-scores";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpTip } from "@/components/ui/help-tip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EnergyClassBadge } from "@/components/energy/energy-class-badge";
import { DataGapBadge } from "@/components/energy/data-gap-badge";
import { ProvenanceModal } from "@/components/energy/provenance-modal";
import { formatNumber, formatKwh, cn } from "@/lib/utils";
import type { DataGapStatus, EnergyClass } from "@/lib/supabase/database.types";
import {
  ArrowLeft,
  Building2,
  Download,
  GitCompare,
  ListTodo,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  FileSearch,
  LineChart,
  CheckCircle2,
} from "lucide-react";

const MEPS_SV: Record<string, string> = {
  compliant: "Uppfyller",
  at_risk: "Risk",
  non_compliant: "Ej uppfyllt",
};

const STATUS_SV: Record<string, string> = {
  proposed: "Föreslagen",
  approved: "Godkänd",
  in_progress: "Pågår",
};

function scoreTone(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 60) return "text-red-600";
  if (score >= 40) return "text-amber-600";
  return "text-emerald-600";
}

function mepsTone(status: string | null, gap: number | null): string {
  if (status === "compliant" || (gap != null && gap <= 0))
    return "border-emerald-200 bg-emerald-50";
  if (status === "at_risk" || (gap != null && gap <= 30))
    return "border-amber-200 bg-amber-50";
  if (status === "non_compliant" || (gap != null && gap > 30))
    return "border-red-200 bg-red-50";
  return "border-border bg-card";
}

function downloadBase64Pdf(base64: string, fileName: string) {
  const a = document.createElement("a");
  a.href = `data:application/pdf;base64,${base64}`;
  a.download = fileName;
  a.click();
}

export function BuildingScorecardView({
  buildingId,
  initialYear,
}: {
  buildingId: string;
  initialYear?: number;
}) {
  const [year, setYear] = useState(
    initialYear ?? new Date().getFullYear() - 1
  );
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const [simActionId, setSimActionId] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["building-scorecard", buildingId, year],
    queryFn: async () => {
      const res = await getBuildingScorecard({
        building_id: buildingId,
        year,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const refreshRisk = useMutation({
    mutationFn: async () => {
      const res = await calculateBuildingRiskScore({
        building_id: buildingId,
        year,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      setMsg("Risk omräknad.");
      void refetch();
    },
  });

  const exportPdf = useMutation({
    mutationFn: async () => {
      const res = await exportBuildingDecisionPdf({
        building_id: buildingId,
        year,
        plan_id: data?.open_plan?.id,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (file) => {
      downloadBase64Pdf(file.fileBase64, file.fileName);
      setMsg("Beslutsunderlag nedladdat.");
    },
  });

  const simulateMut = useMutation({
    mutationFn: async (actionId: string) => {
      const res = await simulateAction({ action_id: actionId, year });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (sim) => setSimulation(sim),
  });

  function openSim(id: string) {
    setSimActionId(id);
    setSimulation(null);
    void simulateMut.mutateAsync(id);
  }

  if (isLoading) {
    return (
      <div className="page-shell">
        <div className="page-inner">
          <div className="rounded-2xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
            Laddar betyg…
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-shell">
        <div className="page-inner max-w-5xl">
          <EmptyState
            icon={ShieldAlert}
            title="Kunde inte ladda betyg"
            body={toUserError(
              error,
              "Kontrollera att du är inloggad och att byggnaden finns."
            )}
            why="Utan prestanda och riskdata kan vi inte visa beslutsunderlag."
            ctaLabel="Tillbaka till riskscore"
            ctaHref="/risk-scores"
          />
        </div>
      </div>
    );
  }

  const g = data.grades;
  const actionTitle =
    data.top_actions.find((a) => a.id === simActionId)?.title ?? "Åtgärd";
  const gap = g.data_gap_status;
  const dqLevel =
    gap === "INCOMPLETE_DATA"
      ? ("blocked" as const)
      : gap === "EXTRAPOLATED_WARNING"
        ? ("warning" as const)
        : gap == null
          ? ("warning" as const)
          : ("ok" as const);

  return (
    <div className="page-shell">
      <div className="page-inner max-w-5xl space-y-4">
        <div className="mb-0 flex flex-wrap items-center gap-3 text-sm">
          {data.property.id ? (
            <Link
              href={`/properties/${data.property.id}`}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              {data.property.name}
            </Link>
          ) : null}
          <Link
            href="/risk-scores"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
          >
            Risköversikt
          </Link>
        </div>

        <DataQualityBanner
          level={dqLevel}
          incompleteCount={gap === "INCOMPLETE_DATA" ? 1 : 0}
          extrapolatedCount={gap === "EXTRAPOLATED_WARNING" ? 1 : 0}
          context="beslutsunderlag och PDF"
        />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              <h1 className="page-title">{data.building.name}</h1>
              {g.financial_risk_flag && (
                <Badge variant="warning">
                  <ShieldAlert className="mr-1 h-3 w-3" />
                  Finansiell risk före 2035
                </Badge>
              )}
            </div>
            <p className="page-subtitle">
              {data.property.name}
              {data.property.municipality
                ? ` · ${data.property.municipality}`
                : ""}
              {data.building.construction_year
                ? ` · Byggår ${data.building.construction_year}`
                : ""}
            </p>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Husets läge mot lagkrav 2030 och klimatmål. Rött = prioritera
              åtgärder. Härifrån planerar du och tar ut underlag till ledningen.
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
              disabled={refreshRisk.isPending}
              onClick={() => void refreshRisk.mutateAsync()}
            >
              {refreshRisk.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Räkna om risk
            </Button>
          </div>
        </div>

        {msg && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {msg}
          </div>
        )}
        {(exportPdf.isError || refreshRisk.isError) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {toUserError(exportPdf.error || refreshRisk.error)}
          </div>
        )}

        {/* Grade tiles */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <GradeCard
            label="Energiklass"
            help="Primärenergital jämfört med referens – A bäst, G sämst."
            className="border-border bg-card"
          >
            <EnergyClassBadge value={g.energy_class as EnergyClass | null} />
            <p className="mt-2 text-xs text-muted-foreground">
              {g.energy_intensity != null
                ? `${formatNumber(g.energy_intensity, 1)} kWh/m²`
                : "Ingen intensitet"}
            </p>
          </GradeCard>

          <GradeCard
            label="Krav 2030"
            help="Hur långt byggnaden är från lagkrav på energi 2030 (MEPS)."
            className={mepsTone(g.meps_status, g.meps_2030_gap)}
          >
            <div className="text-lg font-semibold">
              {g.meps_status
                ? MEPS_SV[g.meps_status] ?? g.meps_status
                : "—"}
            </div>
            <p className="mt-1 text-sm tabular text-muted-foreground">
              Gap {formatNumber(g.meps_2030_gap, 1)} kWh/m²
            </p>
          </GradeCard>

          <GradeCard
            label="Klimatriskår"
            help="År då utsläppen riskerar att passera CRREM-banan. Ju tidigare, desto mer bråttom."
            className={
              g.financial_risk_flag
                ? "border-amber-200 bg-amber-50"
                : "border-border bg-card"
            }
          >
            <div
              className={cn(
                "text-2xl font-semibold tabular",
                g.financial_risk_flag ? "text-amber-800" : "text-foreground"
              )}
            >
              {g.crrem_stranding_year ?? "—"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {g.financial_risk_flag
                ? "Före 2035 – prioritera"
                : "Misalignment-år (CRREM)"}
            </p>
          </GradeCard>

          <GradeCard
            label="Samlad risk"
            help="0–100: krav, klimatrisk, fysisk risk och datakvalitet."
            className="border-border bg-card"
          >
            <div
              className={cn(
                "text-2xl font-semibold tabular",
                scoreTone(g.combined_score)
              )}
            >
              {g.combined_score != null
                ? formatNumber(g.combined_score, 0)
                : "—"}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / 100
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1">
              <MiniBar label="Krav" v={g.meps_score} />
              <MiniBar label="Klimat" v={g.crrem_score} />
              <MiniBar label="Fysisk" v={g.physical_score} />
              <MiniBar label="Data" v={g.data_quality_score} />
            </div>
          </GradeCard>
        </div>

        {/* Data quality */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm shadow-sm">
          <span className="text-muted-foreground">Datakvalitet</span>
          <DataGapBadge
            status={g.data_gap_status as DataGapStatus | null}
            completeness={g.data_completeness_percent ?? undefined}
          />
          {g.data_gap_status === "INCOMPLETE_DATA" && (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/data-edit?building=${buildingId}&year=${year}`}>
                Komplettera data
              </Link>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setProvenanceOpen(true)}
          >
            <FileSearch className="h-4 w-4" />
            Så räknades resultatet
          </Button>
          {isFetching && (
            <span className="text-xs text-muted-foreground">Uppdaterar…</span>
          )}
        </div>

        {/* CTAs */}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/renovation?building=${buildingId}`}>
              <GitCompare className="h-4 w-4" />
              Jämför planer
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/actions">
              <ListTodo className="h-4 w-4" />
              Alla åtgärder
            </Link>
          </Button>
          <Button
            variant="outline"
            disabled={exportPdf.isPending}
            onClick={() => void exportPdf.mutateAsync()}
          >
            {exportPdf.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Exportera beslutsunderlag
          </Button>
          <Button variant="ghost" asChild>
            <Link href={`/crrem?building=${buildingId}&year=${year}`}>
              <LineChart className="h-4 w-4" />
              Klimatriskgraf
            </Link>
          </Button>
        </div>

        {/* Open plan banner */}
        {data.open_plan && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Aktiv plan: {data.open_plan.title}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Status {data.open_plan.status}
                {data.open_plan.baseline_combined_score != null &&
                data.open_plan.projected_combined_score != null
                  ? ` · Risk ${formatNumber(data.open_plan.baseline_combined_score, 0)} → ${formatNumber(data.open_plan.projected_combined_score, 0)}`
                  : ""}
                {data.open_plan.total_estimated_cost != null
                  ? ` · ${formatNumber(data.open_plan.total_estimated_cost / 1000, 0)} tkr`
                  : ""}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/renovation">Öppna planer</Link>
            </Button>
          </div>
        )}

        {/* Actions to improve */}
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Så här förbättrar du</h2>
            <p className="text-sm text-muted-foreground">
              Simulera en åtgärd för att se effekt på kravgap, klimatriskår och
              samlad risk – utan att spara. Eller jämför hela planer.
            </p>
          </div>

          {data.top_actions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
              <ListTodo className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-3 text-base font-semibold">
                Inga öppna åtgärder
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Skapa åtgärder eller generera en renovationsplan så får du
                förslag som sänker risk och skjuter klimatriskåret.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href={`/renovation?building=${buildingId}`}>
                    Jämför planer
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/actions">Skapa åtgärd</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              {data.top_actions.map((a) => (
                <article
                  key={a.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{a.title}</h3>
                      <Badge variant="outline">
                        {STATUS_SV[a.status] ?? a.status}
                      </Badge>
                      {a.priority_score != null && (
                        <span className="text-xs text-muted-foreground">
                          Prio {formatNumber(a.priority_score, 2)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {a.estimated_saving_kwh != null
                        ? `Spar ${formatKwh(a.estimated_saving_kwh)}/år`
                        : "Ingen spar angiven"}
                      {a.investment_cost != null
                        ? ` · ${formatNumber(a.investment_cost / 1000, 0)} tkr`
                        : ""}
                      {a.payback_years != null
                        ? ` · payback ${formatNumber(a.payback_years, 1)} år`
                        : ""}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => openSim(a.id)}>
                    <Play className="h-4 w-4" />
                    Simulera
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <ProvenanceModal
        open={provenanceOpen}
        onOpenChange={setProvenanceOpen}
        buildingId={buildingId}
        year={year}
      />

      <Dialog
        open={Boolean(simActionId)}
        onOpenChange={(o) => {
          if (!o) {
            setSimActionId(null);
            setSimulation(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Simulering</DialogTitle>
            <DialogDescription>
              {actionTitle} – inget sparas förrän du markerar klar under
              Åtgärder.
            </DialogDescription>
          </DialogHeader>
          {simulateMut.isPending && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Beräknar…
            </div>
          )}
          {simulateMut.isError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {(simulateMut.error as Error).message}
            </div>
          )}
          {simulation && (
            <div className="grid grid-cols-2 gap-2">
              <SimCell
                label="kWh/m²"
                before={formatNumber(simulation.baseline.energy_intensity, 1)}
                after={formatNumber(simulation.projected.energy_intensity, 1)}
              />
              <SimCell
                label="Kravgap 2030"
                before={formatNumber(simulation.baseline.meps_2030_gap, 1)}
                after={formatNumber(simulation.projected.meps_2030_gap, 1)}
              />
              <SimCell
                label="Klimatriskår"
                before={String(
                  simulation.baseline.crrem_stranding_year ?? "—"
                )}
                after={String(
                  simulation.projected.crrem_stranding_year ?? "—"
                )}
              />
              <SimCell
                label="Samlad risk"
                before={formatNumber(simulation.baseline.combined_score, 0)}
                after={formatNumber(simulation.projected.combined_score, 0)}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSimActionId(null);
                setSimulation(null);
              }}
            >
              Stäng
            </Button>
            <Button asChild>
              <Link href="/actions">Till åtgärder (markera klar)</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GradeCard({
  label,
  help,
  className,
  children,
}: {
  label: string;
  help: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 shadow-sm",
        className ?? "border-border bg-card"
      )}
    >
      <div className="mb-2 flex items-center gap-1 text-sm text-muted-foreground">
        {label}
        <HelpTip text={help} />
      </div>
      {children}
    </div>
  );
}

function MiniBar({ label, v }: { label: string; v: number | null }) {
  const n = v ?? 0;
  return (
    <div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular">{formatNumber(v, 0)}</span>
      </div>
      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary/70"
          style={{ width: `${Math.min(100, n)}%` }}
        />
      </div>
    </div>
  );
}

function SimCell({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) {
  return (
    <div className="rounded-xl bg-secondary/50 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular">
        <span className="text-muted-foreground">{before}</span>
        <span className="mx-1 text-muted-foreground">→</span>
        <span className="text-emerald-700">{after}</span>
      </div>
    </div>
  );
}

