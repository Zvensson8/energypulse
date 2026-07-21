"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getHomePriorities } from "@/app/actions/home-priorities";
import {
  LayoutDashboard,
  ListTodo,
  Activity,
  ArrowRight,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  Sparkles,
  Hammer,
  MapPinned,
  AlertTriangle,
  Loader2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { toUserError } from "@/lib/errors";

const STEPS = [
  {
    n: "1",
    title: "Se betyg",
    body: "Öppna hus med hög samlad risk – lagkrav 2030, klimatriskår och datakvalitet på en sida.",
    href: "/risk-scores",
    cta: "Riskscore",
    icon: Activity,
    color: "from-indigo-500 to-violet-500",
  },
  {
    n: "2",
    title: "Simulera åtgärder",
    body: "Se hur en åtgärd påverkar kravgap och klimatriskår – utan att spara.",
    href: "/actions",
    cta: "Åtgärder",
    icon: ListTodo,
    color: "from-emerald-500 to-teal-500",
  },
  {
    n: "3",
    title: "Välj plan",
    body: "Jämför billig, balanserad och aggressiv plan. Spara utkast.",
    href: "/renovation",
    cta: "Renovationsplaner",
    icon: Hammer,
    color: "from-amber-500 to-orange-500",
  },
  {
    n: "4",
    title: "Exportera underlag",
    body: "PDF till ledning, CSRD eller hela fastigheten under Rapporter.",
    href: "/reports",
    cta: "Rapporter",
    icon: FileText,
    color: "from-sky-500 to-cyan-500",
  },
];

const SHORTCUTS = [
  {
    title: "Fastigheter",
    desc: "Byggnader, risk och planer per hus",
    href: "/properties",
    icon: MapPinned,
  },
  {
    title: "Riskscore",
    desc: "Samlad risk 0–100",
    href: "/risk-scores",
    icon: Activity,
  },
  {
    title: "Importera energi",
    desc: "CSV / Excel",
    href: "/import",
    icon: Upload,
  },
  {
    title: "Rapporter",
    desc: "PDF till ledning & CSRD",
    href: "/reports",
    icon: FileText,
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
  const { data, isLoading, error } = useQuery({
    queryKey: ["home-priorities"],
    queryFn: async () => {
      const res = await getHomePriorities();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const primary = data?.priorities[0];
  const summary = data?.summary;

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
              Dagens prioriteringar · år {data?.year ?? "…"}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Vad ska du göra nu?
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Börja med det viktigaste i portföljen. Sedan: se betyg → simulera
              → välj plan → ta ut rapport.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {primary ? (
                <Button size="lg" asChild>
                  <Link href={primary.href}>
                    <AlertTriangle className="h-4 w-4" />
                    {primary.cta}
                  </Link>
                </Button>
              ) : (
                <Button size="lg" asChild>
                  <Link href="/risk-scores">
                    <Activity className="h-4 w-4" />
                    Se samlad risk
                  </Link>
                </Button>
              )}
              <Button size="lg" variant="outline" asChild>
                <Link href="/dashboard">
                  <LayoutDashboard className="h-4 w-4" />
                  Portföljöversikt
                </Link>
              </Button>
            </div>
            {summary && (
              <p className="mt-4 text-xs text-muted-foreground">
                {summary.propertyCount} fastigheter · {summary.buildingCount}{" "}
                byggnader · {summary.highRiskCount} hög risk ·{" "}
                {summary.incompleteCount} saknad data
              </p>
            )}
          </div>
        </section>

        {/* Priorities */}
        <section>
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Dina tre viktigaste saker
            </h2>
            <p className="text-sm text-muted-foreground">
              Baserat på data, riskscore och öppna planer i beståndet.
            </p>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Hämtar prioriteter…
            </div>
          )}

          {error && (
            <EmptyState
              icon={AlertTriangle}
              title="Kunde inte hämta prioriteter"
              body={toUserError(
                error,
                "Kontrollera inloggning och försök igen."
              )}
              why="Utan live-data visar vi bara genvägar."
              ctaLabel="Till översikt"
              ctaHref="/dashboard"
            />
          )}

          {!isLoading && !error && data && (
            <div className="grid gap-3 md:grid-cols-3">
              {data.priorities.map((p, i) => (
                <Link
                  key={p.id}
                  href={p.href}
                  className={cn(
                    "group flex flex-col rounded-2xl border bg-card p-4 shadow-sm transition hover:shadow-md",
                    p.severity === "high" &&
                      "border-red-200 hover:border-red-300",
                    p.severity === "medium" &&
                      "border-amber-200 hover:border-amber-300",
                    p.severity === "low" &&
                      "border-border hover:border-primary/25"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                        p.severity === "high" && "bg-red-50 text-red-700",
                        p.severity === "medium" &&
                          "bg-amber-50 text-amber-800",
                        p.severity === "low" &&
                          "bg-emerald-50 text-emerald-800"
                      )}
                    >
                      {p.severity === "high"
                        ? "Prioritera"
                        : p.severity === "medium"
                          ? "Kolla"
                          : "OK"}
                    </span>
                    <span className="text-2xl font-semibold text-slate-200">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-foreground">
                    {p.title}
                    {p.count > 0 ? (
                      <span className="ml-1.5 tabular text-muted-foreground">
                        ({p.count})
                      </span>
                    ) : null}
                  </h3>
                  <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {p.body}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                    {p.cta}
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Journey steps */}
        <section>
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Fyra steg till beslut
            </h2>
            <p className="text-sm text-muted-foreground">
              Samma flöde varje gång – oavsett fastighet.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => {
              const Icon = s.icon;
              return (
                <Link key={s.n} href={s.href} className="group quick-tile">
                  <div className="flex items-center justify-between">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${s.color} text-white shadow-sm`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-xl font-semibold text-slate-200">
                      {s.n}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {s.title}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
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

        {/* Shortcuts */}
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
                  key={s.href + s.title}
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

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Färger du ser överallt</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            <Legend
              color="bg-slate-400"
              title="Grått – Ej klart"
              text="Steg som fortfarande saknas i checklistan"
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
