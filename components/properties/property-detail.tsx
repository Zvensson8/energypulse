"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getProperty,
  createBuilding,
  deleteProperty,
  recalculateBuildingYears,
} from "@/app/actions/properties-crud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DataGapBadge } from "@/components/energy/data-gap-badge";
import { EnergyClassBadge } from "@/components/energy/energy-class-badge";
import {
  Pencil,
  Plus,
  RefreshCw,
  MapPin,
  Building2,
  AlertTriangle,
  ArrowLeft,
  Upload,
  ArrowRight,
  Loader2,
  MapPinned,
} from "lucide-react";
import type { DataGapStatus, EnergyClass } from "@/lib/supabase/database.types";
import { OWNERSHIP_SV, STATUS_SV } from "@/lib/labels";
import { formatNumber, cn } from "@/lib/utils";

export function PropertyDetail({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => {
      const res = await getProperty(propertyId);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const deactivate = useMutation({
    mutationFn: async () => {
      const res = await deleteProperty(propertyId);
      if (!res.success) throw new Error(res.error);
    },
    onSuccess: () => {
      router.push("/properties");
    },
  });

  if (isLoading) {
    return (
      <div className="page-shell">
        <div className="page-inner">
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Laddar fastighet…
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-shell">
        <div className="page-inner">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {(error as Error)?.message ?? "Kunde inte ladda fastigheten."}
          </div>
          <Button variant="outline" asChild className="mt-4">
            <Link href="/properties">
              <ArrowLeft className="h-4 w-4" /> Tillbaka till listan
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const p = data.property as {
    id: string;
    name: string;
    external_id: string | null;
    address: string | null;
    municipality: string | null;
    climate_zone: string | null;
    ownership_type: string;
    status: string;
    latitude: number | null;
    longitude: number | null;
    portfolios?: { name: string } | null;
  };

  const piByBuilding = new Map(
    (data.performance as Array<{ building_id: string }>).map((x) => [
      x.building_id,
      x,
    ])
  );

  const buildings = data.buildings as Array<{
    id: string;
    name: string;
    construction_year: number | null;
    primary_use: string | null;
    protected_status: boolean;
  }>;

  const areas = data.areas as Array<{
    building_id: string;
    a_temp: number;
    valid_to?: string | null;
  }>;

  const totalAtemp = buildings.reduce((sum, b) => {
    const area =
      areas.find((a) => a.building_id === b.id && a.valid_to == null) ??
      areas.find((a) => a.building_id === b.id);
    return sum + (area ? Number(area.a_temp) : 0);
  }, 0);

  const withPerf = buildings.filter((b) => piByBuilding.has(b.id)).length;
  const risks = data.physical_risks as Array<{
    id: string;
    risk_type: string;
    probability: string;
    consequence: string;
    risk_score: number | null;
    notes: string | null;
  }>;

  return (
    <div className="page-shell">
      <div className="page-inner">
        {/* Back + header */}
        <div>
          <Link
            href="/properties"
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Fastigheter
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <MapPinned className="h-6 w-6 text-primary" />
                <h1 className="page-title">{p.name}</h1>
                <Badge
                  variant={
                    p.status === "active"
                      ? "success"
                      : p.status === "inactive"
                        ? "outline"
                        : "warning"
                  }
                >
                  {STATUS_SV[p.status] ?? p.status}
                </Badge>
              </div>
              <p className="page-subtitle">
                {p.external_id ? `${p.external_id} · ` : ""}
                {p.address ?? p.municipality ?? "Ingen adress"}
                {p.portfolios?.name ? ` · ${p.portfolios.name}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href={`/properties/${propertyId}/edit`}>
                  <Pencil className="h-4 w-4" />
                  Redigera
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/import">
                  <Upload className="h-4 w-4" />
                  Importera energi
                </Link>
              </Button>
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" />
                Lägg till byggnad
              </Button>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Step
            n="1"
            title="Byggnader"
            body="Registrera varje hus under fastigheten med Atemp."
          />
          <Step
            n="2"
            title="Energidata"
            body="Importera månadsförbrukning så prestanda kan beräknas."
          />
          <Step
            n="3"
            title="Följ upp risk"
            body="Se gap 2030 och CRREM, skapa åtgärder vid behov."
          />
        </div>

        {/* Meta + stats */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetaCard
            label="Kommun / zon"
            value={`${p.municipality ?? "—"} · Zon ${p.climate_zone ?? "—"}`}
            icon={<MapPin className="h-4 w-4" />}
          />
          <MetaCard
            label="Ägande"
            value={OWNERSHIP_SV[p.ownership_type] ?? p.ownership_type}
          />
          <StatCard label="Byggnader" value={String(buildings.length)} />
          <StatCard
            label="Atemp totalt"
            value={totalAtemp > 0 ? `${formatNumber(totalAtemp, 0)} m²` : "—"}
            sub={
              withPerf > 0
                ? `${withPerf} med beräknad prestanda`
                : "Ingen prestanda ännu"
            }
          />
        </div>

        {/* Buildings */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              Byggnader{" "}
              <span className="text-muted-foreground">
                ({buildings.length})
              </span>
            </h2>
            <Button size="sm" variant="outline" asChild>
              <Link href="/buildings">
                Alla byggnader
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          {buildings.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
              <Building2 className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-3 text-lg font-semibold">Inga byggnader</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Lägg till en byggnad med Atemp för att börja spåra energi och
                risk.
              </p>
              <Button className="mt-5" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> Lägg till byggnad
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {buildings.map((b) => {
                const pi = piByBuilding.get(b.id) as
                  | {
                      energy_intensity: number | null;
                      data_gap_status: string;
                      data_completeness_percent: number;
                      meps_2030_gap: number | null;
                      crrem_stranding_year: number | null;
                      energy_class: string | null;
                    }
                  | undefined;
                const area =
                  areas.find(
                    (a) => a.building_id === b.id && a.valid_to == null
                  ) ?? areas.find((a) => a.building_id === b.id);

                return (
                  <article
                    key={b.id}
                    className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/20 hover:shadow-md sm:p-5"
                  >
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/buildings/${b.id}`}
                            className="text-base font-semibold hover:text-primary"
                          >
                            {b.name}
                          </Link>
                          {b.protected_status && (
                            <Badge variant="warning" title="K-märkt">
                              ★ K-märkt
                            </Badge>
                          )}
                          <EnergyClassBadge
                            value={pi?.energy_class as EnergyClass | null}
                          />
                          {pi ? (
                            <DataGapBadge
                              status={pi.data_gap_status as DataGapStatus}
                              completeness={pi.data_completeness_percent}
                            />
                          ) : (
                            <Badge variant="outline">Ej beräknad</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {b.primary_use ?? "—"}
                          {b.construction_year
                            ? ` · Byggår ${b.construction_year}`
                            : ""}
                          {area
                            ? ` · Atemp ${formatNumber(Number(area.a_temp), 0)} m²`
                            : ""}
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <MiniStat
                            label="kWh/m²"
                            value={formatNumber(pi?.energy_intensity, 1)}
                          />
                          <MiniStat
                            label="Gap 2030"
                            value={formatNumber(pi?.meps_2030_gap, 1)}
                            tone={
                              pi?.meps_2030_gap != null && pi.meps_2030_gap > 0
                                ? "text-amber-600"
                                : undefined
                            }
                          />
                          <MiniStat
                            label="CRREM riskår"
                            value={
                              pi?.crrem_stranding_year != null
                                ? String(pi.crrem_stranding_year)
                                : "—"
                            }
                            tone={
                              pi?.crrem_stranding_year != null &&
                              pi.crrem_stranding_year < 2035
                                ? "text-red-600"
                                : undefined
                            }
                          />
                          <MiniStat
                            label="Datakvalitet"
                            value={
                              pi
                                ? `${formatNumber(pi.data_completeness_percent, 0)} %`
                                : "—"
                            }
                          />
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/buildings/${b.id}`}>
                            Öppna
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                        <RecalcButton buildingId={b.id} />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Physical risks */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Fysiska klimatrisker</h2>
            <Button size="sm" variant="outline" asChild>
              <Link href="/risks">
                Hantera risker
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          {risks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Inga risker registrerade.{" "}
              <Link href="/risks" className="font-medium text-primary hover:underline">
                Lägg till på Risker
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {risks.map((r) => (
                <div
                  key={r.id}
                  className="inline-flex items-start gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm shadow-sm"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div>
                    <div className="font-medium">{r.risk_type}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.probability}/{r.consequence}
                      {r.risk_score != null
                        ? ` · poäng ${formatNumber(r.risk_score, 0)}`
                        : ""}
                      {r.notes ? ` · ${r.notes}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Danger zone */}
        <div className="rounded-2xl border border-red-100 bg-red-50/50 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-red-800">
                Inaktivera fastighet
              </div>
              <p className="text-xs text-red-700/80">
                Döljs från aktiva listor. Data behålls i systemet.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-red-200 text-red-700 hover:bg-red-100"
              disabled={deactivate.isPending}
              onClick={() => {
                if (
                  confirm(
                    "Vill du inaktivera fastigheten? Den döljs från aktiva listor."
                  )
                )
                  deactivate.mutate();
              }}
            >
              {deactivate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Inaktivera
            </Button>
          </div>
        </div>

        <AddBuildingDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          propertyId={propertyId}
          onCreated={() => {
            void qc.invalidateQueries({ queryKey: ["property", propertyId] });
          }}
        />
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

function MetaCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-base font-semibold">{value}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular">{value}</div>
      {sub && (
        <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl bg-secondary/50 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-semibold tabular", tone)}>{value}</div>
    </div>
  );
}

function RecalcButton({ buildingId }: { buildingId: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async () => {
      const res = await recalculateBuildingYears(buildingId);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["property"] });
      void qc.invalidateQueries({ queryKey: ["buildings-table"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-kpis"] });
    },
  });
  return (
    <Button
      size="sm"
      variant="ghost"
      title="Beräkna prestanda"
      disabled={m.isPending}
      onClick={() => m.mutate()}
    >
      <RefreshCw className={cn("h-4 w-4", m.isPending && "animate-spin")} />
      Räkna om
    </Button>
  );
}

function AddBuildingDialog({
  open,
  onOpenChange,
  propertyId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  propertyId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [use, setUse] = useState("office");
  const [atemp, setAtemp] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: async () => {
      const res = await createBuilding({
        property_id: propertyId,
        name: name.trim(),
        construction_year: year ? Number(year) : null,
        primary_use: use as "office",
        a_temp: atemp ? Number(atemp) : undefined,
        area_source: "manuell inmatning",
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      setName("");
      setYear("");
      setAtemp("");
      setErr(null);
      onOpenChange(false);
      onCreated();
    },
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Lägg till byggnad</DialogTitle>
          <DialogDescription>
            Skapar byggnad och valfri Atemp under den här fastigheten.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">
              Namn *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="t.ex. Hus A"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">
                Byggår
              </label>
              <Input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="1998"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">
                Atemp (m²)
              </label>
              <Input
                value={atemp}
                onChange={(e) => setAtemp(e.target.value)}
                placeholder="5000"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">
              Primär användning
            </label>
            <Select value={use} onValueChange={setUse}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="office">Kontor</SelectItem>
                <SelectItem value="retail">Handel</SelectItem>
                <SelectItem value="warehouse">Lager</SelectItem>
                <SelectItem value="industrial">Industri</SelectItem>
                <SelectItem value="mixed">Blandat</SelectItem>
                <SelectItem value="other">Övrigt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {err}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button
              disabled={!name.trim() || m.isPending}
              onClick={() => m.mutate()}
            >
              {m.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Sparar…
                </>
              ) : (
                "Spara byggnad"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
