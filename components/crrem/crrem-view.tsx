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

  // Auto-select first building
  const effectiveBuildingId =
    buildingId ?? buildingsQ.data?.[0]?.building_id;

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
    <div className="flex h-full flex-col gap-1.5 p-2">
      <div className="panel flex flex-wrap items-center gap-2 rounded-md px-3 py-2">
        <div>
          <h1 className="text-sm font-semibold text-foreground">
            Klimatrisk (CRREM)
          </h1>
          <p className="text-2xs text-terminal-muted">
            När utsläppen riskerar att bli för höga – prioritera tidigast riskår
          </p>
        </div>

        <Select
          value={String(year)}
          onValueChange={(v) => {
            setYear(Number(v));
            setBuildingId(undefined);
            setCrremVersion(undefined);
          }}
        >
          <SelectTrigger className="h-6 w-20">
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

        <Select
          value={effectiveBuildingId ?? ""}
          onValueChange={(v) => {
            setBuildingId(v);
            setCrremVersion(undefined);
          }}
        >
          <SelectTrigger className="h-6 w-56">
            <SelectValue placeholder="Välj byggnad" />
          </SelectTrigger>
          <SelectContent>
            {(buildingsQ.data ?? []).map((b) => (
              <SelectItem key={b.building_id} value={b.building_id}>
                {b.building_name} · {b.property_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
          <SelectTrigger className="h-6 w-36">
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

        {chartQ.data && (
          <div className="ml-auto flex flex-wrap items-center gap-3 text-xs">
            <span className="text-terminal-muted">
              Utsläpp{" "}
              <span className="tabular font-medium text-foreground">
                {formatNumber(chartQ.data.ghg_intensity, 2)}
              </span>{" "}
              kg CO₂e/m²
            </span>
            <span
              className={
                stranding
                  ? "text-gap-extrapolated"
                  : "text-terminal-muted"
              }
            >
              Riskår{" "}
              <span className="font-semibold tabular">
                {stranding ?? "—"}
              </span>
            </span>
            <DataGapBadge
              status={chartQ.data.data_gap_status as DataGapStatus | null}
              completeness={chartQ.data.data_completeness_percent}
            />
          </div>
        )}
      </div>

      <div className="panel flex min-h-0 flex-1 flex-col rounded-md">
        <div className="panel-header !normal-case !tracking-normal">
          <span>
            {chartQ.data?.building_name ?? "Välj byggnad"} · mål vs faktisk
            utsläppsintensitet
          </span>
          <span className="font-normal text-terminal-muted">
            {chartQ.data?.crrem_version ?? "—"}
          </span>
        </div>

        <div className="min-h-0 flex-1 p-2">
          {chartQ.isLoading && (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Laddar klimatriskgraf…
            </div>
          )}
          {chartQ.error && (
            <div className="p-2 text-table text-destructive">
              {(chartQ.error as Error).message}
            </div>
          )}
          {chartQ.data && chartData.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid
                  stroke="#1e2630"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="year"
                  tick={{ fill: "#6b7685", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "#6b7685", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  label={{
                    value: "kgCO₂e/m²",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#6b7685",
                    fontSize: 10,
                  }}
                />
                <Tooltip
                  contentStyle={{
                    background: "#12161c",
                    border: "1px solid #1e2630",
                    fontSize: 11,
                    fontFamily: "ui-monospace, monospace",
                  }}
                  formatter={(v, name) => [
                    formatNumber(Number(v ?? 0), 3),
                    name === "target" ? "CRREM target" : "Aktuell GHG",
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "#6b7685" }}
                />
                <Line
                  type="monotone"
                  dataKey="target"
                  name="CRREM target"
                  stroke="#3b9eff"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Aktuell GHG (statisk)"
                  stroke="#f97316"
                  strokeWidth={2}
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
            <div className="flex h-full items-center justify-center text-table text-muted-foreground">
              Ingen pathway-data för vald version
            </div>
          )}
        </div>

        {/* Pathway table */}
        {chartQ.data && chartQ.data.pathway.length > 0 && (
          <div className="max-h-28 overflow-auto border-t border-terminal-border">
            <table className="w-full text-table font-mono">
              <thead className="sticky top-0 bg-terminal-row text-2xs uppercase text-terminal-muted">
                <tr>
                  <th className="px-2 py-1 text-left">År</th>
                  <th className="px-2 py-1 text-right">Target GHG</th>
                  <th className="px-2 py-1 text-right">Target energy</th>
                  <th className="px-2 py-1 text-right">vs aktuell</th>
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
                      className={`border-t border-terminal-border/50 ${
                        stranding === p.target_year
                          ? "bg-gap-incomplete/10"
                          : ""
                      }`}
                    >
                      <td className="px-2 py-0.5">{p.target_year}</td>
                      <td className="px-2 py-0.5 text-right tabular">
                        {formatNumber(p.intensity_target_ghg, 2)}
                      </td>
                      <td className="px-2 py-0.5 text-right tabular text-terminal-muted">
                        {formatNumber(p.intensity_target_energy, 1)}
                      </td>
                      <td
                        className={`px-2 py-0.5 text-right tabular ${
                          delta != null && delta > 0
                            ? "text-gap-incomplete"
                            : "text-gap-complete"
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
    </div>
  );
}
