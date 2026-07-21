"use server";

/**
 * Hem: de viktigaste sakerna att göra idag (portföljnivå).
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type HomePriority = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  body: string;
  count: number;
  href: string;
  cta: string;
};

export type HomePrioritiesData = {
  year: number;
  priorities: HomePriority[];
  summary: {
    propertyCount: number;
    buildingCount: number;
    highRiskCount: number;
    incompleteCount: number;
    draftPlanCount: number;
    openActionCount: number;
  };
};

export async function getHomePriorities(
  year?: number
): Promise<ActionResult<HomePrioritiesData>> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);
    const targetYear = year ?? new Date().getFullYear() - 1;

    const [
      { count: propertyCount },
      { count: buildingCount },
      { data: perf },
      { data: scores },
      { count: draftPlanCount },
      { count: openActionCount },
    ] = await Promise.all([
      supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase.from("buildings").select("id", { count: "exact", head: true }),
      supabase
        .from("performance_indicators")
        .select("building_id, data_gap_status, meps_2030_gap, financial_risk_flag")
        .eq("year", targetYear)
        .limit(500),
      supabase
        .from("risk_scores")
        .select("building_id, combined_score")
        .eq("year", targetYear)
        .limit(500),
      supabase
        .from("renovation_plans")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft"),
      supabase
        .from("actions")
        .select("id", { count: "exact", head: true })
        .in("status", ["proposed", "approved"]),
    ]);

    const incompleteCount = (perf ?? []).filter(
      (p) => p.data_gap_status === "INCOMPLETE_DATA"
    ).length;

    const highFromScores = (scores ?? []).filter(
      (s) => Number(s.combined_score ?? 0) >= 60
    ).length;

    const highFromPerf = (perf ?? []).filter(
      (p) =>
        Boolean(p.financial_risk_flag) ||
        (p.meps_2030_gap != null && Number(p.meps_2030_gap) > 0)
    ).length;

    const highRiskCount = Math.max(highFromScores, highFromPerf);

    const props = propertyCount ?? 0;
    const buildings = buildingCount ?? 0;
    const drafts = draftPlanCount ?? 0;
    const actions = openActionCount ?? 0;

    const priorities: HomePriority[] = [];

    if (props === 0) {
      priorities.push({
        id: "onboard",
        severity: "high",
        title: "Lägg till din första fastighet",
        body: "Börja med en fastighet, sedan byggnader med Atemp och energidata.",
        count: 0,
        href: "/properties/new",
        cta: "Ny fastighet",
      });
    } else if (buildings === 0) {
      priorities.push({
        id: "buildings",
        severity: "high",
        title: "Registrera byggnader",
        body: "Öppna en fastighet och lägg till hus med Atemp under fliken Byggnader.",
        count: props,
        href: "/properties",
        cta: "Till fastigheter",
      });
    }

    if (incompleteCount > 0) {
      priorities.push({
        id: "data",
        severity: "high",
        title: "Komplettera saknad energidata",
        body: `${incompleteCount} byggnadsår har ofullständig data – olämpligt för ledningsbeslut utan komplettering.`,
        count: incompleteCount,
        href: "/import",
        cta: "Importera energi",
      });
    }

    if (highRiskCount > 0) {
      priorities.push({
        id: "risk",
        severity: "high",
        title: "Prioritera hus med hög risk",
        body: `${highRiskCount} byggnader har hög samlad risk, lagkravsgap eller tidigt klimatriskår.`,
        count: highRiskCount,
        href: "/risk-scores",
        cta: "Öppna riskscore",
      });
    }

    if (drafts > 0) {
      priorities.push({
        id: "plans",
        severity: "medium",
        title: "Godkänn renovationsutkast",
        body: `${drafts} plan(er) väntar på granskning. Jämför kostnad och riskminskning innan beslut.`,
        count: drafts,
        href: "/renovation",
        cta: "Visa planer",
      });
    }

    if (actions > 0 && priorities.length < 3) {
      priorities.push({
        id: "actions",
        severity: "medium",
        title: "Simulera eller slutför åtgärder",
        body: `${actions} öppna åtgärder – simulera före/efter och markera klar när ni är överens.`,
        count: actions,
        href: "/actions",
        cta: "Till åtgärder",
      });
    }

    if (props > 0 && buildings > 0 && priorities.length < 3) {
      priorities.push({
        id: "report",
        severity: "low",
        title: "Ta ut underlag till ledningen",
        body: "PDF med klimatrisk, kostnader och planer – filtrera gärna på en fastighet.",
        count: 0,
        href: "/reports",
        cta: "Rapporter",
      });
    }

    // Always surface max 3, high first
    const order = { high: 0, medium: 1, low: 2 };
    priorities.sort((a, b) => order[a.severity] - order[b.severity]);
    const top = priorities.slice(0, 3);

    if (top.length === 0) {
      top.push({
        id: "ok",
        severity: "low",
        title: "Inget akut just nu",
        body: "Portföljen ser lugn ut. Följ upp översikt eller räkna om riskscore vid nya data.",
        count: 0,
        href: "/dashboard",
        cta: "Portföljöversikt",
      });
    }

    return {
      success: true,
      data: {
        year: targetYear,
        priorities: top,
        summary: {
          propertyCount: props,
          buildingCount: buildings,
          highRiskCount,
          incompleteCount,
          draftPlanCount: drafts,
          openActionCount: actions,
        },
      },
    };
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : "Kunde inte hämta prioriteter. Försök logga in igen.",
    };
  }
}
