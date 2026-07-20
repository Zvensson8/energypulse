"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listRenovationPlans,
  generateRenovationScenarios,
  selectRenovationScenario,
  updateRenovationPlanStatus,
  type RenovationPlan,
  type RenovationScenario,
} from "@/app/actions/renovation-plans";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { HelpTip } from "@/components/ui/help-tip";
import { formatNumber, cn } from "@/lib/utils";
import {
  Hammer,
  Loader2,
  Plus,
  ArrowRight,
  Building2,
  Activity,
  ListTodo,
  ClipboardList,
  TrendingDown,
  GitCompare,
  Check,
  X,
} from "lucide-react";

const STATUS_SV: Record<string, string> = {
  draft: "Utkast",
  approved: "Godkänd",
  in_progress: "Pågår",
  completed: "Klar",
};

function statusBadge(
  status: string
): "success" | "warning" | "outline" | "default" {
  if (status === "completed") return "success";
  if (status === "approved" || status === "in_progress") return "warning";
  return "outline";
}

export function RenovationPlansView() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [detail, setDetail] = useState<RenovationPlan | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["renovation-plans", status],
    queryFn: async () => {
      const res = await listRenovationPlans({
        status: status === "all" ? undefined : status,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const stats = useMemo(() => {
    const list = data ?? [];
    // When filtered, KPIs reflect current filter set (expected for status filter)
    return {
      total: list.length,
      draft: list.filter((p) => p.status === "draft").length,
      active: list.filter(
        (p) => p.status === "approved" || p.status === "in_progress"
      ).length,
      completed: list.filter((p) => p.status === "completed").length,
      cost: list.reduce((s, p) => s + (p.total_estimated_cost ?? 0), 0),
    };
  }, [data]);

  const setStatusMut = useMutation({
    mutationFn: async (input: {
      plan_id: string;
      status: "draft" | "approved" | "in_progress" | "completed";
    }) => {
      const res = await updateRenovationPlanStatus(input);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (_d, vars) => {
      setMsg(`Status uppdaterad till «${STATUS_SV[vars.status]}».`);
      void qc.invalidateQueries({ queryKey: ["renovation-plans"] });
      void qc.invalidateQueries({ queryKey: ["portfolio-actions"] });
      setDetail(null);
    },
  });

  return (
    <div className="page-shell">
      <div className="page-inner">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Hammer className="h-6 w-6 text-primary" />
              <h1 className="page-title">Renovationsplaner</h1>
              <HelpTip text="Jämför tre scenarier (billig / balanserad / aggressiv) med samma beräkningsmotor som vid simulering. Välj ett utkast, godkänn och markera klar för att tillämpa." />
            </div>
            <p className="page-subtitle">
              Jämför A/B/C-scenarier, välj plan och följ till klar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/risk-scores">
                <Activity className="h-4 w-4" />
                Kombinerad risk
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/actions">
                <ListTodo className="h-4 w-4" />
                Åtgärder
              </Link>
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <GitCompare className="h-4 w-4" />
              Jämför scenarier
            </Button>
          </div>
        </div>

        {/* Steps */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Step
            n="1"
            title="Jämför scenarier"
            body="Billig, balanserad och aggressiv – engine-baserad före/efter."
          />
          <Step
            n="2"
            title="Välj plan"
            body="Spara utkast med valda åtgärder och projicerad risk."
          />
          <Step
            n="3"
            title="Godkänn → Klar"
            body="Vid Klar slutförs länkade åtgärder och modeled spar tillämpas."
          />
        </div>

        {/* Filter KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi
            label="Visade planer"
            value={String(stats.total)}
            active={status === "all"}
            onClick={() => setStatus("all")}
          />
          <Kpi
            label="Utkast"
            value={String(stats.draft)}
            active={status === "draft"}
            onClick={() => setStatus("draft")}
          />
          <Kpi
            label="Pågår / godkänd"
            value={String(stats.active)}
            tone="text-amber-600"
            active={status === "in_progress"}
            onClick={() => setStatus("in_progress")}
          />
          <Kpi
            label="Klara"
            value={String(stats.completed)}
            tone="text-emerald-600"
            active={status === "completed"}
            onClick={() => setStatus("completed")}
          />
          <Kpi
            label="Est. kostnad"
            value={
              stats.cost > 0
                ? `${formatNumber(stats.cost / 1000, 0)} tkr`
                : "—"
            }
            help="Summa av visade planer"
          />
        </div>

        {/* Status select (for approved etc.) */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
          <span className="text-sm text-muted-foreground">Statusfilter</span>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla</SelectItem>
              {Object.entries(STATUS_SV).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm tabular text-muted-foreground">
            {(data ?? []).length} st
          </span>
        </div>

        {msg && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {msg}
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {(error as Error).message}
          </div>
        )}

        {isLoading && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Laddar planer…
          </div>
        )}

        {!isLoading && (data?.length ?? 0) === 0 && (
          <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <h3 className="mt-3 text-lg font-semibold">
              {status === "all"
                ? "Inga renovationsplaner"
                : "Inga planer med den statusen"}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Skapa en plan från risk-vyn eller generera här för en byggnad med
              föreslagna åtgärder.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Ny plan
              </Button>
              <Button variant="outline" asChild>
                <Link href="/risk-scores">Till riskscore</Link>
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-3">
          {(data ?? []).map((p) => {
            const riskDrop =
              p.baseline_combined_score != null &&
              p.projected_combined_score != null
                ? p.baseline_combined_score - p.projected_combined_score
                : null;
            return (
              <article
                key={p.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/20 hover:shadow-md sm:p-5"
              >
                <div className="flex flex-wrap items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Hammer className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">{p.title}</h3>
                      <Badge variant={statusBadge(p.status)}>
                        {STATUS_SV[p.status] ?? p.status}
                      </Badge>
                      {p.target_meps_status && (
                        <Badge variant="outline">
                          Mål MEPS: {p.target_meps_status}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {p.building_id ? (
                        <Link
                          href={`/buildings?building=${p.building_id}`}
                          className="inline-flex items-center gap-1 hover:text-primary"
                        >
                          <Building2 className="h-3.5 w-3.5" />
                          {p.building_name ?? "Byggnad"}
                        </Link>
                      ) : (
                        "Ingen byggnad"
                      )}
                      {p.target_misalignment_year
                        ? ` · Mål misalign ≥ ${p.target_misalignment_year}`
                        : ""}
                      {` · ${p.actions.length} åtgärd${p.actions.length === 1 ? "" : "er"}`}
                    </p>

                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <MiniStat
                        label="Kostnad"
                        value={
                          p.total_estimated_cost != null
                            ? `${formatNumber(p.total_estimated_cost / 1000, 0)} tkr`
                            : "—"
                        }
                      />
                      <MiniStat
                        label="Risk före → efter"
                        value={`${formatNumber(p.baseline_combined_score, 0)} → ${formatNumber(p.projected_combined_score, 0)}`}
                      />
                      <MiniStat
                        label="Riskminskning"
                        value={
                          riskDrop != null
                            ? formatNumber(riskDrop, 0)
                            : "—"
                        }
                        tone={
                          riskDrop != null && riskDrop > 0
                            ? "text-emerald-600"
                            : undefined
                        }
                        icon={
                          riskDrop != null && riskDrop > 0 ? (
                            <TrendingDown className="h-3 w-3 text-emerald-600" />
                          ) : undefined
                        }
                      />
                      <MiniStat
                        label="Mål misalign"
                        value={
                          p.target_misalignment_year != null
                            ? String(p.target_misalignment_year)
                            : "—"
                        }
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
                    <Button onClick={() => setDetail(p)}>
                      Öppna detalj
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    {p.building_id && (
                      <Button variant="outline" asChild>
                        <Link href={`/buildings?building=${p.building_id}`}>
                          <Building2 className="h-4 w-4" />
                          Byggnad
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* Detail dialog */}
      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.title}</DialogTitle>
            <DialogDescription>
              Mål MEPS: {detail?.target_meps_status ?? "—"} · Misalign ≥{" "}
              {detail?.target_misalignment_year ?? "—"}
              {detail?.building_name ? ` · ${detail.building_name}` : ""}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <MiniStat
                  label="Risk före → efter"
                  value={`${formatNumber(detail.baseline_combined_score, 0)} → ${formatNumber(detail.projected_combined_score, 0)}`}
                />
                <MiniStat
                  label="Kostnad"
                  value={
                    detail.total_estimated_cost != null
                      ? `${formatNumber(detail.total_estimated_cost / 1000, 0)} tkr`
                      : "—"
                  }
                />
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">
                  Åtgärder ({detail.actions.length})
                </div>
                <ul className="max-h-52 space-y-2 overflow-auto">
                  {detail.actions.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-sm"
                    >
                      <div className="font-medium">
                        {a.action_title ?? a.action_id.slice(0, 8)}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        MEPS Δ {formatNumber(a.expected_impact.meps_gap, 1)} ·
                        misalign +
                        {a.expected_impact.misalignment_shift ?? "—"} · kost{" "}
                        {a.investment_cost != null
                          ? `${formatNumber(a.investment_cost / 1000, 0)} tkr`
                          : "—"}
                      </div>
                    </li>
                  ))}
                  {detail.actions.length === 0 && (
                    <li className="text-sm text-muted-foreground">
                      Inga åtgärder kopplade.
                    </li>
                  )}
                </ul>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">Uppdatera status</div>
                <div className="flex flex-wrap gap-2">
                  {(
                    ["approved", "in_progress", "completed"] as const
                  ).map((st) => (
                    <Button
                      key={st}
                      size="sm"
                      variant={detail.status === st ? "default" : "outline"}
                      disabled={setStatusMut.isPending}
                      onClick={() =>
                        void setStatusMut.mutateAsync({
                          plan_id: detail.id,
                          status: st,
                        })
                      }
                    >
                      {setStatusMut.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      {STATUS_SV[st]}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  «Klar» slutför länkade åtgärder och räknar om prestanda.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CreatePlanDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          void qc.invalidateQueries({ queryKey: ["renovation-plans"] });
          setCreateOpen(false);
          setMsg("Renovationsplan skapad.");
        }}
      />
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

function MiniStat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-secondary/50 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("flex items-center gap-1 text-sm font-semibold tabular", tone)}>
        {icon}
        {value}
      </div>
    </div>
  );
}

function CreatePlanDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [buildingId, setBuildingId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<RenovationScenario[] | null>(
    null
  );
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);

  const buildingsQ = useQuery({
    queryKey: ["buildings-for-renovation"],
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

  async function runCompare() {
    if (!buildingId) return;
    setLoadingScenarios(true);
    setError(null);
    setScenarios(null);
    try {
      const res = await generateRenovationScenarios({
        building_id: buildingId,
      });
      if (!res.success) throw new Error(res.error);
      setScenarios(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fel");
    } finally {
      setLoadingScenarios(false);
    }
  }

  async function choose(s: RenovationScenario) {
    setSelecting(s.key);
    setError(null);
    try {
      const res = await selectRenovationScenario({
        building_id: buildingId,
        action_ids: s.action_ids,
        scenario_key: s.key,
      });
      if (!res.success) throw new Error(res.error);
      setScenarios(null);
      setBuildingId("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fel");
    } finally {
      setSelecting(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setScenarios(null);
          setError(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Jämför renovationsscenarier</DialogTitle>
          <DialogDescription>
            Billig / balanserad / aggressiv – samma motor som vid simulering.
            Välj ett paket för att spara utkast.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1 space-y-1.5">
            <label className="text-sm text-muted-foreground">Byggnad *</label>
            <Select
              value={buildingId}
              onValueChange={(v) => {
                setBuildingId(v);
                setScenarios(null);
              }}
            >
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
          <Button
            disabled={!buildingId || loadingScenarios}
            onClick={() => void runCompare()}
          >
            {loadingScenarios ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Simulerar…
              </>
            ) : (
              <>
                <GitCompare className="h-4 w-4" /> Jämför
              </>
            )}
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {scenarios && scenarios.length > 0 && (
          <div className="grid gap-3 md:grid-cols-3">
            {scenarios.map((s) => {
              const base = s.simulation.baseline.combined_score;
              const proj = s.simulation.projected.combined_score;
              return (
                <div
                  key={s.key}
                  className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">{s.label}</h3>
                    <Badge variant="outline">{s.actions.length} st</Badge>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Kostnad</span>
                      <span className="font-medium tabular">
                        {s.total_cost > 0
                          ? `${formatNumber(s.total_cost / 1000, 0)} tkr`
                          : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Risk</span>
                      <span className="font-medium tabular">
                        {formatNumber(base, 0)} →{" "}
                        <span className="text-emerald-700">
                          {formatNumber(proj, 0)}
                        </span>
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="inline-flex items-center gap-1">
                        {s.meets_meps_2030 ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-red-500" />
                        )}
                        MEPS 2030
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {s.meets_misalign_2035 ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-red-500" />
                        )}
                        Misalign ≥2035
                      </span>
                    </div>
                  </div>
                  <ul className="mt-3 max-h-28 flex-1 space-y-1 overflow-auto text-xs text-muted-foreground">
                    {s.actions.map((a) => (
                      <li key={a.id} className="truncate">
                        · {a.title}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-4 w-full"
                    disabled={selecting != null}
                    onClick={() => void choose(s)}
                  >
                    {selecting === s.key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Välj denna plan"
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Stäng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
