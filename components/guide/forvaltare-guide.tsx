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
    title: "Se helheten",
    body: "Översikten visar hur beståndet mår: energi, kravrisk och om underlaget är komplett.",
    href: "/dashboard",
    cta: "Öppna översikt",
    icon: ClipboardList,
  },
  {
    n: 2,
    title: "Importera data",
    body: "Dra in CSV eller Excel med månadsförbrukning. Systemet validerar och räknar om prestanda automatiskt.",
    href: "/import",
    cta: "Importera",
    icon: Upload,
  },
  {
    n: 3,
    title: "Granska byggnader",
    body: "Per byggnad ser du energiklass, kravgap 2030 och om data saknas. Klicka en rad för mer detalj.",
    href: "/buildings",
    cta: "Byggnadslista",
    icon: Building2,
  },
  {
    n: 4,
    title: "Prioritera åtgärder",
    body: "Se vilka åtgärder som ger störst nytta mot krav och klimatrisk. Räkna om prioritet med aktuella vikter.",
    href: "/actions",
    cta: "Åtgärder",
    icon: LineChart,
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
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        {/* Hero */}
        <section className="panel relative overflow-hidden rounded-md p-5 sm:p-6">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-terminal-accent/10 blur-2xl" />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-terminal-accent/30 bg-terminal-accent/10 px-2.5 py-0.5 text-2xs font-medium text-terminal-accent">
                <Sparkles className="h-3 w-3" />
                Guide för teknisk förvaltare
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                Kom igång med EnergyPulse
              </h1>
              <p className="max-w-lg text-sm leading-relaxed text-terminal-muted">
                Verktyget samlar energidata, lagkrav och klimatrisk för ditt
                bestånd – utan att du behöver vara dataanalytiker. Följ stegen
                nedan.
              </p>
            </div>
            <Button asChild className="shrink-0 gap-1.5">
              <Link href="/dashboard">
                Gå till översikt
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </section>

        {/* Steps */}
        <section className="space-y-2">
          <h2 className="px-0.5 text-xs font-semibold uppercase tracking-wider text-terminal-muted">
            Fyra enkla steg
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {STEPS.map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.n}
                  href={s.href}
                  className="panel group flex flex-col gap-2 rounded-md p-4 transition hover:border-terminal-accent/40 hover:bg-terminal-row/40"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-terminal-accent/15 text-xs font-bold text-terminal-accent">
                      {s.n}
                    </span>
                    <Icon className="h-4 w-4 text-terminal-muted group-hover:text-terminal-accent" />
                    <h3 className="text-sm font-semibold text-foreground">
                      {s.title}
                    </h3>
                  </div>
                  <p className="text-xs leading-relaxed text-terminal-muted">
                    {s.body}
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-terminal-accent">
                    {s.cta}
                    <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Color legend */}
        <section className="panel space-y-3 rounded-md p-4">
          <h2 className="text-sm font-semibold text-foreground">
            Färgerna du ser överallt
          </h2>
          <p className="text-xs text-terminal-muted">
            Datakvalitet visas med tre färger. Lär dig dem en gång – de återkommer
            i översikt, listor och kartor.
          </p>
          <ul className="space-y-2.5">
            {COLORS.map((c) => (
              <li key={c.title} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded-sm ${c.color}`}
                />
                <div>
                  <div className="text-xs font-medium text-foreground">
                    {c.title}
                  </div>
                  <div className="text-xs text-terminal-muted">{c.text}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Common questions */}
        <section className="panel space-y-3 rounded-md p-4">
          <h2 className="text-sm font-semibold text-foreground">
            Vanliga frågor
          </h2>
          <dl className="space-y-3 text-xs">
            <div>
              <dt className="font-medium text-foreground">
                Vad betyder ”kravgap 2030”?
              </dt>
              <dd className="mt-0.5 text-terminal-muted">
                Skillnaden mellan byggnadens energianvändning och det krav
                (MEPS) som gäller mot 2030. Positivt tal = ni ligger över kravet
                och behöver sänka förbrukningen eller förbättra underlaget.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">
                Vad är ”riskår” / stranding?
              </dt>
              <dd className="mt-0.5 text-terminal-muted">
                Enligt CRREM-modellen: året då utsläppen blir för höga jämfört
                med en klimatanpassad bana. Tidigt riskår = prioritera åtgärder.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">
                Hur får jag in ny energidata?
              </dt>
              <dd className="mt-0.5 text-terminal-muted">
                Gå till{" "}
                <Link href="/import" className="text-terminal-accent hover:underline">
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
          <Button asChild variant="terminal" className="gap-1.5">
            <Link href="/properties/new">
              <MapPinned className="h-3.5 w-3.5" />
              Ny fastighet
            </Link>
          </Button>
          <Button asChild variant="terminal" className="gap-1.5">
            <Link href="/buildings?gap=INCOMPLETE_DATA">
              <AlertTriangle className="h-3.5 w-3.5" />
              Byggnader med saknad data
            </Link>
          </Button>
          <Button asChild variant="terminal" className="gap-1.5">
            <Link href="/import">
              <Upload className="h-3.5 w-3.5" />
              Importera data
            </Link>
          </Button>
          <Button asChild variant="terminal" className="gap-1.5">
            <Link href="/actions">
              Prioriterade åtgärder
            </Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
