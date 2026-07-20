"use client";

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
import { Button } from "@/components/ui/button";
import { formatIntensity, formatKwh, formatNumber } from "@/lib/utils";
import type { EnergyClass, DataGapStatus } from "@/lib/supabase/database.types";
import { AlertTriangle, History, ShieldAlert } from "lucide-react";

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden p-0">
        <div className="border-b border-border px-5 py-4 pr-12">
          <DialogHeader>
            <DialogTitle className="text-base">
              Provenance · {data?.building.name ?? "…"}
            </DialogTitle>
            <DialogDescription>
              {data?.building.property_name}
              {data?.building.municipality
                ? ` · ${data.building.municipality}`
                : ""}{" "}
              · år {year}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {onOpenAudit && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                onClick={onOpenAudit}
              >
                <History className="h-3 w-3" /> Audit
              </Button>
            )}
            {onOpenCrrem && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                onClick={onOpenCrrem}
              >
                CRREM
              </Button>
            )}
            {incomplete && onOpenOverride && (
              <Button
                size="sm"
                variant="destructive"
                className="h-7 gap-1 text-xs"
                onClick={onOpenOverride}
              >
                <ShieldAlert className="h-3 w-3" /> Override
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="max-h-[calc(85vh-5.5rem)] px-5 py-4">
          {isLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Laddar källdata…
            </div>
          )}
          {error && (
            <div className="py-4 text-sm text-destructive">
              {(error as Error).message}
            </div>
          )}
          {data && (
            <div className="space-y-4 pb-3">
              {/* Override banner */}
              {data.performance?.override_applied && (
                <div className="flex gap-2 rounded-xl border border-gap-incomplete/40 bg-gap-incomplete/10 p-3 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-gap-incomplete" />
                  <div>
                    <div className="font-medium text-gap-incomplete">
                      Override applicerad
                    </div>
                    <div className="text-xs text-muted-foreground">
                      reason: {data.performance.override_reason ?? "—"}
                    </div>
                  </div>
                </div>
              )}

              {/* Interpolation banner */}
              {data.estimated_row_count > 0 && (
                <div className="rounded-xl border border-gap-extrapolated/40 bg-gap-extrapolated/10 px-3 py-2 text-xs">
                  <span className="text-gap-extrapolated">
                    Interpolering:{" "}
                    {data.interpolation_method ??
                      "linear_previous_3m_seasonal_graddagar"}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {data.estimated_row_count} est / {data.measured_row_count}{" "}
                    mätt rader
                  </span>
                </div>
              )}

              {/* Performance summary */}
              <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="border-b border-border px-4 py-2.5 text-sm font-medium text-foreground">
                  Performance indicators
                </div>
                <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                  {[
                    [
                      "Intensitet",
                      formatIntensity(data.performance?.energy_intensity),
                    ],
                    [
                      "Primärenergital",
                      formatIntensity(
                        data.performance?.primary_energy_intensity
                      ),
                    ],
                    [
                      "GHG",
                      `${formatNumber(data.performance?.ghg_intensity, 3)} kg/m²`,
                    ],
                    [
                      "Klass",
                      <EnergyClassBadge
                        key="ec"
                        value={
                          data.performance?.energy_class as EnergyClass | null
                        }
                      />,
                    ],
                    [
                      "MEPS 2030 gap",
                      formatNumber(data.performance?.meps_2030_gap, 1),
                    ],
                    [
                      "Stranding",
                      data.performance?.crrem_stranding_year ?? "—",
                    ],
                    [
                      "CRREM ver",
                      data.performance?.crrem_version_used ?? "—",
                    ],
                    [
                      "Gap-status",
                      <DataGapBadge
                        key="gap"
                        status={
                          data.performance
                            ?.data_gap_status as DataGapStatus | null
                        }
                        completeness={
                          data.performance?.data_completeness_percent
                        }
                      />,
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="bg-card px-3 py-2.5"
                    >
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {label}
                      </div>
                      <div className="mt-0.5 tabular text-sm text-foreground">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Formulas */}
              <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="border-b border-border px-4 py-2.5 text-sm font-medium text-foreground">
                  Exakta formler
                </div>
                <div className="space-y-1.5 p-4 text-xs">
                  {Object.entries(data.formulas).map(([k, v]) => (
                    <div key={k} className="text-foreground">
                      <span className="font-medium text-primary">{k}:</span>{" "}
                      <span className="text-muted-foreground">{v}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Area version */}
              <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="border-b border-border px-4 py-2.5 text-sm font-medium text-foreground">
                  Area-version
                </div>
                {data.area ? (
                  <div className="grid grid-cols-1 gap-2 p-4 text-sm sm:grid-cols-3">
                    <div>
                      <span className="text-muted-foreground">a_temp </span>
                      {formatNumber(data.area.a_temp, 1)} m²
                    </div>
                    <div>
                      <span className="text-muted-foreground">valid </span>
                      {data.area.valid_from} → {data.area.valid_to ?? "∞"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">source </span>
                      {data.area.source ?? "—"} · Q{data.area.quality_class}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-sm text-muted-foreground">
                    Ingen area-version
                  </div>
                )}
              </section>

              {/* Consumption rows */}
              <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="border-b border-border px-4 py-2.5 text-sm font-medium text-foreground">
                  energy_consumption ({data.consumption.length} rader
                  {data.estimated_row_count > 0
                    ? ` · ${data.estimated_row_count} interpolerade`
                    : ""}
                  )
                </div>
                <div className="max-h-56 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/50 text-[11px] uppercase text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Mån</th>
                        <th className="px-2 py-1.5 text-left font-medium">Källa</th>
                        <th className="px-2 py-1.5 text-right font-medium">kWh</th>
                        <th className="px-2 py-1.5 text-right font-medium">PEF</th>
                        <th className="px-2 py-1.5 text-right font-medium">EF</th>
                        <th className="px-2 py-1.5 text-center font-medium">Est.</th>
                        <th className="px-2 py-1.5 text-center font-medium">Q</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.consumption.map((c) => (
                        <tr
                          key={c.id}
                          className={`border-t border-border hover:bg-muted/40 ${
                            c.is_estimated ? "bg-gap-extrapolated/5" : ""
                          }`}
                        >
                          <td className="px-2 py-1">{c.month}</td>
                          <td className="max-w-[10rem] truncate px-2 py-1">
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
                              4
                            )}
                          </td>
                          <td className="px-2 py-1 text-center">
                            {c.is_estimated ? (
                              <span
                                className="text-gap-extrapolated"
                                title={
                                  data.interpolation_method ??
                                  "interpolerad"
                                }
                              >
                                Y
                              </span>
                            ) : (
                              "N"
                            )}
                          </td>
                          <td className="px-2 py-1 text-center">
                            {c.quality_class}
                          </td>
                        </tr>
                      ))}
                      {data.consumption.length === 0 && (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-3 py-4 text-center text-muted-foreground"
                          >
                            Ingen consumption för året
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                  Σ kWh ={" "}
                  {formatKwh(
                    data.consumption.reduce(
                      (s, c) => s + c.consumption_kwh,
                      0
                    )
                  )}
                  {data.interpolation_method && (
                    <span className="ml-2 text-gap-extrapolated">
                      · metod {data.interpolation_method}
                    </span>
                  )}
                </div>
              </section>

              {/* Climate */}
              {data.climate.length > 0 && (
                <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  <div className="border-b border-border px-4 py-2.5 text-sm font-medium text-foreground">
                    climate_data · {data.building.municipality}
                  </div>
                  <div className="flex flex-wrap gap-1.5 p-4">
                    {data.climate
                      .filter((c) => c.month != null)
                      .map((c) => (
                        <div
                          key={c.month}
                          className="rounded-lg border border-border bg-muted/40 px-2 py-1 text-xs"
                          title={c.source}
                        >
                          <span className="text-muted-foreground">
                            M{c.month}
                          </span>{" "}
                          HDD {formatNumber(c.heating_degree_days, 0)}
                        </div>
                      ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
