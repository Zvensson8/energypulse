"use client";

import type { DashboardKpis } from "@/app/actions/dashboard";
import { HelpTip } from "@/components/ui/help-tip";
import { TERMS } from "@/lib/labels";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export function DataGapChart({ kpis }: { kpis: DashboardKpis }) {
  const data = [
    {
      name: "Komplett",
      value: kpis.completeCount,
      color: "#16a34a",
      hint: "Alla månader har mätvärden",
    },
    {
      name: "Uppskattad",
      value: kpis.extrapolatedCount,
      color: "#eab308",
      hint: "Saknade månader ifyllda",
    },
    {
      name: "Ofullständig",
      value: kpis.incompleteCount,
      color: "#dc2626",
      hint: "För mycket data saknas",
    },
  ].filter((d) => d.value > 0);

  const total =
    kpis.completeCount + kpis.extrapolatedCount + kpis.incompleteCount;

  return (
    <div className="panel flex h-full flex-col rounded-md">
      <div className="panel-header !normal-case !tracking-normal">
        <span className="inline-flex items-center gap-1">
          {TERMS.dataQuality.label}
          <HelpTip text={TERMS.dataQuality.help} />
        </span>
        <span className="font-normal text-terminal-muted">
          snitt {kpis.avgDataCompleteness?.toFixed(0) ?? "—"} %
        </span>
      </div>
      <div className="flex min-h-0 flex-1 items-center gap-3 p-3">
        <div className="relative h-32 w-32 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={34}
                outerRadius={52}
                paddingAngle={2}
                stroke="none"
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#12161c",
                  border: "1px solid #1e2630",
                  fontSize: 11,
                  borderRadius: 6,
                }}
                formatter={(v, name) => [`${v} byggnader`, String(name)]}
              />
            </PieChart>
          </ResponsiveContainer>
          {total > 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-base font-semibold tabular text-foreground">
                {total}
              </span>
              <span className="text-[10px] text-terminal-muted">byggnader</span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2 text-xs">
          {data.map((d) => (
            <div key={d.name} className="flex items-start gap-2">
              <span
                className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: d.color }}
              />
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-foreground">{d.name}</span>
                  <span className="tabular text-foreground">{d.value}</span>
                </div>
                <div className="text-2xs text-terminal-muted">{d.hint}</div>
              </div>
            </div>
          ))}
          {data.length === 0 && (
            <span className="text-muted-foreground">
              Ingen beräknad data ännu. Importera energivärden och beräkna
              prestanda.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
