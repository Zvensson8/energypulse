"use client";

import Link from "next/link";
import type { DecisionItem } from "@/app/actions/dashboard";
import {
  AlertTriangle,
  Database,
  Hammer,
  ListTodo,
  Thermometer,
  ArrowRight,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

const KIND_UI: Record<
  DecisionItem["kind"],
  { icon: typeof AlertTriangle; label: string; tone: string }
> = {
  incomplete_data: {
    icon: Database,
    label: "Data",
    tone: "bg-red-50 text-red-700 border-red-100",
  },
  climate_year: {
    icon: Thermometer,
    label: "Klimat",
    tone: "bg-amber-50 text-amber-900 border-amber-100",
  },
  high_risk: {
    icon: AlertTriangle,
    label: "Krav",
    tone: "bg-orange-50 text-orange-800 border-orange-100",
  },
  draft_plan: {
    icon: Hammer,
    label: "Plan",
    tone: "bg-sky-50 text-sky-800 border-sky-100",
  },
  open_action: {
    icon: ListTodo,
    label: "Åtgärd",
    tone: "bg-indigo-50 text-indigo-800 border-indigo-100",
  },
};

export function DecisionBoard({
  items,
  year,
}: {
  items: DecisionItem[];
  year: number;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Beslutstavla – topp 10</h2>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Prioriterade objekt för år {year}: saknad data, klimatrisk, planer
            och åtgärder.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/risk-scores"
            className="text-xs font-medium text-primary hover:underline"
          >
            Riskscore
          </Link>
          <Link
            href="/reports"
            className="text-xs font-medium text-primary hover:underline"
          >
            Rapporter
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Inget akut i urvalet. Bra läge – följ upp översikt eller räkna om
          riskscore.
        </p>
      ) : (
        <ol className="divide-y divide-border rounded-xl border border-border">
          {items.map((it, i) => {
            const ui = KIND_UI[it.kind];
            const Icon = ui.icon;
            return (
              <li key={it.id}>
                <Link
                  href={it.href}
                  className="flex items-start gap-3 px-3 py-3 transition hover:bg-secondary/40 sm:px-4"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      ui.tone
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {ui.label}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      {it.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {it.subtitle}
                      {it.meta ? ` · ${it.meta}` : ""}
                    </span>
                  </span>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
