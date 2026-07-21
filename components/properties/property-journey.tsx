"use client";

import Link from "next/link";
import {
  Building2,
  Database,
  Activity,
  ListTodo,
  Hammer,
  FileText,
  CheckCircle2,
  Circle,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type JourneyStepStatus = "done" | "partial" | "todo";

export type JourneyStep = {
  id: string;
  title: string;
  body: string;
  status: JourneyStepStatus;
  href?: string;
  onClick?: () => void;
  cta?: string;
};

const STATUS_UI: Record<
  JourneyStepStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  done: {
    label: "Klart",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    Icon: CheckCircle2,
  },
  partial: {
    label: "Delvis",
    className: "border-amber-200 bg-amber-50 text-amber-900",
    Icon: AlertCircle,
  },
  todo: {
    label: "Att göra",
    className: "border-border bg-secondary/40 text-muted-foreground",
    Icon: Circle,
  },
};

const STEP_ICONS: Record<string, typeof Building2> = {
  buildings: Building2,
  data: Database,
  risk: Activity,
  actions: ListTodo,
  plan: Hammer,
  report: FileText,
};

/**
 * Visuell checklista: data → risk → åtgärd → plan → rapport.
 */
export function PropertyJourney({ steps }: { steps: JourneyStep[] }) {
  const next = steps.find((s) => s.status !== "done");

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Så kommer du vidare</h2>
          <p className="text-sm text-muted-foreground">
            Status för den här fastigheten – grönt är klart, gult delvis, grått
            återstår.
          </p>
        </div>
        {next && (
          <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            Nästa: {next.title}
          </span>
        )}
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step, i) => {
          const ui = STATUS_UI[step.status];
          const StatusIcon = ui.Icon;
          const StepIcon = STEP_ICONS[step.id] ?? Circle;
          const inner = (
            <>
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <StepIcon className="h-4 w-4" />
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    ui.className
                  )}
                >
                  <StatusIcon className="h-3 w-3" />
                  {ui.label}
                </span>
              </div>
              <div className="mt-2">
                <div className="text-sm font-semibold">
                  {i + 1}. {step.title}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
              {step.cta && (
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                  {step.cta}
                  <ArrowRight className="h-3 w-3" />
                </span>
              )}
            </>
          );

          const className = cn(
            "rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition",
            (step.href || step.onClick) &&
              "hover:border-primary/25 hover:shadow-md"
          );

          if (step.href) {
            return (
              <li key={step.id}>
                <Link href={step.href} className={cn(className, "block")}>
                  {inner}
                </Link>
              </li>
            );
          }
          if (step.onClick) {
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={step.onClick}
                  className={cn(className, "w-full")}
                >
                  {inner}
                </button>
              </li>
            );
          }
          return (
            <li key={step.id} className={className}>
              {inner}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Bygg journey-steg från fastighetsdata. */
export function buildPropertyJourneySteps(input: {
  propertyId: string;
  buildingCount: number;
  withPerf: number;
  incompletePerf: number;
  riskCount: number;
  highRiskBuildings: number;
  openActions: number;
  planCount: number;
  draftPlans: number;
  onTab: (tab: string) => void;
}): JourneyStep[] {
  const {
    propertyId,
    buildingCount,
    withPerf,
    incompletePerf,
    riskCount,
    highRiskBuildings,
    openActions,
    planCount,
    draftPlans,
    onTab,
  } = input;

  const buildingsStatus: JourneyStepStatus =
    buildingCount === 0 ? "todo" : withPerf > 0 ? "done" : "partial";

  const dataStatus: JourneyStepStatus =
    buildingCount === 0
      ? "todo"
      : incompletePerf > 0
        ? "partial"
        : withPerf === buildingCount && buildingCount > 0
          ? "done"
          : withPerf > 0
            ? "partial"
            : "todo";

  const riskStatus: JourneyStepStatus =
    buildingCount === 0
      ? "todo"
      : highRiskBuildings > 0
        ? "partial"
        : withPerf > 0
          ? "done"
          : "todo";

  const actionStatus: JourneyStepStatus =
    openActions > 0 ? "partial" : planCount > 0 || withPerf > 0 ? "done" : "todo";

  const planStatus: JourneyStepStatus =
    draftPlans > 0 ? "partial" : planCount > 0 ? "done" : "todo";

  return [
    {
      id: "buildings",
      title: "Byggnader",
      body:
        buildingCount === 0
          ? "Lägg till minst ett hus med Atemp."
          : `${buildingCount} hus · ${withPerf} med beräknad prestanda.`,
      status: buildingsStatus,
      onClick: () => onTab("buildings"),
      cta: buildingCount === 0 ? "Lägg till byggnad" : "Visa byggnader",
    },
    {
      id: "data",
      title: "Energidata",
      body:
        incompletePerf > 0
          ? `${incompletePerf} hus har ofullständig data – importera eller korrigera.`
          : withPerf > 0
            ? "Prestanda finns. Håll data uppdaterad vid nya månader."
            : "Importera månadsförbrukning så vi kan räkna risk och klass.",
      status: dataStatus,
      href: "/import",
      cta: "Importera energi",
    },
    {
      id: "risk",
      title: "Risk & betyg",
      body:
        highRiskBuildings > 0
          ? `${highRiskBuildings} hus med förhöjd risk – öppna riskscore.`
          : riskCount > 0
            ? `${riskCount} fysiska risker registrerade.`
            : "Se samlad risk och registrera fysiska klimatrisker.",
      status: riskStatus,
      onClick: () => onTab("risk-scores"),
      cta: "Riskscore",
    },
    {
      id: "actions",
      title: "Åtgärder",
      body:
        openActions > 0
          ? `${openActions} öppna åtgärder – simulera och prioritera.`
          : "Skapa eller simulera åtgärder kopplade till husen.",
      status: actionStatus,
      onClick: () => onTab("actions"),
      cta: "Åtgärder",
    },
    {
      id: "plan",
      title: "Renovationsplan",
      body:
        draftPlans > 0
          ? `${draftPlans} utkast att godkänna.`
          : planCount > 0
            ? `${planCount} plan(er) kopplade till fastigheten.`
            : "Jämför A/B/C-scenarier och spara utkast.",
      status: planStatus,
      onClick: () => onTab("renovation"),
      cta: "Renovering",
    },
    {
      id: "report",
      title: "Rapport till ledning",
      body: "Ta ut PDF med energi, risk, planer och kostnader för just den här fastigheten.",
      status: planCount > 0 || withPerf > 0 ? "partial" : "todo",
      href: `/reports?property=${propertyId}&type=property_full`,
      cta: "Samlad rapport",
    },
  ];
}
