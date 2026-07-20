"use server";

import { getBuildingScorecard } from "@/app/actions/building-scorecard";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { buildSimplePdf, pdfToBase64, type PdfLine } from "@/lib/pdf/simple-pdf";
import { z } from "zod";
import { uuidSchema } from "@/lib/validations/enums";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const MEPS_SV: Record<string, string> = {
  compliant: "Uppfyller krav",
  at_risk: "Risk att inte uppfylla",
  non_compliant: "Uppfyller inte krav",
};

function fmt(n: number | null | undefined, d = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("sv-SE", {
    maximumFractionDigits: d,
    minimumFractionDigits: 0,
  });
}

export async function exportBuildingDecisionPdf(raw: {
  building_id: string;
  year?: number;
  plan_id?: string;
}): Promise<ActionResult<{ fileBase64: string; fileName: string }>> {
  try {
    const input = z
      .object({
        building_id: uuidSchema,
        year: z.number().int().optional(),
        plan_id: uuidSchema.optional(),
      })
      .parse(raw);

    const supabase = await createClient();
    await requireUser(supabase);

    const sc = await getBuildingScorecard({
      building_id: input.building_id,
      year: input.year,
    });
    if (!sc.success) return { success: false, error: sc.error };
    const d = sc.data;
    const g = d.grades;
    const today = new Date().toISOString().slice(0, 10);

    let planTitle: string | null = null;
    let planCost: number | null = null;
    let planActions: Array<{
      title: string;
      cost: number | null;
      saving: number | null;
    }> = [];
    let projectedScore: number | null = null;
    let scenario: string | null = null;

    const planId = input.plan_id ?? d.open_plan?.id;
    if (planId) {
      const { data: plan } = await supabase
        .from("renovation_plans")
        .select(
          "title, total_estimated_cost, projected_combined_score, scenario_key, baseline_combined_score"
        )
        .eq("id", planId)
        .maybeSingle();
      if (plan) {
        planTitle = plan.title as string;
        planCost =
          plan.total_estimated_cost != null
            ? Number(plan.total_estimated_cost)
            : null;
        projectedScore =
          plan.projected_combined_score != null
            ? Number(plan.projected_combined_score)
            : null;
        scenario = (plan.scenario_key as string | null) ?? null;
      }
      const { data: links } = await supabase
        .from("renovation_plan_actions")
        .select("action_id, sort_order")
        .eq("plan_id", planId)
        .order("sort_order");
      const ids = (links ?? []).map((l) => l.action_id as string);
      if (ids.length) {
        const { data: acts } = await supabase
          .from("actions")
          .select("id, title, investment_cost, estimated_saving_kwh")
          .in("id", ids);
        const map = new Map((acts ?? []).map((a) => [a.id as string, a]));
        planActions = ids.map((id) => {
          const a = map.get(id);
          return {
            title: (a?.title as string) ?? id.slice(0, 8),
            cost:
              a?.investment_cost != null ? Number(a.investment_cost) : null,
            saving:
              a?.estimated_saving_kwh != null
                ? Number(a.estimated_saving_kwh)
                : null,
          };
        });
      }
    } else {
      planActions = d.top_actions.slice(0, 5).map((a) => ({
        title: a.title,
        cost: a.investment_cost,
        saving: a.estimated_saving_kwh,
      }));
      planCost = planActions.reduce((s, a) => s + (a.cost ?? 0), 0) || null;
      planTitle = "Foreslagna atgarder (ej sparad plan)";
    }

    const mepsLabel = g.meps_status
      ? MEPS_SV[g.meps_status] ?? g.meps_status
      : "—";

    let recommendation =
      "Fortsatt bevakning – ingen akut prioritering identifierad.";
    if (g.financial_risk_flag) {
      recommendation =
        "Prioritera – klimatrisikar fore 2035 (finansiell risk / CSRD-relevant).";
    } else if (g.meps_status === "non_compliant" || (g.meps_2030_gap ?? 0) > 0) {
      recommendation =
        "Prioritera atgarder som sanker energianvandning mot 2030-kravet.";
    } else if ((g.combined_score ?? 0) >= 60) {
      recommendation =
        "Hog samlad risk – jamfor renovationsscenarier och valj en plan.";
    }

    const lines: PdfLine[] = [
      { type: "title", text: "EnergyPulse – Beslutsunderlag" },
      {
        type: "text",
        text: `Energi, lagkrav 2030 och klimatrisk – underlag for ledning`,
      },
      { type: "space", h: 6 },
      {
        type: "text",
        text: `Objekt: ${d.building.name}  |  Fastighet: ${d.property.name}`,
      },
      {
        type: "text",
        text: `Kommun: ${d.property.municipality ?? "—"}  |  Ar: ${d.year}  |  Genererad: ${today}`,
      },
      { type: "space", h: 10 },
      { type: "subtitle", text: "1. Nulage (betyg)" },
      {
        type: "text",
        text: `Energiklass: ${g.energy_class ?? "—"}    Intensitet: ${fmt(g.energy_intensity, 1)} kWh/m2`,
      },
      {
        type: "text",
        text: `Krav 2030: ${mepsLabel}    Gap: ${fmt(g.meps_2030_gap, 1)} kWh/m2`,
      },
      {
        type: "text",
        text: `Klimatrisikar: ${g.crrem_stranding_year ?? "—"}    Finansiell risk <2035: ${g.financial_risk_flag ? "JA" : "Nej"}`,
      },
      {
        type: "text",
        text: `Samlad risk: ${fmt(g.combined_score, 0)} / 100    Datakvalitet: ${fmt(g.data_completeness_percent, 0)} %`,
      },
      { type: "space", h: 10 },
      { type: "subtitle", text: "2. Foreslagen plan / atgarder" },
      {
        type: "text",
        text: planTitle
          ? `${planTitle}${scenario ? ` (${scenario})` : ""}`
          : "Inga atgarder kopplade",
      },
      {
        type: "text",
        text: `Estimerad kostnad: ${planCost != null ? `${fmt(planCost / 1000, 0)} tkr` : "—"}`,
      },
      { type: "space", h: 4 },
    ];

    if (planActions.length) {
      lines.push({
        type: "row",
        cells: ["Atgard", "Kostnad tkr", "Spar kWh/ar"],
        widths: [280, 90, 100],
      });
      for (const a of planActions) {
        lines.push({
          type: "row",
          cells: [
            a.title.slice(0, 48),
            a.cost != null ? fmt(a.cost / 1000, 0) : "—",
            a.saving != null ? fmt(a.saving, 0) : "—",
          ],
          widths: [280, 90, 100],
        });
      }
    } else {
      lines.push({
        type: "text",
        text: "Inga oppna atgarder – skapa atgarder eller generera plan i EnergyPulse.",
      });
    }

    lines.push(
      { type: "space", h: 10 },
      { type: "subtitle", text: "3. Forvantat efter plan" },
      {
        type: "text",
        text:
          projectedScore != null
            ? `Samlad risk: ${fmt(g.combined_score, 0)} -> ${fmt(projectedScore, 0)}`
            : "Projicera via Jämfor planer i EnergyPulse for exakt fore/efter.",
      },
      { type: "space", h: 10 },
      { type: "subtitle", text: "4. Rekommendation" },
      { type: "text", text: recommendation },
      { type: "space", h: 14 },
      { type: "subtitle", text: "5. Beslut / signatur" },
      { type: "text", text: "Forvaltare: ________________________  Datum: __________" },
      { type: "space", h: 4 },
      { type: "text", text: "Beslut (godkann / skjut upp / avslå): ________________" },
      { type: "space", h: 10 },
      {
        type: "text",
        text: "Obs: Modeled spar andrar inte ravarden. Kalla: EnergyPulse prestanda + riskmotor.",
      }
    );

    const pdf = buildSimplePdf(lines);
    const fileName = `beslutsunderlag_${d.building.name.replace(/[^\w\-]+/g, "_").slice(0, 40)}_${d.year}.pdf`;

    logger.info("export.decision_pdf", {
      buildingId: input.building_id,
      year: d.year,
      planId: planId ?? null,
    });

    return {
      success: true,
      data: { fileBase64: pdfToBase64(pdf), fileName },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Export misslyckades",
    };
  }
}
