"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listPortfolioActions,
  recalculateActionPriorities,
} from "@/app/actions/actions-priority";
import { createAction } from "@/app/actions/actions-crud";
import {
  completeAction,
  revertActionApplication,
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
import { formatNumber, formatKwh } from "@/lib/utils";
import {
  Loader2,
  RefreshCw,
  Plus,
  ListTodo,
  TrendingDown,
  CheckCircle2,
  Undo2,
  Sparkles,
  ClipboardList,
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
  const [completeId, setCompleteId] = useState<string | null>(null);
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

  const completeMut = useMutation({
    mutationFn: async (actionId: string) => {
      const res = await completeAction({ action_id: actionId, year });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (diff) => {
      setCompleteId(null);
      if (diff) {
        setMsg(
          `Tillämpad: MEPS ${formatNumber(diff.baseline_meps_2030_gap, 1)} → ${formatNumber(diff.result_meps_2030_gap, 1)}, riskår ${diff.baseline_stranding_year ?? "—"} → ${diff.result_stranding_year ?? "—"}`
        );
      } else {
        setMsg("Åtgärd markerad som klar.");
      }
      invalidate();
    },
  });

  const revertMut = useMutation({
    mutationFn: async (applicationId: string) => {
      const reason = window.prompt(
        "Motivering för att återställa tillämpning (minst 5 tecken):"
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

  const weights = data?.weights;
  const rows = data?.rows ?? [];

  return (
    <div className="flex h-full flex-col gap-1.5 p-2">
      <div className="panel flex flex-wrap items-center gap-2 rounded-md px-3 py-2">
        <div className="flex items-center gap-1.5">
          <ListTodo className="h-4 w-4 text-terminal-accent" />
          <h1 className="text-sm font-semibold">Åtgärder</h1>
          <HelpTip text="När status sätts till Klar tillämpas spar automatiskt (modeled) och prestanda räknas om. Före/efter visas i kolumnen Effekt." />
        </div>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla statusar</SelectItem>
            {Object.entries(STATUS_SV).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-1 text-2xs text-terminal-muted">
          Prestandaår
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

        <span className="text-2xs tabular text-terminal-muted">
          {rows.length} st{isFetching ? " · …" : ""}
        </span>

        {weights && (
          <span className="hidden text-2xs text-terminal-muted xl:inline">
            Vikter: krav {Math.round(weights.meps * 100)}% · klimat{" "}
            {Math.round(weights.crrem * 100)}% · payback{" "}
            {Math.round(weights.payback * 100)}%
          </span>
        )}

        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="terminal"
            className="h-8 gap-1"
            disabled={detect.isPending}
            onClick={() => void detect.mutateAsync()}
            title="Hitta byggnader med förbättring som bör deklareras"
          >
            {detect.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Förbättringsanalys
          </Button>
          <Button
            size="sm"
            variant="terminal"
            className="h-8 gap-1"
            disabled={recalc.isPending}
            onClick={() => void recalc.mutateAsync()}
          >
            {recalc.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Räkna om prioritet
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Ny åtgärd
          </Button>
        </div>
      </div>

      {msg && (
        <div className="rounded-md border border-gap-complete/30 bg-gap-complete/10 px-3 py-1.5 text-xs text-gap-complete">
          {msg}
        </div>
      )}
      {(recalc.isError || detect.isError || completeMut.isError || revertMut.isError) && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {(
            (recalc.error ||
              detect.error ||
              completeMut.error ||
              revertMut.error) as Error
          )?.message}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="panel min-h-0 flex-1 overflow-auto rounded-md">
        {isLoading && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Laddar åtgärder…
          </div>
        )}
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-terminal-row text-2xs text-terminal-muted">
            <tr>
              <th className="px-2 py-2 text-right font-medium">Prio</th>
              <th className="px-2 py-2 text-left font-medium">Åtgärd</th>
              <th className="px-2 py-2 text-left font-medium">Byggnad</th>
              <th className="px-2 py-2 text-left font-medium">Status</th>
              <th className="px-2 py-2 text-right font-medium">Spar</th>
              <th className="px-2 py-2 text-right font-medium">
                Effekt MEPS / riskår
              </th>
              <th className="px-2 py-2 text-right font-medium">Plan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t border-terminal-border/50 hover:bg-terminal-row/50"
              >
                <td className="px-2 py-1.5 text-right">
                  <span className="inline-flex min-w-[2.5rem] justify-end rounded-md bg-terminal-accent/15 px-1.5 py-0.5 font-semibold tabular text-terminal-accent">
                    {r.priority_score != null
                      ? formatNumber(r.priority_score, 2)
                      : "—"}
                  </span>
                </td>
                <td className="max-w-[14rem] px-2 py-1.5">
                  <div className="truncate font-medium" title={r.title}>
                    {r.title}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <span className="text-2xs text-terminal-muted">
                      {CATEGORY_SV[r.category] ?? r.category}
                    </span>
                    {r.source === "improvement_detection" && (
                      <Badge variant="warning">Deklarationsförslag</Badge>
                    )}
                    {r.source === "mitigation_plan" && (
                      <Badge variant="outline">Från plan</Badge>
                    )}
                  </div>
                </td>
                <td className="max-w-[9rem] truncate px-2 py-1.5">
                  <Link
                    href={`/buildings?building=${r.building_id}`}
                    className="text-terminal-accent hover:underline"
                  >
                    {r.building_name}
                  </Link>
                </td>
                <td className="px-2 py-1.5">
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
                </td>
                <td className="px-2 py-1.5 text-right tabular text-terminal-green">
                  {r.estimated_saving_kwh != null
                    ? formatKwh(r.estimated_saving_kwh)
                    : "—"}
                </td>
                <td className="px-2 py-1.5 text-right text-2xs">
                  {r.application_id ? (
                    <div className="space-y-0.5">
                      <div className="tabular">
                        MEPS{" "}
                        <span className="text-terminal-muted">
                          {formatNumber(r.applied_baseline_meps, 0)}
                        </span>
                        <TrendingDown className="mx-0.5 inline h-3 w-3 text-gap-complete" />
                        <span className="text-gap-complete">
                          {formatNumber(r.applied_result_meps, 0)}
                        </span>
                      </div>
                      <div className="tabular text-gap-extrapolated">
                        Riskår {r.applied_baseline_stranding ?? "—"} →{" "}
                        {r.applied_result_stranding ?? "—"}
                      </div>
                    </div>
                  ) : r.meps_2030_gap != null ? (
                    <span className="tabular text-terminal-muted">
                      Est. {formatNumber(r.meps_2030_gap, 0)}
                      {r.meps_gap_after != null && (
                        <>
                          {" "}
                          → {formatNumber(r.meps_gap_after, 0)}
                        </>
                      )}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex flex-wrap justify-end gap-0.5">
                    {r.status !== "completed" &&
                      r.status !== "cancelled" && (
                        <Button
                          size="sm"
                          variant="terminal"
                          className="h-7 gap-0.5 text-2xs"
                          onClick={() => setCompleteId(r.id)}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Klar
                        </Button>
                      )}
                    {r.application_id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-0.5 text-2xs"
                        disabled={revertMut.isPending}
                        onClick={() =>
                          void revertMut.mutateAsync(r.application_id!)
                        }
                        title="Återställ tillämpning"
                      >
                        <Undo2 className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-0.5 text-2xs"
                      onClick={() =>
                        setPlanBuilding({
                          id: r.building_id,
                          name: r.building_name,
                        })
                      }
                      title="Generera åtgärdsplan"
                    >
                      <ClipboardList className="h-3 w-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  Inga åtgärder. Skapa en eller kör förbättringsanalys.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Complete confirm */}
      <Dialog
        open={Boolean(completeId)}
        onOpenChange={(o) => !o && setCompleteId(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Markera åtgärd som klar?</DialogTitle>
            <DialogDescription>
              Systemet tillämpar uppskattad energibesparing (modeled), räknar om
              prestanda och visar före/efter för kravgap och riskår. Rå
              mätvärden ändras inte.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="terminal" onClick={() => setCompleteId(null)}>
              Avbryt
            </Button>
            <Button
              disabled={completeMut.isPending || !completeId}
              onClick={() =>
                completeId && void completeMut.mutateAsync(completeId)
              }
            >
              {completeMut.isPending ? "Tillämpar…" : "Ja, markera klar"}
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
          setMsg("Åtgärdsplan accepterad – valda åtgärder godkända.");
          setPlanBuilding(null);
          invalidate();
        }}
      />
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
      setSelected(new Set(p.items.filter((i) => i.include_in_plan).map((i) => i.id)));
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
            Förslag baserat på prioritet. Välj åtgärder att acceptera (status →
            godkänd).
          </DialogDescription>
        </DialogHeader>
        {gen.isPending && (
          <div className="flex items-center gap-2 text-xs text-terminal-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Genererar plan…
          </div>
        )}
        {error && <div className="text-xs text-destructive">{error}</div>}
        {plan && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="panel rounded-md p-2">
                <div className="text-2xs text-terminal-muted">Gap 2030 före</div>
                <div className="font-semibold tabular">
                  {formatNumber(plan.baseline_meps_2030_gap, 1)}
                </div>
              </div>
              <div className="panel rounded-md p-2">
                <div className="text-2xs text-terminal-muted">
                  Förväntad gap-ändring
                </div>
                <div className="font-semibold tabular text-gap-complete">
                  {formatNumber(plan.expected_meps_delta, 1)}
                </div>
              </div>
              <div className="panel rounded-md p-2">
                <div className="text-2xs text-terminal-muted">Total kostnad</div>
                <div className="font-semibold tabular">
                  {plan.total_cost != null
                    ? `${formatNumber(plan.total_cost / 1000, 0)} tkr`
                    : "—"}
                </div>
              </div>
              <div className="panel rounded-md p-2">
                <div className="text-2xs text-terminal-muted">
                  Riskår före → efter
                </div>
                <div className="font-semibold tabular">
                  {plan.baseline_stranding_year ?? "—"} →{" "}
                  {plan.expected_stranding_after ?? "—"}
                </div>
              </div>
            </div>
            <ul className="max-h-48 space-y-1 overflow-auto">
              {plan.items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-start gap-2 rounded-md border border-terminal-border px-2 py-1.5 text-xs"
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
                    <div className="font-medium">{it.title_snapshot}</div>
                    <div className="text-2xs text-terminal-muted">
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
                <li className="text-xs text-muted-foreground">
                  Inga föreslagna/godkända åtgärder för byggnaden.
                </li>
              )}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="terminal" onClick={onClose}>
                Stäng
              </Button>
              <Button
                disabled={accept.isPending || selected.size === 0}
                onClick={() => void accept.mutateAsync()}
              >
                {accept.isPending ? "Sparar…" : "Acceptera valda"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
            Prioritet beräknas från byggnadens kravgap, klimatrisk och payback.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-terminal-muted">Byggnad *</label>
            <Select value={buildingId} onValueChange={setBuildingId}>
              <SelectTrigger className="h-9">
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
          <div className="space-y-1">
            <label className="text-xs text-terminal-muted">Titel *</label>
            <Input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-terminal-muted">Kategori</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9">
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
            <div className="space-y-1">
              <label className="text-xs text-terminal-muted">Kostnad SEK</label>
              <Input
                type="number"
                min={0}
                value={investment}
                onChange={(e) => setInvestment(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-terminal-muted">Spar kWh/år</label>
              <Input
                type="number"
                min={0}
                value={saving}
                onChange={(e) => setSaving(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-terminal-muted">Payback år</label>
              <Input
                type="number"
                min={0}
                step="0.1"
                value={payback}
                onChange={(e) => setPayback(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          {error && <div className="text-xs text-destructive">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="terminal"
              onClick={() => onOpenChange(false)}
            >
              Avbryt
            </Button>
            <Button type="submit" disabled={pending || !buildingId || !title}>
              {pending ? "Sparar…" : "Spara"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
