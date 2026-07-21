"use client";

import type { YoYDelta } from "@/app/actions/dashboard";
import { formatKwh, formatNumber, formatIntensity } from "@/lib/utils";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

function Delta({
  pct,
  invert = false,
}: {
  pct: number | null;
  /** true = lower is better (energy, intensity, risk counts) */
  invert?: boolean;
}) {
  if (pct == null || Number.isNaN(pct)) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> —
      </span>
    );
  }
  const improved = invert ? pct < 0 : pct > 0;
  const worsened = invert ? pct > 0 : pct < 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular",
        improved && "text-emerald-600",
        worsened && "text-red-600",
        !improved && !worsened && "text-muted-foreground"
      )}
    >
      {pct < 0 ? (
        <TrendingDown className="h-3 w-3" />
      ) : pct > 0 ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <Minus className="h-3 w-3" />
      )}
      {pct > 0 ? "+" : ""}
      {formatNumber(pct, 1)} %
    </span>
  );
}

export function YoyStrip({ data }: { data: YoYDelta }) {
  const cells = [
    {
      label: "Total energi",
      value: formatKwh(data.totalEnergyKwh),
      prev: formatKwh(data.prevTotalEnergyKwh),
      pct: data.energyDeltaPct,
      invert: true,
    },
    {
      label: "Snitt kWh/m²",
      value: formatIntensity(data.avgIntensity),
      prev: formatIntensity(data.prevAvgIntensity),
      pct: data.intensityDeltaPct,
      invert: true,
    },
    {
      label: "Kravrisk 2030",
      value: String(data.mepsRiskCount),
      prev: String(data.prevMepsRiskCount),
      pct:
        data.prevMepsRiskCount > 0
          ? ((data.mepsRiskCount - data.prevMepsRiskCount) /
              data.prevMepsRiskCount) *
            100
          : data.mepsRiskCount > 0
            ? 100
            : 0,
      invert: true,
    },
    {
      label: "Saknad data",
      value: String(data.incompleteCount),
      prev: String(data.prevIncompleteCount),
      pct:
        data.prevIncompleteCount > 0
          ? ((data.incompleteCount - data.prevIncompleteCount) /
              data.prevIncompleteCount) *
            100
          : data.incompleteCount > 0
            ? 100
            : 0,
      invert: true,
    },
  ];

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">
          År mot år · {data.prevYear} → {data.year}
        </h2>
        <p className="text-xs text-muted-foreground">
          Jämför prestanda och risk mellan två år (
          {data.buildingCount} vs {data.prevBuildingCount} beräknade hus).
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cells.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-border bg-secondary/30 px-3 py-2.5"
          >
            <div className="text-[11px] text-muted-foreground">{c.label}</div>
            <div className="mt-0.5 text-lg font-semibold tabular">{c.value}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Delta pct={c.pct} invert={c.invert} />
              <span className="text-[10px] text-muted-foreground">
                förra: {c.prev}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
