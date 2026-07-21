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
    <div className="grid h-full grid-cols-1 gap-3 md:grid-cols-2">
      {/* Klimatrisk / stranded */}
      <div className="flex flex-col rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
              Prioritet: klimatrisk
              <HelpTip text={TERMS.strandingYear.help} />
            </div>
            <p className="text-xs text-muted-foreground">
              tidigast riskår först
            </p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-secondary/80 text-xs text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Byggnad</th>
                <th className="px-3 py-2 text-center font-medium">Klass</th>
                <th className="px-3 py-2 text-right font-medium">Riskår</th>
                <th className="px-3 py-2 text-left font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {stranded.map((r) => (
                <tr
                  key={r.building_id}
                  className="border-t border-border/60 transition hover:bg-secondary/60"
                >
                  <td className="max-w-[9rem] truncate px-3 py-2">
                    <Link
                      href={`/buildings/${r.building_id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {r.building_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <EnergyClassBadge value={r.energy_class} />
                  </td>
                  <td className="px-3 py-2 text-right tabular text-gap-extrapolated">
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href={`/crrem?building=${r.building_id}&year=${r.year}`}
                          className="border-b border-dotted border-muted-foreground/40 hover:text-primary"
                        >
                          {r.crrem_stranding_year}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        <div className="font-medium text-primary">
                          Klimatriskår (CRREM)
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          {TERMS.strandingYear.help}
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          Utsläpp: {formatNumber(r.ghg_intensity, 2)} kg
                          CO₂e/m²
                        </div>
                      </TooltipContent>
                    </UiTooltip>
                  </td>
                  <td className="px-3 py-2">
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
                    className="px-3 py-8 text-center text-sm text-muted-foreground"
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
      <div className="flex flex-col rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
              Prioritet: kravgap 2030
              <HelpTip text={TERMS.mepsGap.help} />
            </div>
            <p className="text-xs text-muted-foreground">kWh/m² över krav</p>
          </div>
        </div>
        <div className="h-28 border-b border-border px-2 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="name"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={36}
              />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  fontSize: 12,
                  borderRadius: 12,
                  boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
                  color: "hsl(var(--foreground))",
                }}
                formatter={(v) => [
                  `${formatNumber(Number(v ?? 0), 1)} kWh/m²`,
                  "Kravgap 2030",
                ]}
              />
              <Bar dataKey="gap" radius={[4, 4, 0, 0]}>
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
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-secondary/80 text-xs text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Byggnad</th>
                <th className="px-3 py-2 text-right font-medium">Gap 2030</th>
                <th className="px-3 py-2 text-right font-medium">kWh/m²</th>
                <th className="px-3 py-2 text-left font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {mepsGap.map((r) => (
                <tr
                  key={r.building_id}
                  className="border-t border-border/60 transition hover:bg-secondary/60"
                >
                  <td className="max-w-[9rem] truncate px-3 py-2">
                    <Link
                      href={`/buildings/${r.building_id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {r.building_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular text-gap-incomplete">
                    {formatNumber(r.meps_2030_gap, 1)}
                  </td>
                  <td className="px-3 py-2 text-right tabular">
                    {formatNumber(r.energy_intensity, 1)}
                  </td>
                  <td className="px-3 py-2">
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
                    className="px-3 py-8 text-center text-sm text-muted-foreground"
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
