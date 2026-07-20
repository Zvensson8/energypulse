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
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            {TERMS.dataQuality.label}
            <HelpTip text={TERMS.dataQuality.help} />
          </div>
          <p className="text-xs text-muted-foreground">
            snitt {kpis.avgDataCompleteness?.toFixed(0) ?? "—"} %
          </p>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center gap-4 p-4">
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
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  fontSize: 12,
                  borderRadius: 12,
                  boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
                  color: "hsl(var(--foreground))",
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
              <span className="text-[10px] text-muted-foreground">
                byggnader
              </span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2.5 text-sm">
          {data.map((d) => (
            <div key={d.name} className="flex items-start gap-2.5">
              <span
                className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: d.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-foreground">{d.name}</span>
                  <span className="tabular text-foreground">{d.value}</span>
                </div>
                <div className="text-xs text-muted-foreground">{d.hint}</div>
              </div>
            </div>
          ))}
          {data.length === 0 && (
            <span className="text-sm text-muted-foreground">
              Ingen beräknad data ännu. Importera energivärden och beräkna
              prestanda.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
