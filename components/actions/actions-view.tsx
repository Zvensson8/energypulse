"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listPortfolioActions,
  recalculateActionPriorities,
  type PortfolioActionRow,
} from "@/app/actions/actions-priority";
import { createAction } from "@/app/actions/actions-crud";
import {
  completeAction,
  revertActionApplication,
  simulateAction,
  type SimulationResult,
} from "@/app/actions/action-application";
import { runImprovementDetection } from "@/app/actions/improvement-detect";
import {
  acceptMitigationPlan,
  generateMitigationPlan,
  type MitigationPlan,
} from "@/app/actions/mitigation-plans";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatNumber, formatKwh, cn } from "@/lib/utils";
import {
  Loader2,
  RefreshCw,
  Plus,
  TrendingDown,
  CheckCircle2,
  Undo2,
  Sparkles,
  ClipboardList,
  ListTodo,
  ArrowRight,
  Building2,
  Play,
} from "lucide-react";

const STATUS_SV: Record<string, string> = {
  proposed: "Föreslagen",
  approved: "Godkänd",
  in_progress: "Pågår",
  completed: "Klar",
  cancelled: "Avbruten",
};

const CATEGORY_SV: Record<string, string> = {
  envelope: "Klimatskal",
  hvac: "VS/HVAC",
  lighting: "Belysning",
  controls: "Styr & regler",
  renewable: "Förnybart",
  behaviour: "Beteende",
  other: "Övrigt",
};

export function ActionsView() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [createOpen, setCreateOpen] = useState(false);
  const [simulateId, setSimulateId] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [planBuilding, setPlanBuilding] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["portfolio-actions", status, year],
    queryFn: async () => {
      const res = await listPortfolioActions({
        status: status === "all" ? null : status,
        year,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["portfolio-actions"] });
    void qc.invalidateQueries({ queryKey: ["dashboard-kpis"] });
    void qc.invalidateQueries({ queryKey: ["buildings-table"] });
  };

  const recalc = useMutation({
    mutationFn: async () => {
      const res = await recalculateActionPriorities({ year });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => invalidate(),
  });

  const detect = useMutation({
    mutationFn: async () => {
      const res = await runImprovementDetection();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (d) => {
      setMsg(
        `Förbättringsanalys: ${d.candidates} kandidater, ${d.created} nya deklarationsförslag.`
      );
      invalidate();
    },
  });

  const simulateMut = useMutation({
    mutationFn: async (actionId: string) => {
      const res = await simulateAction({ action_id: actionId, year });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (sim) => {
      setSimulation(sim);
    },
  });

  const completeMut = useMutation({
    mutationFn: async (actionId: string) => {
      const res = await completeAction({
        action_id: actionId,
        year,
        reason: "Bekräftad efter simulering",
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (diff) => {
      setSimulateId(null);
      setSimulation(null);
      setMsg(
        `Tillämpad: MEPS ${formatNumber(diff.baseline_meps_2030_gap, 1)} → ${formatNumber(diff.result_meps_2030_gap, 1)}, riskår ${diff.baseline_stranding_year ?? "—"} → ${diff.result_stranding_year ?? "—"}`
      );
      invalidate();
    },
  });

  const revertMut = useMutation({
    mutationFn: async (applicationId: string) => {
      const reason = window.prompt(
        "Motivering för att återställa (minst 5 tecken):"
      );
      if (!reason || reason.trim().length < 5) {
        throw new Error("Motivering krävs");
      }
      const res = await revertActionApplication({
        application_id: applicationId,
        reason: reason.trim(),
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      setMsg("Tillämpning återställd – prestanda omräknad.");
      invalidate();
    },
  });

  const rows = data?.rows ?? [];
  const weights = data?.weights;

  const stats = useMemo(() => {
    const proposed = rows.filter((r) => r.status === "proposed").length;
    const inFlight = rows.filter(
      (r) => r.status === "approved" || r.status === "in_progress"
    ).length;
    const done = rows.filter((r) => r.status === "completed").length;
    const saving = rows.reduce(
      (s, r) => s + (r.estimated_saving_kwh ?? 0),
      0
    );
    return { proposed, inFlight, done, saving, total: rows.length };
  }, [rows]);

  const simulateTarget = rows.find((r) => r.id === simulateId);

  function openSimulate(actionId: string) {
    setSimulateId(actionId);
    setSimulation(null);
    void simulateMut.mutateAsync(actionId);
  }

  function closeSimulate() {
    setSimulateId(null);
    setSimulation(null);
  }

  return (
    <div className="page-shell">
      <div className="page-inner">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">Åtgärder</h1>
              <HelpTip text="Simulera visar före/efter utan att ändra något. Markera klar tillämpar modeled spar och uppdaterar MEPS/CRREM." />
            </div>
            <p className="page-subtitle">
              Simulera först – se effekten – sedan markera klar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={detect.isPending}
              onClick={() => void detect.mutateAsync()}
            >
              {detect.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Hitta deklarationsförslag
            </Button>
            <Button
              variant="outline"
              disabled={recalc.isPending}
              onClick={() => void recalc.mutateAsync()}
            >
              {recalc.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Räkna om prioritet
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Ny åtgärd
            </Button>
          </div>
        </div>

        {/* How-to strip */}
        <div className="grid gap-3 sm:grid-cols-3">
          <HowCard
            n="1"
            title="Välj en åtgärd"
            body="Sorterad efter prioritet (krav, klimatrisk, payback)."
          />
          <HowCard
            n="2"
            title="Simulera"
            body="Se före/efter (MEPS, riskår, riskscore) utan att spara något."
          />
          <HowCard
            n="3"
            title="Markera klar / plan"
            body="Tillämpa modeled spar, eller jämför A/B/C-scenarier under Renovering."
          />
        </div>

        {/* KPI summary */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Totalt"
            value={String(stats.total)}
            sub={isFetching ? "Uppdaterar…" : "i listan"}
            onClick={() => setStatus("all")}
            active={status === "all"}
          />
          <StatCard
            label="Att besluta"
            value={String(stats.proposed)}
            sub="föreslagna"
            tone="text-indigo-600"
            onClick={() => setStatus("proposed")}
            active={status === "proposed"}
          />
          <StatCard
            label="Pågår"
            value={String(stats.inFlight)}
            sub="godkända / pågår"
            tone="text-amber-600"
            onClick={() => setStatus("in_progress")}
            active={status === "in_progress" || status === "approved"}
          />
          <StatCard
            label="Sparpotential"
            value={formatKwh(stats.saving)}
            sub={`${stats.done} klara`}
            tone="text-emerald-600"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["all", "Alla"],
                ["proposed", "Föreslagna"],
                ["approved", "Godkända"],
                ["in_progress", "Pågår"],
                ["completed", "Klara"],
              ] as const
            ).map(([v, label]) => (
              <Button
                key={v}
                size="sm"
                variant={status === v ? "default" : "outline"}
                onClick={() => setStatus(v)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <span>Prestandaår</span>
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
          </div>
          {weights && (
            <span className="hidden text-xs text-muted-foreground xl:inline">
              Vikter: krav {Math.round(weights.meps * 100)}% · klimat{" "}
              {Math.round(weights.crrem * 100)}% · payback{" "}
              {Math.round(weights.payback * 100)}%
            </span>
          )}
        </div>

        {msg && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {msg}
          </div>
        )}
        {(recalc.isError ||
          detect.isError ||
          completeMut.isError ||
          revertMut.isError ||
          error) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {(
              (recalc.error ||
                detect.error ||
                completeMut.error ||
                revertMut.error ||
                error) as Error
            )?.message}
          </div>
        )}

        {/* Action cards */}
        {isLoading && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Laddar åtgärder…
          </div>
        )}

        {!isLoading && rows.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
            <ListTodo className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <h3 className="mt-3 text-lg font-semibold">Inga åtgärder ännu</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Skapa en åtgärd, kör förbättringsanalys, eller generera en plan
              från riskscore.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Ny åtgärd
              </Button>
              <Button variant="outline" asChild>
                <Link href="/risk-scores">Till riskscore</Link>
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-3">
          {rows.map((r) => (
            <ActionCard
              key={r.id}
              row={r}
              onSimulate={() => openSimulate(r.id)}
              onRevert={
                r.application_id
                  ? () => void revertMut.mutateAsync(r.application_id!)
                  : undefined
              }
              onPlan={() =>
                setPlanBuilding({ id: r.building_id, name: r.building_name })
              }
              reverting={revertMut.isPending}
            />
          ))}
        </div>
      </div>

      {/* Simulate → confirm complete dialog */}
      <Dialog
        open={Boolean(simulateId)}
        onOpenChange={(o) => !o && closeSimulate()}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Simulering</DialogTitle>
            <DialogDescription>
              {simulateTarget ? (
                <>
                  <span className="font-medium text-foreground">
                    {simulateTarget.title}
                  </span>
                  {" · "}
                  {simulateTarget.building_name}
                </>
              ) : (
                "Dry-run med samma motor som vid Klar – inget sparas ännu."
              )}
            </DialogDescription>
          </DialogHeader>

          {simulateMut.isPending && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Beräknar före → efter…
            </div>
          )}

          {simulateMut.isError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {(simulateMut.error as Error).message}
            </div>
          )}

          {simulation && !simulateMut.isPending && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <SimMetric
                  label="kWh/m²"
                  before={formatNumber(simulation.baseline.energy_intensity, 1)}
                  after={formatNumber(simulation.projected.energy_intensity, 1)}
                />
                <SimMetric
                  label="MEPS-gap 2030"
                  before={formatNumber(simulation.baseline.meps_2030_gap, 1)}
                  after={formatNumber(simulation.projected.meps_2030_gap, 1)}
                />
                <SimMetric
                  label="Riskår"
                  before={String(
                    simulation.baseline.crrem_stranding_year ?? "—"
                  )}
                  after={String(
                    simulation.projected.crrem_stranding_year ?? "—"
                  )}
                />
                <SimMetric
                  label="Riskscore"
                  before={formatNumber(simulation.baseline.combined_score, 0)}
                  after={formatNumber(simulation.projected.combined_score, 0)}
                />
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                {simulation.projected.meps_status && (
                  <Badge
                    variant={
                      simulation.projected.meps_status === "compliant"
                        ? "success"
                        : simulation.projected.meps_status === "at_risk"
                          ? "warning"
                          : "danger"
                    }
                  >
                    MEPS: {simulation.projected.meps_status}
                  </Badge>
                )}
                {simulation.projected.financial_risk_flag != null && (
                  <Badge
                    variant={
                      simulation.projected.financial_risk_flag
                        ? "warning"
                        : "success"
                    }
                  >
                    {simulation.projected.financial_risk_flag
                      ? "Finansiell risk kvar"
                      : "Ingen finansiell risk <2035"}
                  </Badge>
                )}
                <Badge variant="outline">
                  Spar {formatKwh(simulation.saving_kwh)}/år
                </Badge>
              </div>

              {simulation.warnings.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {simulation.warnings.map((w) => (
                    <div key={w}>• {w}</div>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Simuleringen sparar inget. «Markera klar» tillämpar modeled spar
                (mätvärden orörda) och sätter status Klar.
              </p>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={closeSimulate}>
              Stäng
            </Button>
            <Button
              disabled={
                completeMut.isPending ||
                simulateMut.isPending ||
                !simulateId ||
                !simulation
              }
              onClick={() =>
                simulateId && void completeMut.mutateAsync(simulateId)
              }
            >
              {completeMut.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Tillämpar…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Markera klar och tillämpa
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CreateActionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          invalidate();
          setCreateOpen(false);
        }}
      />

      <PlanDialog
        building={planBuilding}
        year={year}
        onClose={() => setPlanBuilding(null)}
        onAccepted={() => {
          setMsg("Plan accepterad – valda åtgärder godkända.");
          setPlanBuilding(null);
          invalidate();
        }}
      />
    </div>
  );
}

function HowCard({
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

function StatCard({
  label,
  value,
  sub,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: string;
  sub: string;
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
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular", tone)}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
    </Comp>
  );
}

function SimMetric({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) {
  return (
    <div className="rounded-xl bg-secondary/60 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular">
        <span className="text-muted-foreground">{before}</span>
        <span className="mx-1 text-muted-foreground">→</span>
        <span className="text-emerald-700">{after}</span>
      </div>
    </div>
  );
}

function ActionCard({
  row: r,
  onSimulate,
  onRevert,
  onPlan,
  reverting,
}: {
  row: PortfolioActionRow;
  onSimulate: () => void;
  onRevert?: () => void;
  onPlan: () => void;
  reverting?: boolean;
}) {
  const canSimulate =
    r.status !== "completed" && r.status !== "cancelled";

  return (
    <article className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/20 hover:shadow-md sm:p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <span className="text-[10px] font-medium uppercase opacity-70">
            Prio
          </span>
          <span className="text-lg font-bold tabular leading-none">
            {r.priority_score != null
              ? formatNumber(r.priority_score, 2)
              : "—"}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">
              {r.title}
            </h3>
            <Badge
              variant={
                r.status === "completed"
                  ? "success"
                  : r.status === "in_progress" || r.status === "approved"
                    ? "warning"
                    : "outline"
              }
            >
              {STATUS_SV[r.status] ?? r.status}
            </Badge>
            {r.source === "improvement_detection" && (
              <Badge variant="warning">Deklarationsförslag</Badge>
            )}
            {r.source === "mitigation_plan" && (
              <Badge variant="secondary">Från plan</Badge>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <Link
              href={`/buildings?building=${r.building_id}`}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <Building2 className="h-3.5 w-3.5" />
              {r.building_name}
            </Link>
            <span>{CATEGORY_SV[r.category] ?? r.category}</span>
            {r.estimated_saving_kwh != null && (
              <span className="text-emerald-600">
                Spar {formatKwh(r.estimated_saving_kwh)}/år
              </span>
            )}
            {r.investment_cost != null && (
              <span>{formatNumber(r.investment_cost / 1000, 0)} tkr</span>
            )}
            {r.payback_years != null && (
              <span>Payback {formatNumber(r.payback_years, 1)} år</span>
            )}
          </div>

          {/* Effect */}
          <div className="mt-3 flex flex-wrap gap-2">
            {r.application_id ? (
              <>
                <EffectChip
                  label="MEPS"
                  before={formatNumber(r.applied_baseline_meps, 0)}
                  after={formatNumber(r.applied_result_meps, 0)}
                />
                <EffectChip
                  label="Riskår"
                  before={String(r.applied_baseline_stranding ?? "—")}
                  after={String(r.applied_result_stranding ?? "—")}
                />
              </>
            ) : r.meps_2030_gap != null ? (
              <div className="rounded-xl bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
                Est. gap {formatNumber(r.meps_2030_gap, 0)}
                {r.meps_gap_after != null && (
                  <>
                    {" "}
                    →{" "}
                    <span className="font-medium text-emerald-700">
                      {formatNumber(r.meps_gap_after, 0)}
                    </span>
                  </>
                )}{" "}
                kWh/m²
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
          {canSimulate && (
            <Button onClick={onSimulate} className="sm:min-w-[9rem]">
              <Play className="h-4 w-4" />
              Simulera
            </Button>
          )}
          <Button variant="outline" onClick={onPlan}>
            <ClipboardList className="h-4 w-4" />
            Plan
          </Button>
          {onRevert && (
            <Button
              variant="ghost"
              disabled={reverting}
              onClick={onRevert}
              title="Återställ tillämpning"
            >
              <Undo2 className="h-4 w-4" />
              Återställ
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function EffectChip({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900">
      <span className="font-medium">{label}</span>
      <span className="tabular text-emerald-800/70">{before}</span>
      <TrendingDown className="h-3.5 w-3.5 text-emerald-600" />
      <span className="font-semibold tabular">{after}</span>
    </div>
  );
}

function PlanDialog({
  building,
  year,
  onClose,
  onAccepted,
}: {
  building: { id: string; name: string } | null;
  year: number;
  onClose: () => void;
  onAccepted: () => void;
}) {
  const [plan, setPlan] = useState<MitigationPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const gen = useMutation({
    mutationFn: async () => {
      if (!building) throw new Error("Saknar byggnad");
      const res = await generateMitigationPlan({
        building_id: building.id,
        year,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (p) => {
      setPlan(p);
      setSelected(
        new Set(p.items.filter((i) => i.include_in_plan).map((i) => i.id))
      );
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const accept = useMutation({
    mutationFn: async () => {
      if (!plan) throw new Error("Ingen plan");
      const res = await acceptMitigationPlan({
        plan_id: plan.id,
        item_ids: [...selected],
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => onAccepted(),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog
      open={Boolean(building)}
      onOpenChange={(o) => {
        if (!o) {
          setPlan(null);
          onClose();
        } else if (building && !plan && !gen.isPending) {
          void gen.mutateAsync();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Åtgärdsplan – {building?.name}</DialogTitle>
          <DialogDescription>
            Välj vilka åtgärder som ska godkännas i planen.
          </DialogDescription>
        </DialogHeader>
        {gen.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Genererar plan…
          </div>
        )}
        {error && <div className="text-sm text-red-600">{error}</div>}
        {plan && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <MiniStat
                label="Gap 2030 före"
                value={formatNumber(plan.baseline_meps_2030_gap, 1)}
              />
              <MiniStat
                label="Förväntad gap-ändring"
                value={formatNumber(plan.expected_meps_delta, 1)}
                good
              />
              <MiniStat
                label="Total kostnad"
                value={
                  plan.total_cost != null
                    ? `${formatNumber(plan.total_cost / 1000, 0)} tkr`
                    : "—"
                }
              />
              <MiniStat
                label="Riskår"
                value={`${plan.baseline_stranding_year ?? "—"} → ${plan.expected_stranding_after ?? "—"}`}
              />
            </div>
            <ul className="max-h-48 space-y-2 overflow-auto">
              {plan.items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-start gap-3 rounded-xl border border-border px-3 py-2.5"
                >
                  <Checkbox
                    checked={selected.has(it.id)}
                    onCheckedChange={(v) => {
                      setSelected((s) => {
                        const n = new Set(s);
                        if (v) n.add(it.id);
                        else n.delete(it.id);
                        return n;
                      });
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {it.title_snapshot}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Spar{" "}
                      {it.estimated_saving_kwh != null
                        ? formatKwh(it.estimated_saving_kwh)
                        : "—"}{" "}
                      · prio {formatNumber(it.priority_score, 2)}
                    </div>
                  </div>
                </li>
              ))}
              {plan.items.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  Inga föreslagna åtgärder för byggnaden.
                </li>
              )}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Stäng
              </Button>
              <Button
                disabled={accept.isPending || selected.size === 0}
                onClick={() => void accept.mutateAsync()}
              >
                {accept.isPending ? "Sparar…" : "Acceptera valda"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-sm font-semibold tabular",
          good && "text-emerald-600"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function CreateActionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [buildingId, setBuildingId] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("other");
  const [investment, setInvestment] = useState("");
  const [saving, setSaving] = useState("");
  const [payback, setPayback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const buildingsQ = useQuery({
    queryKey: ["buildings-for-actions"],
    enabled: open,
    queryFn: async () => {
      const { getBrowserClient } = await import("@/lib/supabase/client");
      const sb = getBrowserClient();
      const { data, error: err } = await sb
        .from("buildings")
        .select("id, name, properties(name)")
        .order("name")
        .limit(200);
      if (err) throw new Error(err.message);
      return data ?? [];
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await createAction({
        building_id: buildingId,
        title: title.trim(),
        category,
        investment_cost: investment ? Number(investment) : null,
        estimated_saving_kwh: saving ? Number(saving) : null,
        payback_years: payback ? Number(payback) : null,
        status: "proposed",
        currency: "SEK",
      });
      if (!res.success) throw new Error(res.error);
      await recalculateActionPriorities({ buildingId });
      onCreated();
      setTitle("");
      setInvestment("");
      setSaving("");
      setPayback("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ny åtgärd</DialogTitle>
          <DialogDescription>
            Fyll i spar och kostnad – prioritet beräknas automatiskt.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Byggnad *</label>
            <Select value={buildingId} onValueChange={setBuildingId}>
              <SelectTrigger>
                <SelectValue placeholder="Välj byggnad" />
              </SelectTrigger>
              <SelectContent>
                {(buildingsQ.data ?? []).map((b) => {
                  const prop = b.properties as
                    | { name: string }
                    | { name: string }[]
                    | null;
                  const pname = Array.isArray(prop)
                    ? prop[0]?.name
                    : prop?.name;
                  return (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                      {pname ? ` · ${pname}` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Titel *</label>
            <Input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="t.ex. LED-byte trapphus"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Kategori</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_SV).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Kostnad SEK
              </label>
              <Input
                type="number"
                min={0}
                value={investment}
                onChange={(e) => setInvestment(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Spar kWh/år
              </label>
              <Input
                type="number"
                min={0}
                value={saving}
                onChange={(e) => setSaving(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Payback år
              </label>
              <Input
                type="number"
                min={0}
                step="0.1"
                value={payback}
                onChange={(e) => setPayback(e.target.value)}
              />
            </div>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Avbryt
            </Button>
            <Button type="submit" disabled={pending || !buildingId || !title}>
              {pending ? "Sparar…" : "Spara åtgärd"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
