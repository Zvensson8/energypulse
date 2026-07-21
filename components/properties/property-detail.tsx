"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  listPortfolioSpaces,
  decryptTenantName,
  createSpace,
} from "@/app/actions/spaces-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { HelpTip } from "@/components/ui/help-tip";
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
  DoorOpen,
  Eye,
  EyeOff,
  Flame,
  Thermometer,
  Shield,
  LayoutDashboard,
  Activity,
  ListTodo,
  Hammer,
} from "lucide-react";
import type { DataGapStatus, EnergyClass } from "@/lib/supabase/database.types";
import { OWNERSHIP_SV, STATUS_SV } from "@/lib/labels";
import { formatNumber, cn } from "@/lib/utils";
import { RiskScoresView } from "@/components/risk/risk-scores-view";
import { PhysicalRisksView } from "@/components/risks/physical-risks-view";
import { ActionsView } from "@/components/actions/actions-view";
import { RenovationPlansView } from "@/components/renovation/renovation-plans-view";

type TabId =
  | "overview"
  | "buildings"
  | "spaces"
  | "risk-scores"
  | "risks"
  | "actions"
  | "renovation";

const TABS: {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group?: "structure" | "work";
}[] = [
  { id: "overview", label: "Översikt", icon: LayoutDashboard },
  { id: "buildings", label: "Byggnader", icon: Building2, group: "structure" },
  { id: "spaces", label: "Lokaler", icon: DoorOpen, group: "structure" },
  { id: "risk-scores", label: "Riskscore", icon: Activity, group: "work" },
  { id: "risks", label: "Risker", icon: AlertTriangle, group: "work" },
  { id: "actions", label: "Åtgärder", icon: ListTodo, group: "work" },
  { id: "renovation", label: "Renovering", icon: Hammer, group: "work" },
];

const VALID_TABS = new Set<TabId>(TABS.map((t) => t.id));

const SPACE_TYPE_SV: Record<string, string> = {
  office: "Kontor",
  retail: "Butik",
  warehouse: "Lager",
  industrial: "Industri",
  hotel: "Hotell",
  education: "Utbildning",
  healthcare: "Vård",
  mixed: "Blandat",
  other: "Övrigt",
};

export function PropertyDetail({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [addSpaceOpen, setAddSpaceOpen] = useState(false);

  const tabParam = searchParams.get("tab");
  const tab: TabId =
    tabParam && VALID_TABS.has(tabParam as TabId)
      ? (tabParam as TabId)
      : "overview";

  function setTab(next: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(
      qs ? `/properties/${propertyId}?${qs}` : `/properties/${propertyId}`,
      { scroll: false }
    );
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => {
      const res = await getProperty(propertyId);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const spacesQ = useQuery({
    queryKey: ["property-spaces", propertyId],
    queryFn: async () => {
      const res = await listPortfolioSpaces({ propertyId });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    enabled: tab === "spaces" || tab === "overview",
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
  const spaceCount = spacesQ.data?.length ?? null;

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
              {tab === "spaces" ? (
                <Button
                  onClick={() => setAddSpaceOpen(true)}
                  disabled={buildings.length === 0}
                >
                  <Plus className="h-4 w-4" />
                  Ny lokal
                </Button>
              ) : (
                <Button onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Lägg till byggnad
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs – scrollable on small screens */}
        <div className="overflow-x-auto rounded-2xl border border-border bg-card p-1.5 shadow-sm">
          <div className="flex min-w-max gap-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              const count =
                t.id === "buildings"
                  ? buildings.length
                  : t.id === "spaces"
                    ? spaceCount
                    : null;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap">{t.label}</span>
                  {count != null && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[11px] tabular",
                        active
                          ? "bg-primary-foreground/20"
                          : "bg-secondary text-muted-foreground"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {tab === "overview" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Step
                n="1"
                title="Byggnader & lokaler"
                body="Struktur under fastigheten – hus, Atemp och hyresgäster."
                onClick={() => setTab("buildings")}
              />
              <Step
                n="2"
                title="Riskscore & risker"
                body="Se score och registrera fysiska risker här – eller i menyn."
                onClick={() => setTab("risk-scores")}
              />
              <Step
                n="3"
                title="Åtgärder & planer"
                body="Skapa åtgärder och renovationsplaner kopplade till husen."
                onClick={() => setTab("actions")}
              />
            </div>

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
              <button
                type="button"
                onClick={() => setTab("buildings")}
                className="rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary/25 hover:shadow-md"
              >
                <div className="text-sm text-muted-foreground">Byggnader</div>
                <div className="mt-1 text-2xl font-semibold tabular">
                  {buildings.length}
                </div>
                <div className="mt-0.5 text-xs text-primary">Visa →</div>
              </button>
              <button
                type="button"
                onClick={() => setTab("spaces")}
                className="rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary/25 hover:shadow-md"
              >
                <div className="text-sm text-muted-foreground">Lokaler</div>
                <div className="mt-1 text-2xl font-semibold tabular">
                  {spaceCount ?? "…"}
                </div>
                <div className="mt-0.5 text-xs text-primary">Visa →</div>
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                label="Atemp totalt"
                value={
                  totalAtemp > 0 ? `${formatNumber(totalAtemp, 0)} m²` : "—"
                }
                sub={
                  withPerf > 0
                    ? `${withPerf} med beräknad prestanda`
                    : "Ingen prestanda ännu"
                }
              />
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="text-sm text-muted-foreground">
                  Snabbåtgärder
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setAddOpen(true)}>
                    <Plus className="h-4 w-4" /> Byggnad
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAddSpaceOpen(true)}
                    disabled={buildings.length === 0}
                  >
                    <Plus className="h-4 w-4" /> Lokal
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTab("risks")}
                  >
                    <AlertTriangle className="h-4 w-4" /> Risk
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTab("actions")}
                  >
                    <ListTodo className="h-4 w-4" /> Åtgärd
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/import">
                      <Upload className="h-4 w-4" /> Importera
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  {
                    id: "risk-scores" as const,
                    label: "Riskscore",
                    desc: "MEPS + CRREM + data",
                    icon: Activity,
                  },
                  {
                    id: "risks" as const,
                    label: "Risker",
                    desc: "Registrera & stäng",
                    icon: AlertTriangle,
                  },
                  {
                    id: "actions" as const,
                    label: "Åtgärder",
                    desc: "Simulera & slutför",
                    icon: ListTodo,
                  },
                  {
                    id: "renovation" as const,
                    label: "Renovering",
                    desc: "A/B/C-planer",
                    icon: Hammer,
                  },
                ] as const
              ).map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setTab(card.id)}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition hover:border-primary/25 hover:shadow-md"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {card.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {card.desc}
                      </span>
                    </span>
                    <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>

            {/* Preview buildings */}
            {buildings.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">Byggnader</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTab("buildings")}
                  >
                    Alla ({buildings.length})
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {buildings.slice(0, 4).map((b) => {
                    const pi = piByBuilding.get(b.id) as
                      | { energy_class: string | null; data_gap_status: string }
                      | undefined;
                    return (
                      <Link
                        key={b.id}
                        href={`/buildings/${b.id}`}
                        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm transition hover:border-primary/25 hover:shadow-md"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Building2 className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {b.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {b.primary_use ?? "—"}
                          </span>
                        </span>
                        <EnergyClassBadge
                          value={pi?.energy_class as EnergyClass | null}
                        />
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Physical risks */}
            <RisksSection risks={risks} />

            <DangerZone
              pending={deactivate.isPending}
              onDeactivate={() => {
                if (
                  confirm(
                    "Vill du inaktivera fastigheten? Den döljs från aktiva listor."
                  )
                )
                  deactivate.mutate();
              }}
            />
          </>
        )}

        {tab === "buildings" && (
          <BuildingsPanel
            buildings={buildings}
            areas={areas}
            piByBuilding={piByBuilding}
            onAdd={() => setAddOpen(true)}
          />
        )}

        {tab === "spaces" && (
          <SpacesPanel
            buildings={buildings}
            spaces={spacesQ.data}
            isLoading={spacesQ.isLoading}
            error={spacesQ.error as Error | null}
            onAdd={() => setAddSpaceOpen(true)}
            onOpenBuildings={() => setTab("buildings")}
          />
        )}

        {tab === "risk-scores" && (
          <RiskScoresView
            lockedPropertyId={propertyId}
            embedded
          />
        )}

        {tab === "risks" && (
          <PhysicalRisksView
            lockedPropertyId={propertyId}
            embedded
          />
        )}

        {tab === "actions" && (
          <ActionsView lockedPropertyId={propertyId} embedded />
        )}

        {tab === "renovation" && (
          <RenovationPlansView
            lockedPropertyId={propertyId}
            embedded
          />
        )}

        <AddBuildingDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          propertyId={propertyId}
          onCreated={() => {
            void qc.invalidateQueries({ queryKey: ["property", propertyId] });
          }}
        />

        <AddSpaceDialog
          open={addSpaceOpen}
          onOpenChange={setAddSpaceOpen}
          buildings={buildings}
          onCreated={() => {
            void qc.invalidateQueries({
              queryKey: ["property-spaces", propertyId],
            });
          }}
        />
      </div>
    </div>
  );
}

function BuildingsPanel({
  buildings,
  areas,
  piByBuilding,
  onAdd,
}: {
  buildings: Array<{
    id: string;
    name: string;
    construction_year: number | null;
    primary_use: string | null;
    protected_status: boolean;
  }>;
  areas: Array<{
    building_id: string;
    a_temp: number;
    valid_to?: string | null;
  }>;
  piByBuilding: Map<string, unknown>;
  onAdd: () => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">
            Byggnader{" "}
            <span className="text-muted-foreground">({buildings.length})</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            Hus under den här fastigheten – öppna för betyg, plan och PDF.
          </p>
        </div>
        <Button size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Lägg till byggnad
        </Button>
      </div>

      {buildings.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <h3 className="mt-3 text-lg font-semibold">Inga byggnader</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Lägg till en byggnad med Atemp för att börja spåra energi och risk.
          </p>
          <Button className="mt-5" onClick={onAdd}>
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
  );
}

function SpacesPanel({
  buildings,
  spaces,
  isLoading,
  error,
  onAdd,
  onOpenBuildings,
}: {
  buildings: Array<{ id: string; name: string }>;
  spaces:
    | Array<{
        id: string;
        building_id: string;
        building_name: string;
        name: string | null;
        space_type: string;
        tenant_name: string | null;
        has_tenant: boolean;
        contract_start: string | null;
        contract_end: string | null;
        loa: number | null;
        boa: number | null;
        is_heated: boolean;
      }>
    | undefined;
  isLoading: boolean;
  error: Error | null;
  onAdd: () => void;
  onOpenBuildings: () => void;
}) {
  const [reveal, setReveal] = useState<{
    spaceId: string;
    name: string | null;
  } | null>(null);

  const rows = spaces ?? [];
  const stats = useMemo(() => {
    return {
      total: rows.length,
      withTenant: rows.filter((s) => s.has_tenant).length,
      heated: rows.filter((s) => s.is_heated).length,
      loa: rows.reduce((sum, s) => sum + (s.loa ?? 0), 0),
    };
  }, [rows]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              Lokaler{" "}
              <span className="text-muted-foreground">({stats.total})</span>
            </h2>
            <HelpTip text="Hyresgästnamn visas maskerade av GDPR-skäl. Visa original kräver motivering och loggas." />
          </div>
          <p className="text-sm text-muted-foreground">
            Lokaler i den här fastighetens byggnader.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <Shield className="h-3.5 w-3.5" />
            Hyresgäst maskerad
          </span>
          <Button
            size="sm"
            onClick={onAdd}
            disabled={buildings.length === 0}
          >
            <Plus className="h-4 w-4" />
            Ny lokal
          </Button>
        </div>
      </div>

      {buildings.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <h3 className="mt-3 text-lg font-semibold">Lägg till byggnad först</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Lokaler kopplas till en byggnad under fastigheten.
          </p>
          <Button className="mt-5" onClick={onOpenBuildings}>
            Till byggnader
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Lokaler" value={String(stats.total)} />
            <StatCard
              label="Med hyresgäst"
              value={String(stats.withTenant)}
            />
            <StatCard label="Uppvärmda" value={String(stats.heated)} />
            <StatCard
              label="Summa LOA"
              value={
                stats.loa > 0 ? `${formatNumber(stats.loa, 0)} m²` : "—"
              }
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error.message}
            </div>
          )}

          {isLoading && (
            <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Laddar lokaler…
            </div>
          )}

          {!isLoading && rows.length === 0 && (
            <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
              <DoorOpen className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-3 text-lg font-semibold">Inga lokaler</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Skapa en lokal och koppla den till en byggnad under den här
                fastigheten.
              </p>
              <Button className="mt-5" onClick={onAdd}>
                <Plus className="h-4 w-4" /> Skapa lokal
              </Button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((s) => (
              <article
                key={s.id}
                className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/25 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <DoorOpen className="h-5 w-5" />
                  </span>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Badge variant="outline">
                      {SPACE_TYPE_SV[s.space_type] ?? s.space_type}
                    </Badge>
                    {s.is_heated ? (
                      <Badge variant="warning">
                        <Flame className="mr-1 h-3 w-3" />
                        Uppvärmd
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        <Thermometer className="mr-1 h-3 w-3" />
                        Ouppvärmd
                      </Badge>
                    )}
                  </div>
                </div>

                <h3 className="mt-3 text-base font-semibold">
                  {s.name ?? "Namnlös lokal"}
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  <Link
                    href={`/buildings/${s.building_id}`}
                    className="inline-flex items-center gap-1 hover:text-primary"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    {s.building_name}
                  </Link>
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MiniStat
                    label="LOA"
                    value={
                      s.loa != null ? `${formatNumber(s.loa, 0)} m²` : "—"
                    }
                  />
                  <MiniStat
                    label="BOA"
                    value={
                      s.boa != null ? `${formatNumber(s.boa, 0)} m²` : "—"
                    }
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {s.has_tenant ? (
                    <Badge variant="outline">{s.tenant_name ?? "***"}</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Ingen hyresgäst
                    </span>
                  )}
                </div>

                {(s.contract_start || s.contract_end) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Kontrakt: {s.contract_start ?? "—"}
                    {s.contract_end ? ` → ${s.contract_end}` : ""}
                  </p>
                )}

                {s.has_tenant && (
                  <div className="mt-4 border-t border-border pt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-1.5"
                      onClick={() =>
                        setReveal({ spaceId: s.id, name: s.name })
                      }
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Visa hyresgäst
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      <RevealTenantDialog
        open={Boolean(reveal)}
        spaceId={reveal?.spaceId ?? null}
        spaceLabel={reveal?.name}
        onClose={() => setReveal(null)}
      />
    </section>
  );
}

function RisksSection({
  risks,
}: {
  risks: Array<{
    id: string;
    risk_type: string;
    probability: string;
    consequence: string;
    risk_score: number | null;
    notes: string | null;
  }>;
}) {
  return (
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
          <Link
            href="/risks"
            className="font-medium text-primary hover:underline"
          >
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
  );
}

function DangerZone({
  pending,
  onDeactivate,
}: {
  pending: boolean;
  onDeactivate: () => void;
}) {
  return (
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
          disabled={pending}
          onClick={onDeactivate}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Inaktivera
        </Button>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  body,
  onClick,
}: {
  n: string;
  title: string;
  body: string;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-2xl border border-border bg-card p-4 text-left shadow-sm",
        onClick && "transition hover:border-primary/25 hover:shadow-md"
      )}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
        {n}
      </div>
      <div className="mt-2 text-sm font-semibold">{title}</div>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
        {body}
      </p>
    </Comp>
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

function AddSpaceDialog({
  open,
  onOpenChange,
  buildings,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  buildings: Array<{ id: string; name: string }>;
  onCreated: () => void;
}) {
  const [buildingId, setBuildingId] = useState("");
  const [name, setName] = useState("");
  const [spaceType, setSpaceType] = useState("office");
  const [tenant, setTenant] = useState("");
  const [loa, setLoa] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Preselect first building when dialog opens
  const effectiveBuilding =
    buildingId || (buildings.length === 1 ? buildings[0].id : "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const bid = effectiveBuilding;
    if (!bid) {
      setError("Välj byggnad");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await createSpace({
        building_id: bid,
        name: name.trim() || null,
        space_type: spaceType,
        tenant_name: tenant.trim() || null,
        loa: loa ? Number(loa) : null,
        is_heated: true,
      });
      if (!res.success) throw new Error(res.error);
      setName("");
      setTenant("");
      setLoa("");
      setBuildingId("");
      onOpenChange(false);
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
          <DialogTitle>Ny lokal</DialogTitle>
          <DialogDescription>
            Kopplas till en byggnad under den här fastigheten. Hyresgäst
            krypteras automatiskt.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Byggnad *</label>
            <Select
              value={effectiveBuilding}
              onValueChange={setBuildingId}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Välj byggnad" />
              </SelectTrigger>
              <SelectContent>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Lokalnamn</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="t.ex. Plan 3 vänster"
              className="h-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Typ</label>
              <Select value={spaceType} onValueChange={setSpaceType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SPACE_TYPE_SV).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">LOA m²</label>
              <Input
                type="number"
                min={0}
                value={loa}
                onChange={(e) => setLoa(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">
              Hyresgäst (valfritt, krypteras)
            </label>
            <Input
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              placeholder="Företagsnamn"
              className="h-9"
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
            <Button type="submit" disabled={pending || !effectiveBuilding}>
              {pending ? "Sparar…" : "Spara"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RevealTenantDialog({
  open,
  spaceId,
  spaceLabel,
  onClose,
}: {
  open: boolean;
  spaceId: string | null;
  spaceLabel?: string | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [plain, setPlain] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      if (!spaceId) throw new Error("Saknar lokal");
      const res = await decryptTenantName({
        space_id: spaceId,
        reason: reason.trim(),
      });
      if (!res.success) throw new Error(res.error);
      return res.data.tenant_name;
    },
    onSuccess: (name) => {
      setPlain(name);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason("");
          setPlain(null);
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            Visa hyresgäst
          </DialogTitle>
          <DialogDescription>
            GDPR: du måste ange en motivering. Åtgärden loggas. Lokal:{" "}
            {spaceLabel ?? spaceId}
          </DialogDescription>
        </DialogHeader>
        {plain ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="text-sm text-muted-foreground">Hyresgäst</div>
              <div className="text-base font-semibold text-emerald-800">
                {plain}
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full gap-1.5"
              onClick={() => {
                setPlain(null);
                setReason("");
                onClose();
              }}
            >
              <EyeOff className="h-3.5 w-3.5" />
              Stäng och dölj
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                Motivering (minst 5 tecken) *
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="t.ex. Hyresgästkontakt i ärende #123"
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
                disabled={reason.trim().length < 5 || mut.isPending}
                onClick={() => void mut.mutateAsync()}
              >
                {mut.isPending ? "Hämtar…" : "Visa namn"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
