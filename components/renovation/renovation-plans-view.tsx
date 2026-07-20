"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listRenovationPlans,
  generateRenovationPlan,
  updateRenovationPlanStatus,
  type RenovationPlan,
} from "@/app/actions/renovation-plans";
// useState used in CreatePlanDialog
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
import { formatNumber } from "@/lib/utils";
import {
  Hammer,
  Loader2,
  Plus,
  ChevronRight,
} from "lucide-react";

const STATUS_SV: Record<string, string> = {
  draft: "Utkast",
  approved: "Godkänd",
  in_progress: "Pågår",
  completed: "Klar",
};

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

  const setStatusMut = useMutation({
    mutationFn: async (input: {
      plan_id: string;
      status: "draft" | "approved" | "in_progress" | "completed";
    }) => {
      const res = await updateRenovationPlanStatus(input);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      setMsg("Status uppdaterad.");
      void qc.invalidateQueries({ queryKey: ["renovation-plans"] });
      void qc.invalidateQueries({ queryKey: ["portfolio-actions"] });
      setDetail(null);
    },
  });

  return (
    <div className="flex h-full flex-col gap-1.5 p-2">
      <div className="panel flex flex-wrap items-center gap-2 rounded-md px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Hammer className="h-4 w-4 text-terminal-accent" />
          <h1 className="text-sm font-semibold">Renovationsplaner</h1>
          <HelpTip text="Plan kopplar åtgärder till mål för MEPS-status och CRREM misalignment-år. Vid Klar sätts länade åtgärder till completed och prestanda räknas om." />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-32 text-xs">
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
        <Button
          size="sm"
          className="ml-auto h-8 gap-1"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Ny plan
        </Button>
        <Button size="sm" variant="terminal" className="h-8" asChild>
          <Link href="/risk-scores">Kombinerad risk</Link>
        </Button>
      </div>

      {msg && (
        <div className="rounded-md border border-gap-complete/30 bg-gap-complete/10 px-3 py-1.5 text-xs text-gap-complete">
          {msg}
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
            Laddar planer…
          </div>
        )}
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-terminal-row text-2xs text-terminal-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Plan</th>
              <th className="px-3 py-2 text-left font-medium">Byggnad</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Kostnad</th>
              <th className="px-3 py-2 text-right font-medium">Risk före→efter</th>
              <th className="px-3 py-2 text-right font-medium">Mål misalign</th>
              <th className="px-3 py-2 text-center font-medium">Åtgärder</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr
                key={p.id}
                className="border-t border-terminal-border/50 hover:bg-terminal-row/50"
              >
                <td className="max-w-[12rem] truncate px-3 py-1.5 font-medium">
                  {p.title}
                </td>
                <td className="px-3 py-1.5">
                  {p.building_id ? (
                    <Link
                      href={`/buildings?building=${p.building_id}`}
                      className="text-terminal-accent hover:underline"
                    >
                      {p.building_name ?? "—"}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <Badge
                    variant={
                      p.status === "completed"
                        ? "success"
                        : p.status === "approved" || p.status === "in_progress"
                          ? "warning"
                          : "outline"
                    }
                  >
                    {STATUS_SV[p.status] ?? p.status}
                  </Badge>
                </td>
                <td className="px-3 py-1.5 text-right tabular">
                  {p.total_estimated_cost != null
                    ? `${formatNumber(p.total_estimated_cost / 1000, 0)} tkr`
                    : "—"}
                </td>
                <td className="px-3 py-1.5 text-right tabular">
                  {formatNumber(p.baseline_combined_score, 0)}
                  {" → "}
                  {formatNumber(p.projected_combined_score, 0)}
                </td>
                <td className="px-3 py-1.5 text-right tabular text-gap-extrapolated">
                  {p.target_misalignment_year ?? "—"}
                </td>
                <td className="px-3 py-1.5 text-center tabular">
                  {p.actions.length}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-0.5 text-2xs"
                    onClick={() => setDetail(p)}
                  >
                    Detalj <ChevronRight className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  Inga renovationsplaner. Skapa från risk-vyn eller här.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.title}</DialogTitle>
            <DialogDescription>
              Mål MEPS: {detail?.target_meps_status ?? "—"} · Misalign ≥{" "}
              {detail?.target_misalignment_year ?? "—"}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <ul className="max-h-48 space-y-1 overflow-auto text-xs">
                {detail.actions.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-md border border-terminal-border px-2 py-1.5"
                  >
                    <div className="font-medium">
                      {a.action_title ?? a.action_id.slice(0, 8)}
                    </div>
                    <div className="text-2xs text-terminal-muted">
                      MEPS Δ {formatNumber(a.expected_impact.meps_gap, 1)} ·
                      misalign +
                      {a.expected_impact.misalignment_shift ?? "—"} · kost{" "}
                      {a.investment_cost != null
                        ? `${formatNumber(a.investment_cost / 1000, 0)} tkr`
                        : "—"}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    "approved",
                    "in_progress",
                    "completed",
                  ] as const
                ).map((st) => (
                  <Button
                    key={st}
                    size="sm"
                    variant={detail.status === st ? "default" : "terminal"}
                    className="h-8"
                    disabled={setStatusMut.isPending}
                    onClick={() =>
                      void setStatusMut.mutateAsync({
                        plan_id: detail.id,
                        status: st,
                      })
                    }
                  >
                    {STATUS_SV[st]}
                  </Button>
                ))}
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
  const [pending, setPending] = useState(false);

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await generateRenovationPlan({ building_id: buildingId });
      if (!res.success) throw new Error(res.error);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fel");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ny renovationsplan</DialogTitle>
          <DialogDescription>
            Väljer föreslagna/godkända åtgärder efter prioritet och sätter mål
            för MEPS och CRREM.
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
          {error && <div className="text-xs text-destructive">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="terminal"
              onClick={() => onOpenChange(false)}
            >
              Avbryt
            </Button>
            <Button type="submit" disabled={pending || !buildingId}>
              {pending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Genererar…
                </>
              ) : (
                "Generera plan"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
