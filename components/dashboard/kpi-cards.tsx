"use client";

import type { DashboardKpis } from "@/app/actions/dashboard";
import {
  formatKwh,
  formatNumber,
  formatPercent,
  formatIntensity,
} from "@/lib/utils";
import { HelpTip } from "@/components/ui/help-tip";
import { TERMS } from "@/lib/labels";
import {
  AlertTriangle,
  Flame,
  Gauge,
  PiggyBank,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";

export function KpiCards({ kpis }: { kpis: DashboardKpis }) {
  const cards = [
    {
      key: "energy",
      label: TERMS.totalEnergy.label,
      help: TERMS.totalEnergy.help,
      value: formatKwh(kpis.totalEnergyKwh),
      sub: `År ${kpis.year} · ${kpis.buildingCount} byggnader`,
      icon: Flame,
      accent: "text-terminal-accent",
    },
    {
      key: "intensity",
      label: TERMS.intensity.label,
      help: TERMS.intensity.help,
      value: formatIntensity(kpis.avgEnergyIntensity),
      sub: "Snitt för portföljen",
      icon: Gauge,
      accent: "text-terminal-text",
    },
    {
      key: "meps",
      label: TERMS.mepsRisk.label,
      help: TERMS.mepsRisk.help,
      value: String(kpis.mepsRiskCount),
      sub: "byggnader över kravet",
      icon: ShieldAlert,
      accent:
        kpis.mepsRiskCount > 0
          ? "text-gap-incomplete"
          : "text-gap-complete",
    },
    {
      key: "stranded",
      label: TERMS.stranded.label,
      help: TERMS.stranded.help,
      value: String(kpis.strandedCount),
      sub: "inom ca 10 år (CRREM)",
      icon: AlertTriangle,
      accent:
        kpis.strandedCount > 0
          ? "text-gap-extrapolated"
          : "text-gap-complete",
    },
    {
      key: "invest",
      label: TERMS.investment.label,
      help: TERMS.investment.help,
      value: `${formatNumber(kpis.investmentNeedSek / 1e6, 1)} Mkr`,
      sub: `sparpotential ${formatKwh(kpis.estimatedSavingKwh)}/år`,
      icon: PiggyBank,
      accent: "text-terminal-green",
    },
    {
      key: "quality",
      label: TERMS.dataQuality.label,
      help: TERMS.dataQuality.help,
      value: formatPercent(kpis.avgDataCompleteness),
      sub: `Komplett ${kpis.completeCount} · Uppskattad ${kpis.extrapolatedCount} · Saknas ${kpis.incompleteCount}`,
      icon: CheckCircle2,
      accent:
        (kpis.avgDataCompleteness ?? 0) >= 90
          ? "text-gap-complete"
          : (kpis.avgDataCompleteness ?? 0) >= 70
            ? "text-gap-extrapolated"
            : "text-gap-incomplete",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.key}
            className="panel flex min-h-[5rem] flex-col justify-between rounded-md p-2.5"
          >
            <div className="flex items-start justify-between gap-1">
              <span className="text-2xs font-medium leading-tight text-terminal-muted">
                {c.label}
              </span>
              <div className="flex items-center gap-0.5">
                <HelpTip text={c.help} label={`Om ${c.label}`} />
                <Icon className={`h-3.5 w-3.5 ${c.accent}`} />
              </div>
            </div>
            <div
              className={`mt-1 text-lg font-semibold tabular leading-none tracking-tight ${c.accent}`}
            >
              {c.value}
            </div>
            <div className="mt-1 truncate text-2xs text-terminal-muted">
              {c.sub}
            </div>
          </div>
        );
      })}
    </div>
  );
}
