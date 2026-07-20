"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getCrremChartData,
  listCrremBuildings,
} from "@/app/actions/compliance";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataGapBadge } from "@/components/energy/data-gap-badge";
import { HelpTip } from "@/components/ui/help-tip";
import { formatNumber } from "@/lib/utils";
import type { DataGapStatus } from "@/lib/supabase/database.types";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Thermometer, Building2, AlertTriangle } from "lucide-react";
import { PropertyFilter } from "@/components/filters/property-filter";

export function CrremView({
  initialBuildingId,
  initialYear,
}: {
  initialBuildingId?: string;
  initialYear?: number;
}) {
  const [year, setYear] = useState(
    initialYear ?? new Date().getFullYear() - 1
  );
  const [propertyId, setPropertyId] = useState("");
  const [buildingId, setBuildingId] = useState<string | undefined>(
    initialBuildingId
  );
  const [crremVersion, setCrremVersion] = useState<string | undefined>();

  const buildingsQ = useQuery({
    queryKey: ["crrem-buildings", year],
    queryFn: async () => {
      const res = await listCrremBuildings(year);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const buildings = useMemo(() => {
    const list = buildingsQ.data ?? [];
    if (!propertyId) return list;
    return list.filter((b) => b.property_id === propertyId);
  }, [buildingsQ.data, propertyId]);

  // Auto-select first building in filtered set
  const effectiveBuildingId =
    buildingId && buildings.some((b) => b.building_id === buildingId)
      ? buildingId
      : buildings[0]?.building_id;

  const chartQ = useQuery({
    queryKey: ["crrem-chart", effectiveBuildingId, year, crremVersion],
    enabled: Boolean(effectiveBuildingId),
    queryFn: async () => {
      const res = await getCrremChartData({
        building_id: effectiveBuildingId!,
        year,
        crrem_version: crremVersion,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const chartData = useMemo(() => {
    const series = chartQ.data?.series ?? [];
    return series.map((p) => ({
      year: p.year,
      target: p.target_ghg,
      actual: p.actual_ghg,
    }));
  }, [chartQ.data?.series]);

  const stranding =
    chartQ.data?.stranding_year ?? chartQ.data?.stranding_year_stored;

  return (
    <div className="page-shell">
      <div className="page-inner">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Thermometer className="h-6 w-6 text-primary" />
              <h1 className="page-title">Klimatrisk (CRREM)</h1>
              <HelpTip text="CRREM-pathway visar när utsläppsintensiteten riskerar att överskrida 1,5°C-målet. Prioritera byggnader med tidigast riskår." />
            </div>
            <p className="page-subtitle">
              När utsläppen riskerar att bli för höga – prioritera tidigast
              riskår. Filtrera på fastighet för att fokusera.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PropertyFilter
              value={propertyId}
              onChange={(id) => {
                setPropertyId(id);
                setBuildingId(undefined);
              }}
            />
          </div>
        </div>

        {/* Filters + KPIs */}
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">År</label>
            <Select
              value={String(year)}
              onValueChange={(v) => {
                setYear(Number(v));
                setBuildingId(undefined);
                setCrremVersion(undefined);
              }}
            >
              <SelectTrigger className="w-28">
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

          <div className="min-w-[14rem] flex-1 space-y-1.5">
            <label className="text-sm text-muted-foreground">Byggnad</label>
            <Select
              value={effectiveBuildingId ?? ""}
              onValueChange={(v) => {
                setBuildingId(v);
                setCrremVersion(undefined);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Välj byggnad" />
              </SelectTrigger>
              <SelectContent>
                {buildings.map((b) => (
                  <SelectItem key={b.building_id} value={b.building_id}>
                    {b.building_name} · {b.property_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">
              CRREM-version
            </label>
            <Select
              value={
                crremVersion ??
                chartQ.data?.crrem_version ??
                chartQ.data?.available_versions[0] ??
                ""
              }
              onValueChange={setCrremVersion}
              disabled={!chartQ.data?.available_versions.length}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="CRREM version" />
              </SelectTrigger>
              <SelectContent>
                {(chartQ.data?.available_versions ?? []).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {chartQ.data && (
            <div className="ml-auto flex flex-wrap items-center gap-4">
              <div className="text-sm">
                <span className="text-muted-foreground">Utsläpp </span>
                <span className="tabular font-semibold text-foreground">
                  {formatNumber(chartQ.data.ghg_intensity, 2)}
                </span>
                <span className="text-muted-foreground"> kg CO₂e/m²</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Riskår </span>
                <span
                  className={`tabular font-semibold ${
                    stranding ? "text-amber-600" : "text-foreground"
                  }`}
                >
                  {stranding ?? "—"}
                </span>
              </div>
              <DataGapBadge
                status={chartQ.data.data_gap_status as DataGapStatus | null}
                completeness={chartQ.data.data_completeness_percent}
              />
            </div>
          )}
        </div>

        {buildingsQ.isLoading && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Laddar byggnader…
          </div>
        )}

        {buildingsQ.error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {(buildingsQ.error as Error).message}
          </div>
        )}

        {!buildingsQ.isLoading &&
          !buildingsQ.error &&
          (buildingsQ.data?.length ?? 0) === 0 && (
            <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
              <Building2 className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-3 text-lg font-semibold">
                Inga byggnader med CRREM-data
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Importera energidata och beräkna prestanda för att se
                klimatrisk-pathways.
              </p>
            </div>
          )}

        {/* Chart card */}
        {effectiveBuildingId && (
          <div className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {chartQ.data?.building_name ?? "Välj byggnad"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Mål vs faktisk utsläppsintensitet
                </p>
              </div>
              <span className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {chartQ.data?.crrem_version ?? "—"}
              </span>
            </div>

            <div className="h-[min(420px,55vh)] min-h-[280px] p-4 sm:p-5">
              {chartQ.isLoading && (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Laddar klimatriskgraf…
                </div>
              )}
              {chartQ.error && (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-red-700">
                  <AlertTriangle className="h-8 w-8 text-red-400" />
                  {(chartQ.error as Error).message}
                </div>
              )}
              {chartQ.data && chartData.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 12, right: 20, left: 4, bottom: 8 }}
                  >
                    <CartesianGrid
                      stroke="#e2e8f0"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="year"
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                      label={{
                        value: "kgCO₂e/m²",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#64748b",
                        fontSize: 11,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        fontSize: 12,
                        boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
                        color: "#0f172a",
                      }}
                      labelStyle={{ color: "#64748b", marginBottom: 4 }}
                      formatter={(v, name) => [
                        formatNumber(Number(v ?? 0), 3),
                        name === "target" ? "CRREM target" : "Aktuell GHG",
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12, color: "#64748b" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="target"
                      name="CRREM target"
                      stroke="#4f46e5"
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      name="Aktuell GHG (statisk)"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      strokeDasharray="6 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                    {stranding != null && (
                      <ReferenceLine
                        x={stranding}
                        stroke="#ef4444"
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        label={{
                          value: `Stranding ${stranding}`,
                          position: "insideTopRight",
                          fill: "#ef4444",
                          fontSize: 11,
                        }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
              {chartQ.data && chartData.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground/40" />
                  Ingen pathway-data för vald version
                </div>
              )}
            </div>

            {/* Pathway table */}
            {chartQ.data && chartQ.data.pathway.length > 0 && (
              <div className="max-h-36 overflow-auto border-t border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-secondary/80 text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="px-4 py-2.5 text-left">År</th>
                      <th className="px-4 py-2.5 text-right">Target GHG</th>
                      <th className="px-4 py-2.5 text-right">Target energy</th>
                      <th className="px-4 py-2.5 text-right">vs aktuell</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartQ.data.pathway.map((p) => {
                      const delta =
                        chartQ.data!.ghg_intensity != null
                          ? chartQ.data!.ghg_intensity - p.intensity_target_ghg
                          : null;
                      return (
                        <tr
                          key={p.target_year}
                          className={`border-t border-border/60 ${
                            stranding === p.target_year
                              ? "bg-red-50"
                              : "hover:bg-secondary/40"
                          }`}
                        >
                          <td className="px-4 py-1.5 tabular">{p.target_year}</td>
                          <td className="px-4 py-1.5 text-right tabular">
                            {formatNumber(p.intensity_target_ghg, 2)}
                          </td>
                          <td className="px-4 py-1.5 text-right tabular text-muted-foreground">
                            {formatNumber(p.intensity_target_energy, 1)}
                          </td>
                          <td
                            className={`px-4 py-1.5 text-right tabular font-medium ${
                              delta != null && delta > 0
                                ? "text-red-600"
                                : "text-emerald-600"
                            }`}
                          >
                            {delta != null
                              ? `${delta > 0 ? "+" : ""}${formatNumber(delta, 2)}`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
