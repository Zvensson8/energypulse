"use client";

import { useMemo, useState } from "react";
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
import { formatNumber, cn } from "@/lib/utils";
import {
  AlertTriangle,
  Eye,
  CheckCircle2,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  MapPin,
  Scale,
  ShieldAlert,
} from "lucide-react";
import type { RiskWorkflowStatus } from "@/lib/validations/workflow";
import { PropertyFilter } from "@/components/filters/property-filter";

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

function statusVariant(
  status: string
): "success" | "warning" | "danger" | "outline" {
  if (status === "open") return "danger";
  if (status === "monitoring") return "warning";
  if (status === "resolved" || status === "dismissed") return "success";
  return "outline";
}

export function PhysicalRisksView() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"physical" | "compliance">("physical");
  const [hideClosed, setHideClosed] = useState(true);
  const [propertyId, setPropertyId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{
    id: string;
    kind: "physical" | "compliance";
    status: RiskWorkflowStatus;
  } | null>(null);

  const physQ = useQuery({
    queryKey: ["physical-risks", hideClosed, propertyId],
    queryFn: async () => {
      const res = await listPhysicalRisks({
        hideClosed,
        propertyId: propertyId || undefined,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const compQ = useQuery({
    queryKey: ["compliance-risks", hideClosed, propertyId],
    queryFn: async () => {
      const res = await listComplianceRisks({ hideClosed });
      if (!res.success) throw new Error(res.error);
      let list = res.data;
      if (propertyId)
        list = list.filter((r) => r.property_id === propertyId);
      return list;
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

  const physStats = useMemo(() => {
    const list = physQ.data ?? [];
    return {
      total: list.length,
      open: list.filter((r) => r.workflow_status === "open").length,
      monitoring: list.filter((r) => r.workflow_status === "monitoring")
        .length,
      high: list.filter((r) => (r.risk_score ?? 0) >= 9).length,
    };
  }, [physQ.data]);

  const compStats = useMemo(() => {
    const list = compQ.data ?? [];
    return {
      total: list.length,
      open: list.filter((r) => r.workflow_status === "open").length,
      monitoring: list.filter((r) => r.workflow_status === "monitoring")
        .length,
      high: list.filter((r) => (r.severity ?? 0) >= 9).length,
    };
  }, [compQ.data]);

  const activeStats = tab === "physical" ? physStats : compStats;

  return (
    <div className="page-shell">
      <div className="page-inner">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-primary" />
              <h1 className="page-title">Risker & avskrivning</h1>
              <HelpTip text="Markera risker som bevakning, åtgärdad eller avskriven. Avskrivning/åtgärd kräver motivering och loggas. Stängda risker påverkar inte alerts." />
            </div>
            <p className="page-subtitle">
              Hantera fysiska klimatrisker och MEPS/CRREM-gap. Stäng med
              motivering så att alerts speglar aktiva risker.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PropertyFilter value={propertyId} onChange={setPropertyId} />
            {tab === "compliance" && (
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
                Synka från prestanda
              </Button>
            )}
            {tab === "physical" && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Ny risk
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Step
            n="1"
            title="Identifiera"
            body="Registrera fysiska risker eller synka MEPS/CRREM från prestanda."
          />
          <Step
            n="2"
            title="Bevaka"
            body="Sätt status Bevakning för risker under uppföljning."
          />
          <Step
            n="3"
            title="Stäng"
            body="Åtgärdad eller avskriven kräver motivering och loggas."
          />
        </div>

        {/* Tabs + filter bar */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
          <div className="flex gap-1 rounded-xl border border-border bg-secondary/40 p-1">
            <Button
              size="sm"
              variant={tab === "physical" ? "default" : "ghost"}
              className="h-8"
              onClick={() => setTab("physical")}
            >
              <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
              Fysiska
            </Button>
            <Button
              size="sm"
              variant={tab === "compliance" ? "default" : "ghost"}
              className="h-8"
              onClick={() => setTab("compliance")}
            >
              <Scale className="mr-1.5 h-3.5 w-3.5" />
              MEPS / CRREM
            </Button>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={hideClosed}
              onCheckedChange={(v) => setHideClosed(v === true)}
            />
            Dölj stängda
          </label>

          <span className="ml-auto text-sm tabular text-muted-foreground">
            {activeStats.total} st
          </span>
        </div>

        {/* KPI strip for active tab */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Visade" value={String(activeStats.total)} />
          <Stat
            label="Öppna"
            value={String(activeStats.open)}
            tone="text-red-600"
          />
          <Stat
            label="Bevakning"
            value={String(activeStats.monitoring)}
            tone="text-amber-600"
          />
          <Stat
            label="Hög allvar"
            value={String(activeStats.high)}
            tone="text-red-600"
            help={
              tab === "physical"
                ? "Poäng ≥ 9 (sannolikhet × konsekvens)"
                : "Severity ≥ 9"
            }
          />
        </div>

        {refresh.isSuccess && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Synkade år {refresh.data.year}: {refresh.data.created} nya öppna
            risker.
          </div>
        )}

        {(physQ.error || compQ.error || refresh.isError || del.isError) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {(
              (physQ.error ||
                compQ.error ||
                refresh.error ||
                del.error) as Error
            )?.message}
          </div>
        )}

        {/* Physical risks */}
        {tab === "physical" && (
          <>
            {physQ.isLoading && (
              <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
                Laddar fysiska risker…
              </div>
            )}

            {!physQ.isLoading && (physQ.data?.length ?? 0) === 0 && (
              <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
                <AlertTriangle className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <h3 className="mt-3 text-lg font-semibold">
                  Inga fysiska risker att visa
                </h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Registrera en klimatrisk per fastighet, eller visa stängda
                  risker genom att avmarkera «Dölj stängda».
                </p>
                <Button className="mt-5" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Ny risk
                </Button>
              </div>
            )}

            <div className="grid gap-3">
              {(physQ.data ?? []).map((r) => (
                <article
                  key={r.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/20 hover:shadow-md sm:p-5"
                >
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border border-border bg-secondary/50">
                      <span
                        className={cn(
                          "text-lg font-bold tabular",
                          (r.risk_score ?? 0) >= 9
                            ? "text-red-600"
                            : (r.risk_score ?? 0) >= 5
                              ? "text-amber-600"
                              : "text-emerald-600"
                        )}
                      >
                        {r.risk_score != null
                          ? formatNumber(r.risk_score, 0)
                          : "—"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        poäng
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/properties/${r.property_id}`}
                          className="text-base font-semibold text-foreground hover:text-primary"
                        >
                          {r.property_name}
                        </Link>
                        <Badge variant={statusVariant(r.workflow_status)}>
                          {STATUS_SV[r.workflow_status] ?? r.workflow_status}
                        </Badge>
                        <Badge variant={scoreVariant(r.risk_score)}>
                          {RISK_SV[r.risk_type] ?? r.risk_type}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {LEVEL_SV[r.probability] ?? r.probability} ×{" "}
                        {LEVEL_SV[r.consequence] ?? r.consequence}
                        {r.municipality ? ` · ${r.municipality}` : ""}
                      </p>
                      {(r.status_reason || r.notes) && (
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                          {r.status_reason ?? r.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
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
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {/* Compliance risks */}
        {tab === "compliance" && (
          <>
            {compQ.isLoading && (
              <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
                Laddar compliance-risker…
              </div>
            )}

            {!compQ.isLoading && (compQ.data?.length ?? 0) === 0 && (
              <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
                <Scale className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <h3 className="mt-3 text-lg font-semibold">
                  Inga compliance-risker
                </h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Synka från prestanda för att skapa MEPS- och CRREM-risker
                  automatiskt, eller visa stängda.
                </p>
                <Button
                  className="mt-5"
                  disabled={refresh.isPending}
                  onClick={() => void refresh.mutateAsync()}
                >
                  {refresh.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Synka från prestanda
                </Button>
              </div>
            )}

            <div className="grid gap-3">
              {(compQ.data ?? []).map((r) => (
                <article
                  key={r.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/20 hover:shadow-md sm:p-5"
                >
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border border-border bg-secondary/50">
                      <span
                        className={cn(
                          "text-lg font-bold tabular",
                          (r.severity ?? 0) >= 9
                            ? "text-red-600"
                            : (r.severity ?? 0) >= 5
                              ? "text-amber-600"
                              : "text-emerald-600"
                        )}
                      >
                        {formatNumber(r.severity, 0)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        allvar
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/buildings?building=${r.building_id}`}
                          className="text-base font-semibold text-foreground hover:text-primary"
                        >
                          {r.building_name}
                        </Link>
                        <Badge variant={statusVariant(r.workflow_status)}>
                          {STATUS_SV[r.workflow_status] ?? r.workflow_status}
                        </Badge>
                        <Badge variant="outline">
                          {KIND_SV[r.risk_kind] ?? r.risk_kind}
                        </Badge>
                      </div>
                      <p className="mt-0.5 inline-flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {r.property_name}
                        </span>
                        <span>· År {r.year}</span>
                        <span className="tabular">
                          · Värde {formatNumber(r.metric_value, 1)}
                        </span>
                      </p>
                      {r.status_reason && (
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                          {r.status_reason}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
                      <StatusButtons
                        onStatus={(s) =>
                          setStatusTarget({
                            id: r.id,
                            kind: "compliance",
                            status: s,
                          })
                        }
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>

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

function Stat({
  label,
  value,
  tone,
  help,
}: {
  label: string;
  value: string;
  tone?: string;
  help?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        {label}
        {help && <HelpTip text={help} />}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular", tone)}>
        {value}
      </div>
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
    <div className="flex flex-wrap justify-end gap-1.5">
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        onClick={() => onStatus("monitoring")}
      >
        <Eye className="h-3.5 w-3.5" />
        Bevaka
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        onClick={() => onStatus("resolved")}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Åtgärdad
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        onClick={() => onStatus("dismissed")}
      >
        Avskriv
      </Button>
      {onDelete && (
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-destructive hover:bg-red-50 hover:text-destructive"
          onClick={onDelete}
          title="Ta bort"
        >
          <Trash2 className="h-3.5 w-3.5" />
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
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">
              {needsReason ? "Motivering (minst 5 tecken) *" : "Notering"}
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivering…"
              className="min-h-[72px]"
            />
          </div>
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
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
            Poäng = sannolikhet × konsekvens. Risken kopplas till en fastighet.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Fastighet *</label>
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
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Risktyp</label>
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
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                Sannolikhet
              </label>
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
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Konsekvens</label>
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
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Källa</label>
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="h-9"
              placeholder="t.ex. MSB, intern bedömning"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Notering</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[60px]"
              placeholder="Valfri beskrivning…"
            />
          </div>
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
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
