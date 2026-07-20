"use client";

import Link from "next/link";
import {
  Upload,
  LayoutDashboard,
  ListTodo,
  Building2,
  Activity,
  ArrowRight,
  FileSpreadsheet,
  CheckCircle2,
  Sparkles,
  Hammer,
  MapPinned,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    n: "1",
    title: "Mata in data",
    body: "Ladda upp energiförbrukning (CSV/Excel). Systemet validerar och räknar om automatiskt.",
    href: "/import",
    cta: "Öppna import",
    icon: Upload,
    color: "from-indigo-500 to-violet-500",
  },
  {
    n: "2",
    title: "Hitta läget",
    body: "Se översikt, riskscore och vilka byggnader som behöver åtgärd.",
    href: "/dashboard",
    cta: "Till översikt",
    icon: LayoutDashboard,
    color: "from-emerald-500 to-teal-500",
  },
  {
    n: "3",
    title: "Simulera & agera",
    body: "Skapa eller slutför åtgärder. Se före/efter på MEPS och klimatriskår.",
    href: "/actions",
    cta: "Till åtgärder",
    icon: ListTodo,
    color: "from-amber-500 to-orange-500",
  },
];

const SHORTCUTS = [
  {
    title: "Fastigheter",
    desc: "Lista, sök, lägg till",
    href: "/properties",
    icon: MapPinned,
  },
  {
    title: "Byggnader",
    desc: "Prestanda, filter, export",
    href: "/buildings",
    icon: Building2,
  },
  {
    title: "Riskscore",
    desc: "MEPS + CRREM + data",
    href: "/risk-scores",
    icon: Activity,
  },
  {
    title: "Renovationsplan",
    desc: "Paketera åtgärder",
    href: "/renovation",
    icon: Hammer,
  },
  {
    title: "Exempel-CSV",
    desc: "Ladda ner mall",
    href: "/examples/energypulse_exempel_import.csv",
    icon: FileSpreadsheet,
    download: true,
  },
  {
    title: "Guide",
    desc: "Förklaring på svenska",
    href: "/guide",
    icon: Sparkles,
  },
];

export function HomeHub() {
  return (
    <div className="page-shell">
      <div className="page-inner">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="relative max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Självinstruerande arbetsyta
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Vad vill du göra idag?
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              EnergyPulse samlar energidata, lagkrav (MEPS) och klimatrisk
              (CRREM) – så du kan prioritera rätt åtgärder med få klick.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href="/import">
                  <Upload className="h-4 w-4" />
                  Importera energidata
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/dashboard">
                  Se portföljöversikt
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* 3 steps */}
        <section>
          <div className="mb-3 flex items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Tre steg till beslut
              </h2>
              <p className="text-sm text-muted-foreground">
                Samma flöde varje gång – från fil till färdig åtgärd.
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => {
              const Icon = s.icon;
              return (
                <Link key={s.n} href={s.href} className="group quick-tile">
                  <div className="flex items-center justify-between">
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${s.color} text-white shadow-sm`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-2xl font-semibold text-slate-200">
                      {s.n}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {s.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {s.body}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                    {s.cta}
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Shortcuts grid */}
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight">
            Snabbgenvägar
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SHORTCUTS.map((s) => {
              const Icon = s.icon;
              const Comp = s.download ? "a" : Link;
              const props = s.download
                ? { href: s.href, download: true }
                : { href: s.href };
              return (
                <Comp
                  key={s.href}
                  {...(props as { href: string })}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/25 hover:shadow-md"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground">
                      {s.title}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {s.desc}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Comp>
              );
            })}
          </div>
        </section>

        {/* Legend */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Färger du ser överallt</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Legend
              color="bg-emerald-500"
              title="Grönt – OK"
              text="Komplett data eller låg risk"
            />
            <Legend
              color="bg-amber-500"
              title="Gult – Kolla"
              text="Uppskattad data eller medelrisk"
            />
            <Legend
              color="bg-red-500"
              title="Rött – Prioritera"
              text="Saknas data eller hög krav-/klimatrisk"
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Legend({
  color,
  title,
  text,
}: {
  color: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${color}`} />
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{text}</div>
      </div>
    </div>
  );
}
