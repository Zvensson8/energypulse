"use client";

import Link from "next/link";
import type { TopRiskRow } from "@/app/actions/dashboard";
import { DataGapBadge } from "@/components/energy/data-gap-badge";
import { EnergyClassBadge } from "@/components/energy/energy-class-badge";
import { HelpTip } from "@/components/ui/help-tip";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TERMS } from "@/lib/labels";
import { formatNumber } from "@/lib/utils";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";

export function TopRiskLists({
  stranded,
  mepsGap,
}: {
  stranded: TopRiskRow[];
  mepsGap: TopRiskRow[];
}) {
  const chartData = mepsGap.slice(0, 8).map((r) => ({
    name: r.building_name.slice(0, 12),
    gap: r.meps_2030_gap ?? 0,
    incomplete: r.data_gap_status === "INCOMPLETE_DATA",
  }));

  return (
    <div className="grid h-full grid-cols-1 gap-1.5 md:grid-cols-2">
      {/* Klimatrisk / stranded */}
      <div className="panel flex flex-col rounded-md">
        <div className="panel-header !normal-case !tracking-normal">
          <span className="inline-flex items-center gap-1">
            Prioritet: klimatrisk
            <HelpTip text={TERMS.strandingYear.help} />
          </span>
          <span className="font-normal text-terminal-muted">
            tidigast riskår först
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-terminal-row text-2xs text-terminal-muted">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Byggnad</th>
                <th className="px-2 py-1.5 text-center font-medium">Klass</th>
                <th className="px-2 py-1.5 text-right font-medium">Riskår</th>
                <th className="px-2 py-1.5 text-left font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {stranded.map((r) => (
                <tr
                  key={r.building_id}
                  className="border-t border-terminal-border/50 hover:bg-terminal-row/60"
                >
                  <td className="max-w-[9rem] truncate px-2 py-1">
                    <Link
                      href={`/buildings?building=${r.building_id}`}
                      className="font-medium hover:text-terminal-accent"
                    >
                      {r.building_name}
                    </Link>
                  </td>
                  <td className="px-2 py-1 text-center">
                    <EnergyClassBadge value={r.energy_class} />
                  </td>
                  <td className="px-2 py-1 text-right tabular text-gap-extrapolated">
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href={`/crrem?building=${r.building_id}&year=${r.year}`}
                          className="border-b border-dotted border-terminal-muted/50 hover:text-terminal-accent"
                        >
                          {r.crrem_stranding_year}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-2xs">
                        <div className="font-medium text-terminal-accent">
                          Klimatriskår (CRREM)
                        </div>
                        <div className="mt-1 text-terminal-muted">
                          {TERMS.strandingYear.help}
                        </div>
                        <div className="mt-1 text-terminal-muted">
                          Utsläpp: {formatNumber(r.ghg_intensity, 2)} kg
                          CO₂e/m²
                        </div>
                      </TooltipContent>
                    </UiTooltip>
                  </td>
                  <td className="px-2 py-1">
                    <DataGapBadge
                      status={r.data_gap_status}
                      completeness={r.data_completeness_percent}
                    />
                  </td>
                </tr>
              ))}
              {stranded.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    Inga byggnader med beräknat riskår för detta år.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MEPS gap */}
      <div className="panel flex flex-col rounded-md">
        <div className="panel-header !normal-case !tracking-normal">
          <span className="inline-flex items-center gap-1">
            Prioritet: kravgap 2030
            <HelpTip text={TERMS.mepsGap.help} />
          </span>
          <span className="font-normal text-terminal-muted">kWh/m² över krav</span>
        </div>
        <div className="h-28 border-b border-terminal-border px-1 pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="name"
                tick={{ fill: "#6b7685", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={36}
              />
              <YAxis
                tick={{ fill: "#6b7685", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                contentStyle={{
                  background: "#12161c",
                  border: "1px solid #1e2630",
                  fontSize: 11,
                  borderRadius: 6,
                }}
                formatter={(v) => [
                  `${formatNumber(Number(v ?? 0), 1)} kWh/m²`,
                  "Kravgap 2030",
                ]}
              />
              <Bar dataKey="gap" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.incomplete ? "#dc2626" : "#f97316"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-terminal-row text-2xs text-terminal-muted">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Byggnad</th>
                <th className="px-2 py-1.5 text-right font-medium">Gap 2030</th>
                <th className="px-2 py-1.5 text-right font-medium">kWh/m²</th>
                <th className="px-2 py-1.5 text-left font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {mepsGap.map((r) => (
                <tr
                  key={r.building_id}
                  className="border-t border-terminal-border/50 hover:bg-terminal-row/60"
                >
                  <td className="max-w-[9rem] truncate px-2 py-1">
                    <Link
                      href={`/buildings?building=${r.building_id}`}
                      className="font-medium hover:text-terminal-accent"
                    >
                      {r.building_name}
                    </Link>
                  </td>
                  <td className="px-2 py-1 text-right tabular text-gap-incomplete">
                    {formatNumber(r.meps_2030_gap, 1)}
                  </td>
                  <td className="px-2 py-1 text-right tabular">
                    {formatNumber(r.energy_intensity, 1)}
                  </td>
                  <td className="px-2 py-1">
                    <DataGapBadge
                      status={r.data_gap_status}
                      completeness={r.data_completeness_percent}
                    />
                  </td>
                </tr>
              ))}
              {mepsGap.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    Inga byggnader med kravgap för detta år.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
