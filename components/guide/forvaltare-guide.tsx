"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  LineChart,
  MapPinned,
  Upload,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    n: 1,
    title: "Se betyg",
    body: "Öppna riskscore, klicka ett hus och se energiklass, krav 2030, klimatriskår och samlad risk på en sida.",
    href: "/risk-scores",
    cta: "Byggnader med hög risk",
    icon: ClipboardList,
    color: "from-indigo-500 to-violet-500",
  },
  {
    n: 2,
    title: "Simulera åtgärder",
    body: "På betygssidan eller under Åtgärder: se före/efter på kravgap och klimatriskår – utan att spara.",
    href: "/actions",
    cta: "Åtgärder",
    icon: LineChart,
    color: "from-emerald-500 to-teal-500",
  },
  {
    n: 3,
    title: "Välj plan",
    body: "Jämför billig, balanserad och aggressiv plan för huset. Spara utkast och godkänn när ledningen sagt ja.",
    href: "/renovation",
    cta: "Renovationsplaner",
    icon: Building2,
    color: "from-sky-500 to-blue-500",
  },
  {
    n: 4,
    title: "Exportera beslutsunderlag",
    body: "Från husets betygssida: ladda ner PDF till ledningen med nuläge, åtgärder och kostnad.",
    href: "/risk-scores",
    cta: "Börja här",
    icon: Upload,
    color: "from-amber-500 to-orange-500",
  },
];

const COLORS = [
  {
    color: "bg-gap-complete",
    title: "Grönt – Komplett",
    text: "Mätvärden finns för året. Du kan lita på siffrorna.",
  },
  {
    color: "bg-gap-extrapolated",
    title: "Gult – Uppskattad",
    text: "Några månader saknas och har fyllts i. Dubbelkolla gärna.",
  },
  {
    color: "bg-gap-incomplete",
    title: "Rött – Ofullständig",
    text: "För mycket saknas. Komplettera data innan du beslutar om åtgärder.",
  },
];

export function ForvaltareGuide() {
  return (
    <div className="page-shell">
      <div className="page-inner mx-auto max-w-3xl space-y-6">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Guide för teknisk förvaltare
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Kom igång med EnergyPulse
              </h1>
              <p className="max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
                Se betyg, simulera åtgärder, välj plan och ta ut PDF till
                ledningen – utan att vara dataanalytiker.
              </p>
            </div>
            <Button asChild className="shrink-0 gap-1.5">
              <Link href="/risk-scores">
                Se högriskbyggnader
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </section>

        {/* Steps */}
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Fyra enkla steg
            </h2>
            <p className="text-sm text-muted-foreground">
              Samma flöde varje gång – från översikt till åtgärd.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {STEPS.map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.n}
                  href={s.href}
                  className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/25 hover:shadow-md sm:p-5"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${s.color} text-white shadow-sm`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-muted-foreground">
                        Steg {s.n}
                      </div>
                      <h3 className="text-base font-semibold text-foreground">
                        {s.title}
                      </h3>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
                    {s.cta}
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Color legend */}
        <section className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">
            Färgerna du ser överallt
          </h2>
          <p className="text-sm text-muted-foreground">
            Datakvalitet visas med tre färger. Lär dig dem en gång – de återkommer
            i översikt, listor och kartor.
          </p>
          <ul className="space-y-3">
            {COLORS.map((c) => (
              <li key={c.title} className="flex items-start gap-3">
                <span
                  className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full ${c.color}`}
                />
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {c.title}
                  </div>
                  <div className="text-sm text-muted-foreground">{c.text}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Common questions */}
        <section className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">
            Vanliga frågor
          </h2>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-medium text-foreground">
                Vad betyder ”kravgap 2030”?
              </dt>
              <dd className="mt-1 text-muted-foreground">
                Skillnaden mellan byggnadens energianvändning och det krav
                (MEPS) som gäller mot 2030. Positivt tal = ni ligger över kravet
                och behöver sänka förbrukningen eller förbättra underlaget.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">
                Vad är ”riskår” / stranding?
              </dt>
              <dd className="mt-1 text-muted-foreground">
                Enligt CRREM-modellen: året då utsläppen blir för höga jämfört
                med en klimatanpassad bana. Tidigt riskår = prioritera åtgärder.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">
                Hur får jag in ny energidata?
              </dt>
              <dd className="mt-1 text-muted-foreground">
                Gå till{" "}
                <Link
                  href="/import"
                  className="font-medium text-primary hover:underline"
                >
                  Importera
                </Link>{" "}
                och dra in CSV/Excel. Efter import beräknas prestanda automatiskt
                per byggnad och år.
              </dd>
            </div>
          </dl>
        </section>

        {/* Quick actions */}
        <section className="flex flex-wrap gap-2 pb-6">
          <Button asChild variant="default" className="gap-1.5">
            <Link href="/dashboard">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Översikt
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-1.5">
            <Link href="/properties/new">
              <MapPinned className="h-3.5 w-3.5" />
              Ny fastighet
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-1.5">
            <Link href="/risk-scores">
              <AlertTriangle className="h-3.5 w-3.5" />
              Byggnader med hög risk
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-1.5">
            <Link href="/properties">
              <MapPinned className="h-3.5 w-3.5" />
              Fastigheter
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-1.5">
            <Link href="/import">
              <Upload className="h-3.5 w-3.5" />
              Importera data
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-1.5">
            <Link href="/actions">Prioriterade åtgärder</Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
