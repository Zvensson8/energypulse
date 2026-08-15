"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";
import type { PropertyDecision } from "@/lib/property-decision";

const TONE: Record<PropertyDecision["status"], string> = {
  unlinked: "border-red-300 bg-red-50 text-red-800",
  needs_decision: "border-red-200 bg-red-50 text-red-800",
  missing_data: "border-amber-200 bg-amber-50 text-amber-900",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

export function PropertyDecisionHero({
  decision,
  onTab,
}: {
  decision: PropertyDecision;
  onTab: (tab: string) => void;
}) {
  const next = decision.next;

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span
            className={cn(
              "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
              TONE[decision.status],
            )}
          >
            {decision.statusLabel}
          </span>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            {decision.why}
          </p>
        </div>
        {next.href ? (
          <Button asChild>
            <Link href={next.href}>{next.label}</Link>
          </Button>
        ) : next.tab ? (
          <Button type="button" onClick={() => onTab(next.tab!)}>
            {next.label}
          </Button>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Metric
          label="Energi"
          value={
            decision.energyIntensity != null
              ? `${formatNumber(decision.energyIntensity, 0)} kWh/m²`
              : "—"
          }
          hint="kWh/m²,år"
        />
        <Metric
          label="Klarar 2030?"
          value={
            decision.meets2030 == null
              ? "—"
              : decision.meets2030
                ? "Ja"
                : "Nej"
          }
          hint="MEPS-gap ≤ 0"
          warn={decision.meets2030 === false}
        />
        <Metric
          label="Klimatriskår"
          value={
            decision.climateYear != null ? String(decision.climateYear) : "—"
          }
          hint="CRREM, tidigaste hus"
          warn={
            decision.climateYear != null && decision.climateYear < 2035
          }
        />
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-secondary/30 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular",
          warn && "text-red-700",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}
