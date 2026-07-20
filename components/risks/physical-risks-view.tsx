"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listPhysicalRisks,
  createPhysicalRisk,
  deletePhysicalRisk,
} from "@/app/actions/physical-risks-crud";
import {
  listComplianceRisks,
  refreshComplianceRisks,
  setRiskWorkflowStatus,
} from "@/app/actions/risk-workflow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Checkbox } from "@/components/ui/checkbox";
import { formatNumber } from "@/lib/utils";
import {
  AlertTriangle,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
} from "lucide-react";
import type { RiskWorkflowStatus } from "@/lib/validations/workflow";

const RISK_SV: Record<string, string> = {
  flood: "Översvämning",
  heat: "Värme",
  storm: "Storm",
  subsidence: "Sättning",
  wildfire: "Skogsbrand",
  other: "Övrigt",
};

const LEVEL_SV: Record<string, string> = {
  low: "Låg",
  medium: "Medel",
  high: "Hög",
  very_high: "Mycket hög",
};

const STATUS_SV: Record<string, string> = {
  open: "Öppen",
  monitoring: "Bevakning",
  resolved: "Åtgärdad",
  dismissed: "Avskriven",
};

const KIND_SV: Record<string, string> = {
  meps_2030: "Kravgap 2030",
  meps_2033: "Kravgap 2033",
  crrem_stranding: "Klimatriskår",
};

function scoreVariant(
  score: number | null
): "success" | "warning" | "danger" | "outline" {
  if (score == null) return "outline";
  if (score <= 4) return "success";
  if (score <= 9) return "warning";
  return "danger";
}

export function PhysicalRisksView() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"physical" | "compliance">("physical");
  const [hideClosed, setHideClosed] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{
    id: string;
    kind: "physical" | "compliance";
    status: RiskWorkflowStatus;
  } | null>(null);

  const physQ = useQuery({
    queryKey: ["physical-risks", hideClosed],
    queryFn: async () => {
      const res = await listPhysicalRisks({ hideClosed });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const compQ = useQuery({
    queryKey: ["compliance-risks", hideClosed],
    queryFn: async () => {
      const res = await listComplianceRisks({ hideClosed });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const refresh = useMutation({
    mutationFn: async () => {
      const res = await refreshComplianceRisks();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["compliance-risks"] });
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const res = await deletePhysicalRisk(id);
      if (!res.success) throw new Error(res.error);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["physical-risks"] });
    },
  });

  return (
    <div className="flex h-full flex-col gap-1.5 p-2">
      <div className="panel flex flex-wrap items-center gap-2 rounded-md px-3 py-2">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-gap-extrapolated" />
          <h1 className="text-sm font-semibold">Risker & avskrivning</h1>
          <HelpTip text="Markera risker som bevakning, åtgärdad eller avskriven. Avskrivning/åtgärd kräver motivering och loggas. Stängda risker påverkar inte alerts." />
        </div>

        <div className="flex gap-0.5 rounded-md border border-terminal-border p-0.5">
          <Button
            size="sm"
            variant={tab === "physical" ? "default" : "ghost"}
            className="h-7"
            onClick={() => setTab("physical")}
          >
            Fysiska
          </Button>
          <Button
            size="sm"
            variant={tab === "compliance" ? "default" : "ghost"}
            className="h-7"
            onClick={() => setTab("compliance")}
          >
            MEPS / CRREM
          </Button>
        </div>

        <label className="flex items-center gap-1.5 text-2xs text-terminal-muted">
          <Checkbox
            checked={hideClosed}
            onCheckedChange={(v) => setHideClosed(v === true)}
          />
          Dölj stängda
        </label>

        <div className="ml-auto flex gap-1.5">
          {tab === "compliance" && (
            <Button
              size="sm"
              variant="terminal"
              className="h-8 gap-1"
              disabled={refresh.isPending}
              onClick={() => void refresh.mutateAsync()}
            >
              {refresh.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Synka från prestanda
            </Button>
          )}
          {tab === "physical" && (
            <Button
              size="sm"
              className="h-8 gap-1"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Ny risk
            </Button>
          )}
        </div>
      </div>

      {refresh.isSuccess && (
        <div className="rounded-md border border-gap-complete/30 bg-gap-complete/10 px-3 py-1.5 text-xs text-gap-complete">
          Synkade år {refresh.data.year}: {refresh.data.created} nya öppna risker.
        </div>
      )}

      {tab === "physical" && (
        <div className="panel min-h-0 flex-1 overflow-auto rounded-md">
          {physQ.isLoading && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Laddar…
            </div>
          )}
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-terminal-row text-2xs text-terminal-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Fastighet</th>
                <th className="px-3 py-2 text-left font-medium">Risk</th>
                <th className="px-3 py-2 text-center font-medium">Poäng</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Notering</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(physQ.data ?? []).map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-terminal-border/50 hover:bg-terminal-row/50"
                >
                  <td className="px-3 py-1.5">
                    <Link
                      href={`/properties/${r.property_id}`}
                      className="font-medium text-terminal-accent hover:underline"
                    >
                      {r.property_name}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5">
                    {RISK_SV[r.risk_type] ?? r.risk_type}
                    <div className="text-2xs text-terminal-muted">
                      {LEVEL_SV[r.probability]}/{LEVEL_SV[r.consequence]}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <Badge variant={scoreVariant(r.risk_score)}>
                      {r.risk_score != null
                        ? formatNumber(r.risk_score, 0)
                        : "—"}
                    </Badge>
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge
                      variant={
                        r.workflow_status === "open"
                          ? "danger"
                          : r.workflow_status === "monitoring"
                            ? "warning"
                            : "success"
                      }
                    >
                      {STATUS_SV[r.workflow_status] ?? r.workflow_status}
                    </Badge>
                  </td>
                  <td className="max-w-[10rem] truncate px-3 py-1.5 text-terminal-muted">
                    {r.status_reason ?? r.notes ?? "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    <StatusButtons
                      onStatus={(s) =>
                        setStatusTarget({
                          id: r.id,
                          kind: "physical",
                          status: s,
                        })
                      }
                      onDelete={() => {
                        if (confirm("Ta bort risk?"))
                          void del.mutateAsync(r.id);
                      }}
                    />
                  </td>
                </tr>
              ))}
              {!physQ.isLoading && (physQ.data?.length ?? 0) === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-10 text-center text-muted-foreground"
                  >
                    Inga fysiska risker att visa.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "compliance" && (
        <div className="panel min-h-0 flex-1 overflow-auto rounded-md">
          {compQ.isLoading && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Laddar…
            </div>
          )}
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-terminal-row text-2xs text-terminal-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Byggnad</th>
                <th className="px-3 py-2 text-left font-medium">Typ</th>
                <th className="px-3 py-2 text-right font-medium">Värde</th>
                <th className="px-3 py-2 text-center font-medium">Allvar</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(compQ.data ?? []).map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-terminal-border/50 hover:bg-terminal-row/50"
                >
                  <td className="px-3 py-1.5">
                    <Link
                      href={`/buildings?building=${r.building_id}`}
                      className="font-medium text-terminal-accent hover:underline"
                    >
                      {r.building_name}
                    </Link>
                    <div className="text-2xs text-terminal-muted">
                      {r.property_name} · {r.year}
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    {KIND_SV[r.risk_kind] ?? r.risk_kind}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular">
                    {formatNumber(r.metric_value, 1)}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <Badge variant={scoreVariant(r.severity)}>
                      {formatNumber(r.severity, 0)}
                    </Badge>
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge
                      variant={
                        r.workflow_status === "open"
                          ? "danger"
                          : r.workflow_status === "monitoring"
                            ? "warning"
                            : "success"
                      }
                    >
                      {STATUS_SV[r.workflow_status] ?? r.workflow_status}
                    </Badge>
                    {r.status_reason && (
                      <div className="max-w-[8rem] truncate text-2xs text-terminal-muted">
                        {r.status_reason}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <StatusButtons
                      onStatus={(s) =>
                        setStatusTarget({
                          id: r.id,
                          kind: "compliance",
                          status: s,
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
              {!compQ.isLoading && (compQ.data?.length ?? 0) === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-10 text-center text-muted-foreground"
                  >
                    Inga compliance-risker. Klicka &quot;Synka från
                    prestanda&quot;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <StatusDialog
        target={statusTarget}
        onClose={() => setStatusTarget(null)}
        onSaved={() => {
          setStatusTarget(null);
          void qc.invalidateQueries({ queryKey: ["physical-risks"] });
          void qc.invalidateQueries({ queryKey: ["compliance-risks"] });
          void qc.invalidateQueries({ queryKey: ["workflow-alerts"] });
        }}
      />

      <CreateRiskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          void qc.invalidateQueries({ queryKey: ["physical-risks"] });
          setCreateOpen(false);
        }}
      />
    </div>
  );
}

function StatusButtons({
  onStatus,
  onDelete,
}: {
  onStatus: (s: RiskWorkflowStatus) => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-0.5">
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-2xs"
        onClick={() => onStatus("monitoring")}
      >
        Bevaka
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-2xs"
        onClick={() => onStatus("resolved")}
      >
        Åtgärdad
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-2xs"
        onClick={() => onStatus("dismissed")}
      >
        Avskriv
      </Button>
      {onDelete && (
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

function StatusDialog({
  target,
  onClose,
  onSaved,
}: {
  target: {
    id: string;
    kind: "physical" | "compliance";
    status: RiskWorkflowStatus;
  } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const needsReason =
    target?.status === "resolved" || target?.status === "dismissed";

  const mut = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("Saknar mål");
      const res = await setRiskWorkflowStatus({
        risk_id: target.id,
        kind: target.kind,
        status: target.status,
        reason: reason.trim() || undefined,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      setReason("");
      onSaved();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(o) => {
        if (!o) {
          setReason("");
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Sätt status: {target ? STATUS_SV[target.status] : ""}
          </DialogTitle>
          <DialogDescription>
            {needsReason
              ? "Motivering krävs och loggas i audit trail."
              : "Valfri notering."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivering…"
            className="min-h-[72px]"
          />
          {error && <div className="text-xs text-destructive">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="terminal" onClick={onClose}>
              Avbryt
            </Button>
            <Button
              disabled={
                mut.isPending || (needsReason && reason.trim().length < 5)
              }
              onClick={() => void mut.mutateAsync()}
            >
              {mut.isPending ? "Sparar…" : "Spara status"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateRiskDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [propertyId, setPropertyId] = useState("");
  const [riskType, setRiskType] = useState("flood");
  const [probability, setProbability] = useState("medium");
  const [consequence, setConsequence] = useState("medium");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const propsQ = useQuery({
    queryKey: ["properties-for-risks"],
    enabled: open,
    queryFn: async () => {
      const { getBrowserClient } = await import("@/lib/supabase/client");
      const sb = getBrowserClient();
      const { data, error: err } = await sb
        .from("properties")
        .select("id, name, municipality")
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
      const res = await createPhysicalRisk({
        property_id: propertyId,
        risk_type: riskType,
        probability,
        consequence,
        source: source.trim() || null,
        notes: notes.trim() || null,
      });
      if (!res.success) throw new Error(res.error);
      setNotes("");
      setSource("");
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
          <DialogTitle>Ny fysisk klimatrisk</DialogTitle>
          <DialogDescription>
            Poäng = sannolikhet × konsekvens.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-terminal-muted">Fastighet *</label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Välj fastighet" />
              </SelectTrigger>
              <SelectContent>
                {(propsQ.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.municipality ? ` · ${p.municipality}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-terminal-muted">Risktyp</label>
            <Select value={riskType} onValueChange={setRiskType}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RISK_SV).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-terminal-muted">Sannolikhet</label>
              <Select value={probability} onValueChange={setProbability}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LEVEL_SV).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-terminal-muted">Konsekvens</label>
              <Select value={consequence} onValueChange={setConsequence}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LEVEL_SV).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-terminal-muted">Källa</label>
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-terminal-muted">Notering</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[60px]"
            />
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
            <Button type="submit" disabled={pending || !propertyId}>
              {pending ? "Sparar…" : "Spara"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
