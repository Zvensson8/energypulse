"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBuildingProvenance } from "@/app/actions/provenance";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DataGapBadge } from "@/components/energy/data-gap-badge";
import { EnergyClassBadge } from "@/components/energy/energy-class-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatIntensity, formatKwh, formatNumber, cn } from "@/lib/utils";
import type { EnergyClass, DataGapStatus } from "@/lib/supabase/database.types";
import {
  AlertTriangle,
  History,
  ShieldAlert,
  HelpCircle,
  Calculator,
  Building2,
  Zap,
  Thermometer,
  ChevronDown,
  ChevronUp,
  LineChart,
} from "lucide-react";

const MONTH_SV = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Maj",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dec",
];

const QUALITY_SV: Record<string, string> = {
  A: "Mycket hög",
  B: "Hög",
  C: "Medel",
  D: "Låg",
  E: "Osäker",
};

function gapPlain(status: string | null | undefined): string {
  switch (status) {
    case "COMPLETE_DATA":
      return "Komplett data – alla månader finns, beräkningen är tillförlitlig.";
    case "EXTRAPOLATED_WARNING":
      return "Delvis uppskattad – vissa månader är interpolerade. Använd med viss försiktighet.";
    case "INCOMPLETE_DATA":
      return "Ofullständig data – för få månader. Resultatet bör inte användas för beslut utan override.";
    default:
      return "Datakvalitet okänd.";
  }
}

function mepsPlain(gap: number | null | undefined): string {
  if (gap == null) return "Kravgap kunde inte beräknas (saknas data eller area).";
  if (gap <= 0)
    return `Uppfyller 2030-kravet med ${formatNumber(Math.abs(gap), 1)} kWh/m² marginal.`;
  return `${formatNumber(gap, 1)} kWh/m² över 2030-kravet – åtgärder behövs.`;
}

export function ProvenanceModal({
  open,
  onOpenChange,
  buildingId,
  year,
  onOpenOverride,
  onOpenAudit,
  onOpenCrrem,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string | null;
  year: number;
  onOpenOverride?: () => void;
  onOpenAudit?: () => void;
  onOpenCrrem?: () => void;
}) {
  const [showRawMonths, setShowRawMonths] = useState(false);
  const [showClimate, setShowClimate] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["provenance", buildingId, year],
    enabled: open && Boolean(buildingId),
    queryFn: async () => {
      const res = await getBuildingProvenance({
        building_id: buildingId!,
        year,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const incomplete =
    data?.performance?.data_gap_status === "INCOMPLETE_DATA";

  const totalKwh = useMemo(
    () =>
      (data?.consumption ?? []).reduce((s, c) => s + c.consumption_kwh, 0),
    [data?.consumption]
  );

  const bySource = useMemo(() => {
    const map = new Map<string, { name: string; kwh: number; estimated: number }>();
    for (const c of data?.consumption ?? []) {
      const cur = map.get(c.energy_source_id) ?? {
        name: c.energy_source_name,
        kwh: 0,
        estimated: 0,
      };
      cur.kwh += c.consumption_kwh;
      if (c.is_estimated) cur.estimated += 1;
      map.set(c.energy_source_id, cur);
    }
    return [...map.values()].sort((a, b) => b.kwh - a.kwh);
  }, [data?.consumption]);

  const pi = data?.performance;
  const aTemp = pi?.a_temp ?? data?.area?.a_temp ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden p-0 sm:max-w-3xl">
        <div className="border-b border-border px-5 py-4 pr-12">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <HelpCircle className="h-5 w-5 text-primary" />
              Så räknades resultatet
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Här ser du varifrån siffrorna för{" "}
              <span className="font-medium text-foreground">
                {data?.building.name ?? "byggnaden"}
              </span>{" "}
              år {year} kommer – mätvärden, area och hur kWh/m², kravgap och
              klimatrisk beräknas. Inget sparas om du bara tittar.
            </DialogDescription>
          </DialogHeader>
          {data && (
            <p className="mt-2 text-xs text-muted-foreground">
              {data.building.property_name}
              {data.building.municipality
                ? ` · ${data.building.municipality}`
                : ""}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {onOpenAudit && (
              <Button size="sm" variant="outline" onClick={onOpenAudit}>
                <History className="h-4 w-4" />
                Ändringshistorik
              </Button>
            )}
            {onOpenCrrem && (
              <Button size="sm" variant="outline" onClick={onOpenCrrem}>
                <LineChart className="h-4 w-4" />
                Klimatrisk (CRREM)
              </Button>
            )}
            {incomplete && onOpenOverride && (
              <Button size="sm" variant="destructive" onClick={onOpenOverride}>
                <ShieldAlert className="h-4 w-4" />
                Tvinga beräkning
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="max-h-[calc(90vh-9rem)] px-5 py-4">
          {isLoading && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Hämtar underlag…
            </div>
          )}
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {(error as Error).message}
            </div>
          )}

          {data && (
            <div className="space-y-4 pb-4">
              {/* Status banners */}
              {pi?.override_applied && (
                <Banner
                  tone="amber"
                  icon={<AlertTriangle className="h-4 w-4" />}
                  title="Manuell override är aktiv"
                  body={
                    pi.override_reason
                      ? `Motivering: ${pi.override_reason}`
                      : "Beräkningen har tvingats trots ofullständig data."
                  }
                />
              )}
              {data.estimated_row_count > 0 && (
                <Banner
                  tone="amber"
                  icon={<AlertTriangle className="h-4 w-4" />}
                  title={`${data.estimated_row_count} månadsvärden är uppskattade`}
                  body={`${data.measured_row_count} mätta · ${data.estimated_row_count} interpolerade. Uppskattade rader används när mätvärde saknas.`}
                />
              )}

              {/* 1. Resultat i klarspråk */}
              <Section
                icon={<Calculator className="h-4 w-4" />}
                title="Resultat i klarspråk"
                subtitle="Det du ser i listan och på dashboard"
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Kpi
                    label="Energiintensitet"
                    value={formatIntensity(pi?.energy_intensity)}
                    hint="kWh per m² och år"
                  />
                  <Kpi
                    label="Primärenergital"
                    value={formatIntensity(pi?.primary_energy_intensity)}
                    hint="Viktad energi (PEF)"
                  />
                  <Kpi
                    label="Klimatpåverkan"
                    value={
                      pi?.ghg_intensity != null
                        ? `${formatNumber(pi.ghg_intensity, 2)} kg CO₂e/m²`
                        : "—"
                    }
                    hint="Utsläppsintensitet"
                  />
                  <div className="rounded-xl bg-secondary/50 px-3 py-2.5">
                    <div className="text-xs text-muted-foreground">
                      Energiklass
                    </div>
                    <div className="mt-1">
                      <EnergyClassBadge
                        value={pi?.energy_class as EnergyClass | null}
                      />
                    </div>
                  </div>
                  <div className="rounded-xl bg-secondary/50 px-3 py-2.5 sm:col-span-2">
                    <div className="text-xs text-muted-foreground">
                      Datakvalitet
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <DataGapBadge
                        status={pi?.data_gap_status as DataGapStatus | null}
                        completeness={pi?.data_completeness_percent}
                      />
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {gapPlain(pi?.data_gap_status)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
                  <p>
                    <span className="font-medium">Kravgap 2030 (MEPS): </span>
                    {mepsPlain(pi?.meps_2030_gap)}
                  </p>
                  <p>
                    <span className="font-medium">Klimatriskår (CRREM): </span>
                    {pi?.crrem_stranding_year != null
                      ? `Utsläppen riskerar att passera banan omkring ${pi.crrem_stranding_year} (version ${pi.crrem_version_used ?? "—"}).`
                      : "Ingen stranding beräknad – saknas utsläppsdata eller pathway."}
                  </p>
                </div>
              </Section>

              {/* 2. Hur vi räknar */}
              <Section
                icon={<Calculator className="h-4 w-4" />}
                title="Hur vi räknar"
                subtitle="Enkla formler med era tal ifyllda"
              >
                <ol className="space-y-3 text-sm">
                  <FormulaStep
                    n="1"
                    title="Energiintensitet"
                    body={
                      aTemp != null && pi?.total_energy_kwh != null
                        ? `Total energi ÷ uppvärmd area = ${formatKwh(pi.total_energy_kwh)} ÷ ${formatNumber(aTemp, 0)} m² = ${formatIntensity(pi.energy_intensity)}.`
                        : "Total energi för året divideras med Atemp (uppvärmd area)."
                    }
                  />
                  <FormulaStep
                    n="2"
                    title="Primärenergital"
                    body="Varje energislag multipliceras med sin primärenergifaktor (t.ex. el 1,8, fjärrvärme 0,7), summeras och delas med Atemp."
                  />
                  <FormulaStep
                    n="3"
                    title="Klimatpåverkan"
                    body="Varje energislag multipliceras med utsläppsfaktor (kg CO₂e/kWh), summeras och delas med Atemp."
                  />
                  <FormulaStep
                    n="4"
                    title="Kravgap 2030"
                    body={
                      pi?.energy_intensity != null
                        ? `Intensitet minus kravnivå för byggnadens användning. Er intensitet: ${formatIntensity(pi.energy_intensity)}. Gap: ${formatNumber(pi.meps_2030_gap, 1)} kWh/m² (negativt = under kravet).`
                        : "Intensitet minus lagkravet för 2030 för byggnadstypen."
                    }
                  />
                </ol>
              </Section>

              {/* 3. Area */}
              <Section
                icon={<Building2 className="h-4 w-4" />}
                title="Uppvärmd area (Atemp)"
                subtitle="Ytan som all intensitet baseras på"
              >
                {data.area ? (
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <span className="text-muted-foreground">Atemp </span>
                      <span className="font-semibold tabular">
                        {formatNumber(data.area.a_temp, 0)} m²
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Gäller </span>
                      {data.area.valid_from}
                      {" → "}
                      {data.area.valid_to ?? "tillsvidare"}
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">Källa </span>
                      {data.area.source ?? "Ej angiven"}
                      {data.area.quality_class
                        ? ` · kvalitet ${QUALITY_SV[data.area.quality_class] ?? data.area.quality_class}`
                        : ""}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Ingen area registrerad – intensitet kan inte beräknas.
                  </p>
                )}
              </Section>

              {/* 4. Energy sources summary */}
              <Section
                icon={<Zap className="h-4 w-4" />}
                title="Energiförbrukning"
                subtitle={`${data.consumption.length} månadsrader · totalt ${formatKwh(totalKwh)}`}
              >
                {bySource.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Ingen energidata för {year}. Importera månadsförbrukning
                    först.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {bySource.map((s) => (
                      <div
                        key={s.name}
                        className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">{s.name}</div>
                          {s.estimated > 0 && (
                            <div className="text-xs text-amber-700">
                              {s.estimated} uppskattade månader
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 font-semibold tabular">
                          {formatKwh(s.kwh)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl border border-border py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary"
                  onClick={() => setShowRawMonths((v) => !v)}
                >
                  {showRawMonths ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" /> Dölj månadstabell
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" /> Visa månad för
                      månad
                    </>
                  )}
                </button>

                {showRawMonths && (
                  <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium">
                            Månad
                          </th>
                          <th className="px-2 py-1.5 text-left font-medium">
                            Energislag
                          </th>
                          <th className="px-2 py-1.5 text-right font-medium">
                            kWh
                          </th>
                          <th className="px-2 py-1.5 text-right font-medium">
                            PE-faktor
                          </th>
                          <th className="px-2 py-1.5 text-right font-medium">
                            Utsläpp
                          </th>
                          <th className="px-2 py-1.5 text-center font-medium">
                            Typ
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.consumption.map((c) => (
                          <tr
                            key={c.id}
                            className={cn(
                              "border-t border-border",
                              c.is_estimated && "bg-amber-50/60"
                            )}
                          >
                            <td className="px-2 py-1">
                              {MONTH_SV[c.month] ?? c.month}
                            </td>
                            <td className="max-w-[9rem] truncate px-2 py-1">
                              {c.energy_source_name}
                            </td>
                            <td className="px-2 py-1 text-right tabular">
                              {formatNumber(c.consumption_kwh, 0)}
                            </td>
                            <td className="px-2 py-1 text-right tabular">
                              {formatNumber(c.primary_energy_factor, 2)}
                            </td>
                            <td className="px-2 py-1 text-right tabular">
                              {formatNumber(
                                c.emission_factor_kg_co2e_per_kwh,
                                3
                              )}
                            </td>
                            <td className="px-2 py-1 text-center">
                              {c.is_estimated ? (
                                <Badge variant="warning">Uppsk.</Badge>
                              ) : (
                                <Badge variant="outline">Mätt</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      PE-faktor = primärenergifaktor · Utsläpp = kg CO₂e per kWh
                      · Q-klass i källa:{" "}
                      {data.consumption[0]
                        ? QUALITY_SV[data.consumption[0].quality_class] ??
                          data.consumption[0].quality_class
                        : "—"}
                    </div>
                  </div>
                )}
              </Section>

              {/* 5. Climate optional */}
              {data.climate.length > 0 && (
                <Section
                  icon={<Thermometer className="h-4 w-4" />}
                  title="Klimatdata (graddagar)"
                  subtitle={
                    data.building.municipality
                      ? `Används vid väderkorrigering · ${data.building.municipality}`
                      : "Används vid väderkorrigering"
                  }
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-1 rounded-xl border border-border py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary"
                    onClick={() => setShowClimate((v) => !v)}
                  >
                    {showClimate ? (
                      <>
                        <ChevronUp className="h-3.5 w-3.5" /> Dölj graddagar
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3.5 w-3.5" /> Visa
                        månadsgraddagar
                      </>
                    )}
                  </button>
                  {showClimate && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {data.climate
                        .filter((c) => c.month != null)
                        .map((c) => (
                          <div
                            key={c.month}
                            className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs"
                            title={c.source}
                          >
                            <span className="text-muted-foreground">
                              {MONTH_SV[c.month!] ?? `M${c.month}`}
                            </span>{" "}
                            <span className="tabular font-medium">
                              {formatNumber(c.heating_degree_days, 0)}
                            </span>{" "}
                            HDD
                          </div>
                        ))}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    HDD = heating degree days (graddagar för uppvärmning).
                    Saknas värde för en månad visas ingen siffra.
                  </p>
                </Section>
              )}

              <p className="text-center text-xs text-muted-foreground">
                Behöver du rätta en siffra? Använd{" "}
                <span className="font-medium">Dataredigering</span> eller
                importera ny fil – ändringar loggas i ändringshistoriken.
              </p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-primary">{icon}</span>
          {title}
        </div>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-secondary/50 px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular">{value}</div>
      {hint && (
        <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

function FormulaStep({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
        {n}
      </span>
      <div>
        <div className="font-medium">{title}</div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>
    </li>
  );
}

function Banner({
  tone,
  icon,
  title,
  body,
}: {
  tone: "amber" | "red";
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-2 rounded-2xl border px-4 py-3 text-sm",
        tone === "amber" && "border-amber-200 bg-amber-50 text-amber-950",
        tone === "red" && "border-red-200 bg-red-50 text-red-900"
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <div className="font-medium">{title}</div>
        <p className="mt-0.5 text-xs leading-relaxed opacity-90">{body}</p>
      </div>
    </div>
  );
}
