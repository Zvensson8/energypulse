"use client";

import Link from "next/link";
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
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function KpiCards({ kpis }: { kpis: DashboardKpis }) {
  const cards = [
    {
      key: "energy",
      label: TERMS.totalEnergy.label,
      help: TERMS.totalEnergy.help,
      value: formatKwh(kpis.totalEnergyKwh),
      sub: `År ${kpis.year} · ${kpis.buildingCount} byggnader`,
      icon: Flame,
      tone: "text-indigo-600 bg-indigo-50",
      href: "/buildings",
    },
    {
      key: "intensity",
      label: TERMS.intensity.label,
      help: TERMS.intensity.help,
      value: formatIntensity(kpis.avgEnergyIntensity),
      sub: "Snitt för portföljen",
      icon: Gauge,
      tone: "text-slate-700 bg-slate-100",
      href: "/buildings",
    },
    {
      key: "meps",
      label: TERMS.mepsRisk.label,
      help: TERMS.mepsRisk.help,
      value: String(kpis.mepsRiskCount),
      sub: "byggnader över kravet",
      icon: ShieldAlert,
      tone:
        kpis.mepsRiskCount > 0
          ? "text-red-600 bg-red-50"
          : "text-emerald-600 bg-emerald-50",
      href: "/risk-scores",
    },
    {
      key: "stranded",
      label: TERMS.stranded.label,
      help: TERMS.stranded.help,
      value: String(kpis.strandedCount),
      sub: "inom ca 10 år (CRREM)",
      icon: AlertTriangle,
      tone:
        kpis.strandedCount > 0
          ? "text-amber-600 bg-amber-50"
          : "text-emerald-600 bg-emerald-50",
      href: "/crrem",
    },
    {
      key: "invest",
      label: TERMS.investment.label,
      help: TERMS.investment.help,
      value: `${formatNumber(kpis.investmentNeedSek / 1e6, 1)} Mkr`,
      sub: `spar ${formatKwh(kpis.estimatedSavingKwh)}/år`,
      icon: PiggyBank,
      tone: "text-emerald-600 bg-emerald-50",
      href: "/actions",
    },
    {
      key: "quality",
      label: TERMS.dataQuality.label,
      help: TERMS.dataQuality.help,
      value: formatPercent(kpis.avgDataCompleteness),
      sub: `OK ${kpis.completeCount} · Uppsk. ${kpis.extrapolatedCount} · Saknas ${kpis.incompleteCount}`,
      icon: CheckCircle2,
      tone:
        (kpis.avgDataCompleteness ?? 0) >= 90
          ? "text-emerald-600 bg-emerald-50"
          : (kpis.avgDataCompleteness ?? 0) >= 70
            ? "text-amber-600 bg-amber-50"
            : "text-red-600 bg-red-50",
      href: "/import",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Link
            key={c.key}
            href={c.href}
            className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl",
                    c.tone
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium text-muted-foreground">
                  {c.label}
                </span>
                <HelpTip text={c.help} label={`Om ${c.label}`} />
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
            </div>
            <div className="mt-3 text-2xl font-semibold tracking-tight tabular text-foreground">
              {c.value}
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {c.sub}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
