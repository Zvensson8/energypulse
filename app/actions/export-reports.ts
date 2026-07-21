"use server";

/**
 * Portfölj- och fastighetsrapporter (PDF) för ledning, CSRD, fastighet och renovering.
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { buildSimplePdf, pdfToBase64, type PdfLine } from "@/lib/pdf/simple-pdf";
import { listPhysicalRisks } from "@/app/actions/physical-risks-crud";
import { listPortfolioActions } from "@/app/actions/actions-priority";
import { listRenovationPlans } from "@/app/actions/renovation-plans";
import { listRiskScores } from "@/app/actions/risk-scores";
import { getProperty } from "@/app/actions/properties-crud";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { uuidSchema } from "@/lib/validations/enums";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type ReportKind =
  | "leadership_climate"
  | "csrd"
  | "property_full"
  | "renovation";

const RISK_SV: Record<string, string> = {
  flood: "Oversvamning",
  heat: "Varme",
  storm: "Storm",
  subsidence: "Sattning",
  wildfire: "Skogsbrand",
  other: "Ovrigt",
};

const LEVEL_SV: Record<string, string> = {
  low: "Lag",
  medium: "Medel",
  high: "Hog",
  very_high: "Mycket hog",
};

const STATUS_SV: Record<string, string> = {
  draft: "Utkast",
  approved: "Godkand",
  in_progress: "Pagår",
  completed: "Klar",
  proposed: "Foreslagen",
  open: "Oppna",
  monitoring: "Bevakning",
  resolved: "Atgardad",
  dismissed: "Avskriven",
};

const MEPS_SV: Record<string, string> = {
  compliant: "Uppfyller",
  at_risk: "Risk",
  non_compliant: "Ej uppfyllt",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmt(n: number | null | undefined, d = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("sv-SE", {
    maximumFractionDigits: d,
    minimumFractionDigits: 0,
  });
}

function tkr(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${fmt(n / 1000, 0)} tkr`;
}

function paybackYears(
  cost: number | null | undefined,
  savingKwh: number | null | undefined,
  energyPriceSekPerKwh = 1.2
): number | null {
  if (cost == null || cost <= 0) return null;
  if (savingKwh == null || savingKwh <= 0) return null;
  const annual = savingKwh * energyPriceSekPerKwh;
  if (annual <= 0) return null;
  return cost / annual;
}

function safeName(s: string): string {
  return s.replace(/[^\w\-]+/g, "_").slice(0, 40);
}

function header(
  title: string,
  subtitle: string,
  meta: string
): PdfLine[] {
  return [
    { type: "title", text: title },
    { type: "text", text: subtitle },
    { type: "space", h: 4 },
    { type: "text", text: meta },
    { type: "space", h: 10 },
  ];
}

function footer(): PdfLine[] {
  return [
    { type: "space", h: 14 },
    {
      type: "text",
      text: "Kallor: EnergyPulse (prestanda, riskscore, riskregister, atgarder, renovationsplaner).",
    },
    {
      type: "text",
      text: "Obs: Modeled spar andrar inte ravarden. Belopp ar uppskattningar for beslutsstod.",
    },
  ];
}

/* ─── 1. Ledningsförslag klimatrisk ───────────────────────── */

export async function exportLeadershipClimateReport(raw?: {
  propertyId?: string;
  year?: number;
}): Promise<ActionResult<{ fileBase64: string; fileName: string }>> {
  try {
    const input = z
      .object({
        propertyId: uuidSchema.optional(),
        year: z.number().int().optional(),
      })
      .parse(raw ?? {});
    const year = input.year ?? new Date().getFullYear() - 1;
    const supabase = await createClient();
    await requireUser(supabase);

    const [risksRes, actionsRes, scoresRes, plansRes] = await Promise.all([
      listPhysicalRisks({
        propertyId: input.propertyId,
        hideClosed: true,
      }),
      listPortfolioActions({ year, status: null }),
      listRiskScores({ year }),
      listRenovationPlans({}),
    ]);

    if (!risksRes.success) return { success: false, error: risksRes.error };
    if (!actionsRes.success) return { success: false, error: actionsRes.error };

    let risks = risksRes.data;
    let actions = actionsRes.data.rows.filter(
      (a) => a.status === "proposed" || a.status === "approved"
    );
    let scores = scoresRes.success ? scoresRes.data : [];
    let plans = plansRes.success ? plansRes.data : [];

    if (input.propertyId) {
      risks = risks.filter((r) => r.property_id === input.propertyId);
      actions = actions.filter((a) => a.property_id === input.propertyId);
      scores = scores.filter((s) => s.property_id === input.propertyId);
      plans = plans.filter((p) => p.property_id === input.propertyId);
    }

    const highRisk = scores.filter((s) => (s.combined_score ?? 0) >= 60);
    const financial = scores.filter((s) => s.financial_risk_flag);
    const totalActionCost = actions.reduce(
      (s, a) => s + (a.investment_cost ?? 0),
      0
    );
    const totalPlanCost = plans
      .filter((p) => p.status !== "completed")
      .reduce((s, p) => s + (p.total_estimated_cost ?? 0), 0);

    const scope = input.propertyId
      ? risks[0]?.property_name ?? "Vald fastighet"
      : "Hela portfoljen";

    const lines: PdfLine[] = [
      ...header(
        "EnergyPulse – Forslag till ledningen",
        "Klimatrisker, foreslagna atgarder, forklaringar och uppskattad kostnad",
        `Omfattning: ${scope}  |  Ar: ${year}  |  Genererad: ${today()}`
      ),
      { type: "subtitle", text: "1. Sammanfattning for beslut" },
      {
        type: "text",
        text: `Aktiva fysiska klimatrisker: ${risks.length}  |  Byggnader med hog riskscore (>=60): ${highRisk.length}  |  Finansiell risk <2035: ${financial.length}`,
      },
      {
        type: "text",
        text: `Uppskattad kostnad foreslagna/godkanda atgarder: ${tkr(totalActionCost || null)}`,
      },
      {
        type: "text",
        text: `Uppskattad kostnad oppna renovationsplaner: ${tkr(totalPlanCost || null)}`,
      },
      { type: "space", h: 8 },
      { type: "subtitle", text: "2. Identifierade klimatrisker" },
    ];

    if (risks.length === 0) {
      lines.push({
        type: "text",
        text: "Inga oppna fysiska klimatrisker i registret. Komplettera under Risker vid behov.",
      });
    } else {
      lines.push({
        type: "row",
        cells: ["Fastighet", "Risk", "Sannolikhet", "Konsekvens", "Poang"],
        widths: [140, 100, 80, 80, 50],
      });
      for (const r of risks.slice(0, 40)) {
        lines.push({
          type: "row",
          cells: [
            (r.property_name ?? "—").slice(0, 28),
            (RISK_SV[r.risk_type] ?? r.risk_type).slice(0, 20),
            LEVEL_SV[r.probability] ?? r.probability,
            LEVEL_SV[r.consequence] ?? r.consequence,
            r.risk_score != null ? fmt(r.risk_score, 0) : "—",
          ],
          widths: [140, 100, 80, 80, 50],
        });
        if (r.notes) {
          lines.push({
            type: "text",
            text: `  Forklaring: ${r.notes.slice(0, 120)}`,
          });
        }
      }
    }

    lines.push(
      { type: "space", h: 8 },
      { type: "subtitle", text: "3. Byggnader med hog klimatrisk / lagkravsrisk" }
    );

    if (highRisk.length === 0 && financial.length === 0) {
      lines.push({
        type: "text",
        text: "Inga byggnader med hog riskscore eller finansiell riskflagga i urvalet.",
      });
    } else {
      lines.push({
        type: "row",
        cells: ["Byggnad", "Fastighet", "Score", "Klimatar", "MEPS", "Fin.risk"],
        widths: [120, 110, 45, 55, 70, 50],
      });
      const top = [...highRisk, ...financial]
        .filter(
          (s, i, arr) =>
            arr.findIndex((x) => x.building_id === s.building_id) === i
        )
        .slice(0, 35);
      for (const s of top) {
        lines.push({
          type: "row",
          cells: [
            s.building_name.slice(0, 24),
            (s.property_name ?? "—").slice(0, 22),
            fmt(s.combined_score, 0),
            s.crrem_misalignment_year != null
              ? String(s.crrem_misalignment_year)
              : "—",
            s.meps_status ? MEPS_SV[s.meps_status] ?? s.meps_status : "—",
            s.financial_risk_flag ? "JA" : "Nej",
          ],
          widths: [120, 110, 45, 55, 70, 50],
        });
      }
    }

    lines.push(
      { type: "space", h: 8 },
      {
        type: "subtitle",
        text: "4. Foreslagna atgarder (kostnad, payback, koppling till risk)",
      }
    );

    if (actions.length === 0) {
      lines.push({
        type: "text",
        text: "Inga foreslagna/godkanda atgarder. Skapa atgarder under Atgarder eller generera planer under Renovering.",
      });
    } else {
      lines.push({
        type: "row",
        cells: ["Atgard", "Byggnad", "Kostnad", "Spar kWh", "Payback", "Varfor"],
        widths: [130, 90, 55, 60, 50, 80],
      });
      for (const a of actions.slice(0, 45)) {
        const pb =
          a.payback_years ??
          paybackYears(a.investment_cost, a.estimated_saving_kwh);
        const why = explainAction(a);
        lines.push({
          type: "row",
          cells: [
            a.title.slice(0, 26),
            (a.building_name ?? "—").slice(0, 18),
            tkr(a.investment_cost),
            a.estimated_saving_kwh != null
              ? fmt(a.estimated_saving_kwh, 0)
              : "—",
            pb != null ? `${fmt(pb, 1)} ar` : "—",
            why.slice(0, 16),
          ],
          widths: [130, 90, 55, 60, 50, 80],
        });
      }
    }

    lines.push(
      { type: "space", h: 8 },
      { type: "subtitle", text: "5. Rekommendation till ledningen" }
    );

    const recs: string[] = [];
    if (financial.length > 0) {
      recs.push(
        `Prioritera ${financial.length} byggnad(er) med klimatrisikar fore 2035 (CSRD/finansiell risk).`
      );
    }
    if (risks.some((r) => (r.risk_score ?? 0) >= 9)) {
      recs.push(
        "Hanterar hogpoangade fysiska risker (oversvamning/varme m.m.) med bevakning eller atgard."
      );
    }
    if (totalPlanCost > 0) {
      recs.push(
        `Godkann renovationsplaner i etapper – total uppskattad kostnad ${tkr(totalPlanCost)}.`
      );
    }
    if (recs.length === 0) {
      recs.push(
        "Fortsatt bevakning. Komplettera data och rakna om riskscore vid behov."
      );
    }
    for (const r of recs) {
      lines.push({ type: "text", text: `• ${r}` });
    }

    lines.push(
      { type: "space", h: 10 },
      { type: "subtitle", text: "6. Beslut / signatur" },
      {
        type: "text",
        text: "Forvaltare: ________________________  Datum: __________",
      },
      {
        type: "text",
        text: "Beslut (godkann / skjut upp / avslå): ________________",
      },
      ...footer()
    );

    const pdf = buildSimplePdf(lines);
    const fileName = `ledning_klimatrisk_${safeName(scope)}_${year}.pdf`;
    logger.info("export.report.leadership_climate", {
      propertyId: input.propertyId ?? null,
      year,
    });
    return { success: true, data: { fileBase64: pdfToBase64(pdf), fileName } };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Export misslyckades",
    };
  }
}

function explainAction(a: {
  meps_2030_gap?: number | null;
  crrem_stranding_year?: number | null;
  category?: string;
  title?: string;
}): string {
  if (a.meps_2030_gap != null && a.meps_2030_gap > 0) return "Kravgap 2030";
  if (a.crrem_stranding_year != null && a.crrem_stranding_year < 2035)
    return "Tidig klimatrisk";
  if (a.category === "envelope") return "Klimatskal";
  if (a.category === "hvac") return "VS/HVAC";
  if (a.category === "renewable") return "Fornybart";
  return "Energieff.";
}

/* ─── 2. CSRD ─────────────────────────────────────────────── */

export async function exportCsrdReport(raw?: {
  propertyId?: string;
  year?: number;
}): Promise<ActionResult<{ fileBase64: string; fileName: string }>> {
  try {
    const input = z
      .object({
        propertyId: uuidSchema.optional(),
        year: z.number().int().optional(),
      })
      .parse(raw ?? {});
    const year = input.year ?? new Date().getFullYear() - 1;
    await requireUser(await createClient());

    const [scoresRes, risksRes, plansRes, actionsRes] = await Promise.all([
      listRiskScores({ year }),
      listPhysicalRisks({
        propertyId: input.propertyId,
        hideClosed: false,
      }),
      listRenovationPlans({}),
      listPortfolioActions({ year }),
    ]);

    let scores = scoresRes.success ? scoresRes.data : [];
    let risks = risksRes.success ? risksRes.data : [];
    let plans = plansRes.success ? plansRes.data : [];
    let actions = actionsRes.success ? actionsRes.data.rows : [];

    if (input.propertyId) {
      scores = scores.filter((s) => s.property_id === input.propertyId);
      risks = risks.filter((r) => r.property_id === input.propertyId);
      plans = plans.filter((p) => p.property_id === input.propertyId);
      actions = actions.filter((a) => a.property_id === input.propertyId);
    }

    const avgScore =
      scores.length > 0
        ? scores.reduce((s, r) => s + (r.combined_score ?? 0), 0) / scores.length
        : null;
    const financial = scores.filter((s) => s.financial_risk_flag).length;
    const nonCompliant = scores.filter(
      (s) => s.meps_status === "non_compliant"
    ).length;
    const openRisks = risks.filter(
      (r) => r.workflow_status === "open" || r.workflow_status === "monitoring"
    ).length;
    const transitionCost = plans
      .filter((p) => p.status !== "completed")
      .reduce((s, p) => s + (p.total_estimated_cost ?? 0), 0);

    const scope = input.propertyId
      ? scores[0]?.property_name ??
        risks[0]?.property_name ??
        "Vald fastighet"
      : "Hela portfoljen";

    const lines: PdfLine[] = [
      ...header(
        "EnergyPulse – CSRD / ESRS E1 underlag",
        "Klimatrelaterad information for hallbarhetsrapportering (utkast baserat pa systemdata)",
        `Omfattning: ${scope}  |  Rapporteringsar: ${year}  |  Genererad: ${today()}`
      ),
      {
        type: "text",
        text: "Denna rapport ar ett dataunderlag – inte en fullstandig CSRD-deklaration. Anvand sektionerna nedan som checklista for vad som bor inga i ESRS E1.",
      },
      { type: "space", h: 8 },

      { type: "subtitle", text: "A. Vad som bor inga i en CSRD-klimatrapport (ESRS E1)" },
      {
        type: "text",
        text: "1) Styrning – roller for klimat- och energiforvaltning, beslutsprocess for renovering.",
      },
      {
        type: "text",
        text: "2) Strategi – hur klimatkrav (MEPS/EPBD) och CRREM-banor paverkar bestandet och affarsmodellen.",
      },
      {
        type: "text",
        text: "3) Klimatrisker – fysiska risker (oversvamning, varme m.m.) och overgangsrisker (lagkrav, stranding).",
      },
      {
        type: "text",
        text: "4) Metriker – energianvandning, intensitet (kWh/m2), GHG om tillganglig, energiklass, datakvalitet.",
      },
      {
        type: "text",
        text: "5) Mal och omstallningsplan – renovationsplaner, tidsplan, investeringsbehov, forvantad effekt.",
      },
      {
        type: "text",
        text: "6) Policyer & atgarder – godkanda atgarder, status, ansvar, uppfoljning.",
      },
      {
        type: "text",
        text: "7) Datakvalitet & gap – saknad data, uppskattningar, override/audit.",
      },
      { type: "space", h: 8 },

      { type: "subtitle", text: "B. Nulage i EnergyPulse (metriker)" },
      {
        type: "text",
        text: `Byggnader med riskscore: ${scores.length}  |  Snitt riskscore: ${fmt(avgScore, 1)} / 100`,
      },
      {
        type: "text",
        text: `Finansiell risk (klimatar <2035): ${financial}  |  MEPS ej uppfyllt: ${nonCompliant}`,
      },
      {
        type: "text",
        text: `Aktiva fysiska risker (oppen/bevakning): ${openRisks}  |  Renovationsplaner: ${plans.length}`,
      },
      {
        type: "text",
        text: `Uppskattad investering i omstallningsplaner: ${tkr(transitionCost || null)}`,
      },
      { type: "space", h: 6 },
    ];

    if (scores.length > 0) {
      lines.push({
        type: "row",
        cells: ["Byggnad", "Klass", "Score", "MEPS", "Klimatar", "Fin.risk"],
        widths: [130, 45, 45, 70, 55, 55],
      });
      for (const s of scores.slice(0, 40)) {
        lines.push({
          type: "row",
          cells: [
            s.building_name.slice(0, 26),
            s.energy_class ?? "—",
            fmt(s.combined_score, 0),
            s.meps_status ? MEPS_SV[s.meps_status] ?? s.meps_status : "—",
            s.crrem_misalignment_year != null
              ? String(s.crrem_misalignment_year)
              : "—",
            s.financial_risk_flag ? "JA" : "Nej",
          ],
          widths: [130, 45, 45, 70, 55, 55],
        });
      }
    }

    lines.push(
      { type: "space", h: 8 },
      { type: "subtitle", text: "C. Fysiska klimatrisker (ESRS E1 – physical risks)" }
    );
    if (risks.length === 0) {
      lines.push({
        type: "text",
        text: "Inga registrerade fysiska risker. Bor kompletteras for fullstandig CSRD-bild.",
      });
    } else {
      lines.push({
        type: "row",
        cells: ["Fastighet", "Risktyp", "Status", "Poang", "Notering"],
        widths: [120, 90, 70, 45, 140],
      });
      for (const r of risks.slice(0, 30)) {
        lines.push({
          type: "row",
          cells: [
            (r.property_name ?? "—").slice(0, 24),
            (RISK_SV[r.risk_type] ?? r.risk_type).slice(0, 18),
            STATUS_SV[r.workflow_status] ?? r.workflow_status,
            r.risk_score != null ? fmt(r.risk_score, 0) : "—",
            (r.notes ?? r.status_reason ?? "—").slice(0, 28),
          ],
          widths: [120, 90, 70, 45, 140],
        });
      }
    }

    lines.push(
      { type: "space", h: 8 },
      {
        type: "subtitle",
        text: "D. Omstallningsplan (transition plan) – renovationsplaner",
      }
    );
    if (plans.length === 0) {
      lines.push({
        type: "text",
        text: "Inga renovationsplaner. CSRD forvantar beskrivning av atgarder mot mal (EPBD/MEPS/CRREM).",
      });
    } else {
      lines.push({
        type: "row",
        cells: ["Plan", "Byggnad", "Status", "Kostnad", "Score fore", "Score efter"],
        widths: [120, 100, 60, 55, 55, 55],
      });
      for (const p of plans.slice(0, 25)) {
        lines.push({
          type: "row",
          cells: [
            p.title.slice(0, 24),
            (p.building_name ?? "—").slice(0, 20),
            STATUS_SV[p.status] ?? p.status,
            tkr(p.total_estimated_cost),
            fmt(p.baseline_combined_score, 0),
            fmt(p.projected_combined_score, 0),
          ],
          widths: [120, 100, 60, 55, 55, 55],
        });
      }
    }

    lines.push(
      { type: "space", h: 8 },
      { type: "subtitle", text: "E. Checklist – saknas ofta i underlaget" },
      {
        type: "text",
        text: "[ ] Scope 1/2/3 GHG (tCO2e) per ar – koppla energimix/emissionsfaktorer",
      },
      {
        type: "text",
        text: "[ ] Klimatmal (vetenskapligt baserade) och basar",
      },
      {
        type: "text",
        text: "[ ] CapEx/OpEx for omstallning uppdelat per ar",
      },
      {
        type: "text",
        text: "[ ] Governance: styrelsens tillsyn av klimatfraga",
      },
      {
        type: "text",
        text: "[ ] Dubbel vasentlighetsanalys (impact + financial materiality)",
      },
      {
        type: "text",
        text: "[ ] Scenarier (1,5C / 2C) – CRREM-version i Admin",
      },
      { type: "space", h: 8 },
      { type: "subtitle", text: "F. Atgarder i system (utdrag)" },
      {
        type: "text",
        text: `Antal atgarder i urval: ${actions.length}  |  Summa investering: ${tkr(
          actions.reduce((s, a) => s + (a.investment_cost ?? 0), 0) || null
        )}`,
      },
      ...footer()
    );

    const pdf = buildSimplePdf(lines);
    const fileName = `csrd_esrs_e1_${safeName(scope)}_${year}.pdf`;
    logger.info("export.report.csrd", {
      propertyId: input.propertyId ?? null,
      year,
    });
    return { success: true, data: { fileBase64: pdfToBase64(pdf), fileName } };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Export misslyckades",
    };
  }
}

/* ─── 3. Samlad fastighetsrapport ─────────────────────────── */

export async function exportPropertyFullReport(raw: {
  propertyId: string;
  year?: number;
}): Promise<ActionResult<{ fileBase64: string; fileName: string }>> {
  try {
    const input = z
      .object({
        propertyId: uuidSchema,
        year: z.number().int().optional(),
      })
      .parse(raw);
    const year = input.year ?? new Date().getFullYear() - 1;

    const propRes = await getProperty(input.propertyId);
    if (!propRes.success) return { success: false, error: propRes.error };
    const { property, buildings, performance, physical_risks } = propRes.data;
    const propName = (property as { name: string }).name;
    const municipality =
      (property as { municipality: string | null }).municipality ?? "—";
    const address =
      (property as { address: string | null }).address ?? "—";

    const buildingIds = (
      buildings as Array<{ id: string; name: string }>
    ).map((b) => b.id);

    const [scoresRes, plansRes, actionsRes] = await Promise.all([
      listRiskScores({ year }),
      listRenovationPlans({}),
      listPortfolioActions({ year }),
    ]);

    const scores = (scoresRes.success ? scoresRes.data : []).filter(
      (s) => s.property_id === input.propertyId
    );
    const plans = (plansRes.success ? plansRes.data : []).filter(
      (p) =>
        p.property_id === input.propertyId ||
        (p.building_id != null && buildingIds.includes(p.building_id))
    );
    const actions = (actionsRes.success ? actionsRes.data.rows : []).filter(
      (a) => a.property_id === input.propertyId
    );

    const piByBuilding = new Map(
      (performance as Array<{ building_id: string }>).map((p) => [
        p.building_id,
        p as {
          building_id: string;
          energy_intensity: number | null;
          energy_class: string | null;
          meps_2030_gap: number | null;
          crrem_stranding_year: number | null;
          data_completeness_percent: number | null;
          data_gap_status: string | null;
        },
      ])
    );

    const avgScore =
      scores.length > 0
        ? scores.reduce((s, r) => s + (r.combined_score ?? 0), 0) /
          scores.length
        : null;
    const planCost = plans.reduce(
      (s, p) => s + (p.total_estimated_cost ?? 0),
      0
    );

    const lines: PdfLine[] = [
      ...header(
        "EnergyPulse – Fastighetsrapport",
        "Klimatrisker, energi, renovationsplaner – fore/efter, kostnader, payback och betyg",
        `${propName}  |  ${address}  |  ${municipality}  |  Ar: ${year}  |  ${today()}`
      ),
      { type: "subtitle", text: "1. Oversikt / betyg" },
      {
        type: "text",
        text: `Byggnader: ${buildings.length}  |  Snitt riskscore: ${fmt(avgScore, 1)} / 100  |  Fysiska risker: ${physical_risks.length}`,
      },
      {
        type: "text",
        text: `Renovationsplaner: ${plans.length}  |  Uppskattad plankostnad: ${tkr(planCost || null)}  |  Atgarder: ${actions.length}`,
      },
      { type: "space", h: 8 },
      { type: "subtitle", text: "2. Energi och prestanda per byggnad" },
      {
        type: "row",
        cells: [
          "Byggnad",
          "Klass",
          "kWh/m2",
          "Gap 2030",
          "Klimatar",
          "Score",
          "Data %",
        ],
        widths: [110, 40, 55, 55, 55, 45, 45],
      },
    ];

    for (const b of buildings as Array<{ id: string; name: string }>) {
      const pi = piByBuilding.get(b.id);
      const sc = scores.find((s) => s.building_id === b.id);
      lines.push({
        type: "row",
        cells: [
          b.name.slice(0, 22),
          pi?.energy_class ?? sc?.energy_class ?? "—",
          pi?.energy_intensity != null
            ? fmt(Number(pi.energy_intensity), 1)
            : "—",
          pi?.meps_2030_gap != null ? fmt(Number(pi.meps_2030_gap), 1) : "—",
          pi?.crrem_stranding_year != null
            ? String(pi.crrem_stranding_year)
            : sc?.crrem_misalignment_year != null
              ? String(sc.crrem_misalignment_year)
              : "—",
          fmt(sc?.combined_score, 0),
          pi?.data_completeness_percent != null
            ? fmt(Number(pi.data_completeness_percent), 0)
            : "—",
        ],
        widths: [110, 40, 55, 55, 55, 45, 45],
      });
    }

    if ((buildings as unknown[]).length === 0) {
      lines.push({
        type: "text",
        text: "Inga byggnader registrerade under fastigheten.",
      });
    }

    lines.push(
      { type: "space", h: 8 },
      { type: "subtitle", text: "3. Klimatrisker pa fastigheten" }
    );

    const risks = physical_risks as Array<{
      risk_type: string;
      probability: string;
      consequence: string;
      risk_score: number | null;
      notes: string | null;
      workflow_status?: string;
    }>;

    if (risks.length === 0) {
      lines.push({
        type: "text",
        text: "Inga fysiska klimatrisker registrerade.",
      });
    } else {
      lines.push({
        type: "row",
        cells: ["Risk", "Sannolikhet", "Konsekvens", "Poang", "Notering"],
        widths: [100, 80, 80, 50, 160],
      });
      for (const r of risks) {
        lines.push({
          type: "row",
          cells: [
            RISK_SV[r.risk_type] ?? r.risk_type,
            LEVEL_SV[r.probability] ?? r.probability,
            LEVEL_SV[r.consequence] ?? r.consequence,
            r.risk_score != null ? fmt(r.risk_score, 0) : "—",
            (r.notes ?? "—").slice(0, 32),
          ],
          widths: [100, 80, 80, 50, 160],
        });
      }
    }

    lines.push(
      { type: "space", h: 8 },
      {
        type: "subtitle",
        text: "4. Renovationsplaner – fore/efter, kostnad, payback",
      }
    );

    if (plans.length === 0) {
      lines.push({
        type: "text",
        text: "Inga renovationsplaner. Skapa under fliken Renovering pa fastigheten.",
      });
    } else {
      for (const p of plans) {
        const actionCost = p.actions.reduce(
          (s, a) => s + (a.investment_cost ?? 0),
          0
        );
        const cost = p.total_estimated_cost ?? (actionCost || null);
        // rough payback from linked actions if savings missing: N/A
        const scoreDelta =
          p.baseline_combined_score != null &&
          p.projected_combined_score != null
            ? p.baseline_combined_score - p.projected_combined_score
            : null;

        lines.push({ type: "space", h: 4 });
        lines.push({
          type: "text",
          text: `${p.title}  |  ${p.building_name ?? "—"}  |  ${STATUS_SV[p.status] ?? p.status}`,
        });
        lines.push({
          type: "text",
          text: `Kostnad: ${tkr(cost)}  |  Riskscore: ${fmt(p.baseline_combined_score, 0)} -> ${fmt(p.projected_combined_score, 0)}${
            scoreDelta != null ? ` (forbattring ${fmt(scoreDelta, 0)})` : ""
          }`,
        });
        if (p.target_misalignment_year != null) {
          lines.push({
            type: "text",
            text: `Mal klimatar: ${p.target_misalignment_year}  |  Mal MEPS: ${p.target_meps_status ?? "—"}`,
          });
        }
        if (p.actions.length > 0) {
          lines.push({
            type: "row",
            cells: ["Atgard i plan", "Kostnad", "MEPS-effekt", "Klimat-shift"],
            widths: [220, 70, 80, 80],
          });
          for (const a of p.actions) {
            lines.push({
              type: "row",
              cells: [
                (a.action_title ?? "—").slice(0, 44),
                tkr(a.investment_cost),
                a.expected_impact.meps_gap != null
                  ? fmt(a.expected_impact.meps_gap, 1)
                  : "—",
                a.expected_impact.misalignment_shift != null
                  ? String(a.expected_impact.misalignment_shift)
                  : "—",
              ],
              widths: [220, 70, 80, 80],
            });
          }
        }
      }
    }

    lines.push(
      { type: "space", h: 8 },
      { type: "subtitle", text: "5. Oppna atgarder (ej nodvandigt i plan)" }
    );

    const openActions = actions.filter(
      (a) =>
        a.status === "proposed" ||
        a.status === "approved" ||
        a.status === "in_progress"
    );

    if (openActions.length === 0) {
      lines.push({ type: "text", text: "Inga oppna atgarder." });
    } else {
      lines.push({
        type: "row",
        cells: ["Atgard", "Byggnad", "Kostnad", "Spar kWh", "Payback ar"],
        widths: [160, 110, 70, 70, 60],
      });
      for (const a of openActions.slice(0, 30)) {
        const pb =
          a.payback_years ??
          paybackYears(a.investment_cost, a.estimated_saving_kwh);
        lines.push({
          type: "row",
          cells: [
            a.title.slice(0, 32),
            (a.building_name ?? "—").slice(0, 22),
            tkr(a.investment_cost),
            a.estimated_saving_kwh != null
              ? fmt(a.estimated_saving_kwh, 0)
              : "—",
            pb != null ? fmt(pb, 1) : "—",
          ],
          widths: [160, 110, 70, 70, 60],
        });
      }
    }

    lines.push(
      { type: "space", h: 10 },
      { type: "subtitle", text: "6. Samlad bedomning" },
      {
        type: "text",
        text:
          avgScore != null && avgScore >= 60
            ? "Hog samlad risk – rekommenderar att ledningen tar stallning till renovationsplaner och budget."
            : avgScore != null && avgScore >= 40
              ? "Medelrisk – folj upp data och prioritera atgarder med bast payback."
              : "Lag till medel risk – fortsatt bevakning och datakvalitet.",
      },
      {
        type: "text",
        text: "Forvaltare: ________________________  Datum: __________",
      },
      ...footer()
    );

    const pdf = buildSimplePdf(lines);
    const fileName = `fastighet_${safeName(propName)}_${year}.pdf`;
    logger.info("export.report.property_full", {
      propertyId: input.propertyId,
      year,
    });
    return { success: true, data: { fileBase64: pdfToBase64(pdf), fileName } };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Export misslyckades",
    };
  }
}

/* ─── 4. Endast renovationsplaner ─────────────────────────── */

export async function exportRenovationPlansReport(raw?: {
  propertyId?: string;
  year?: number;
}): Promise<ActionResult<{ fileBase64: string; fileName: string }>> {
  try {
    const input = z
      .object({
        propertyId: uuidSchema.optional(),
        year: z.number().int().optional(),
      })
      .parse(raw ?? {});
    const year = input.year ?? new Date().getFullYear() - 1;
    await requireUser(await createClient());

    const plansRes = await listRenovationPlans({});
    if (!plansRes.success) return { success: false, error: plansRes.error };
    let plans = plansRes.data;

    if (input.propertyId) {
      // resolve building ids for property
      const propRes = await getProperty(input.propertyId);
      const buildingIds = propRes.success
        ? (propRes.data.buildings as Array<{ id: string }>).map((b) => b.id)
        : [];
      plans = plans.filter(
        (p) =>
          p.property_id === input.propertyId ||
          (p.building_id != null && buildingIds.includes(p.building_id))
      );
    }

    // enrich actions with savings for payback where possible
    const supabase = await createClient();
    const allActionIds = [
      ...new Set(plans.flatMap((p) => p.actions.map((a) => a.action_id))),
    ];
    const savingMap = new Map<string, number | null>();
    if (allActionIds.length > 0) {
      const { data: acts } = await supabase
        .from("actions")
        .select("id, estimated_saving_kwh, payback_years")
        .in("id", allActionIds);
      for (const a of acts ?? []) {
        savingMap.set(a.id as string, a.estimated_saving_kwh as number | null);
      }
    }

    const totalCost = plans.reduce(
      (s, p) => s + (p.total_estimated_cost ?? 0),
      0
    );
    const scope = input.propertyId
      ? plans[0]?.building_name
        ? `Fastighet (via planer)`
        : "Vald fastighet"
      : "Hela portfoljen";

    // better scope name
    let scopeName = scope;
    if (input.propertyId) {
      const pr = await getProperty(input.propertyId);
      if (pr.success) {
        scopeName = (pr.data.property as { name: string }).name;
      }
    }

    const lines: PdfLine[] = [
      ...header(
        "EnergyPulse – Renovationsplaner",
        "Planer med fore/efter riskscore, kostnader, atgarder och uppskattad payback",
        `Omfattning: ${scopeName}  |  Referensar: ${year}  |  Genererad: ${today()}`
      ),
      { type: "subtitle", text: "1. Sammanfattning" },
      {
        type: "text",
        text: `Antal planer: ${plans.length}  |  Total uppskattad kostnad: ${tkr(totalCost || null)}`,
      },
      {
        type: "text",
        text: `Utkast: ${plans.filter((p) => p.status === "draft").length}  |  Godkand/pagar: ${
          plans.filter(
            (p) => p.status === "approved" || p.status === "in_progress"
          ).length
        }  |  Klara: ${plans.filter((p) => p.status === "completed").length}`,
      },
      { type: "space", h: 8 },
      { type: "subtitle", text: "2. Planer i oversikt" },
      {
        type: "row",
        cells: [
          "Plan",
          "Byggnad",
          "Status",
          "Kostnad",
          "Score fore",
          "Score efter",
          "Delta",
        ],
        widths: [110, 90, 55, 55, 55, 55, 45],
      },
    ];

    for (const p of plans) {
      const delta =
        p.baseline_combined_score != null &&
        p.projected_combined_score != null
          ? p.baseline_combined_score - p.projected_combined_score
          : null;
      lines.push({
        type: "row",
        cells: [
          p.title.slice(0, 22),
          (p.building_name ?? "—").slice(0, 18),
          STATUS_SV[p.status] ?? p.status,
          tkr(p.total_estimated_cost),
          fmt(p.baseline_combined_score, 0),
          fmt(p.projected_combined_score, 0),
          delta != null ? fmt(delta, 0) : "—",
        ],
        widths: [110, 90, 55, 55, 55, 55, 45],
      });
    }

    if (plans.length === 0) {
      lines.push({
        type: "text",
        text: "Inga renovationsplaner att visa. Skapa under Renovering (jamfor scenarier A/B/C).",
      });
    }

    lines.push(
      { type: "space", h: 10 },
      { type: "subtitle", text: "3. Detaljer per plan" }
    );

    for (const p of plans) {
      const savings = p.actions.reduce((s, a) => {
        const v = savingMap.get(a.action_id);
        return s + (v ?? 0);
      }, 0);
      const cost =
        p.total_estimated_cost ??
        p.actions.reduce((s, a) => s + (a.investment_cost ?? 0), 0);
      const pb = paybackYears(cost || null, savings || null);

      lines.push({ type: "space", h: 6 });
      lines.push({
        type: "text",
        text: `--- ${p.title} (${STATUS_SV[p.status] ?? p.status}) ---`,
      });
      lines.push({
        type: "text",
        text: `Byggnad: ${p.building_name ?? "—"}  |  Kostnad: ${tkr(cost || null)}  |  Payback (ca): ${pb != null ? `${fmt(pb, 1)} ar` : "—"}`,
      });
      lines.push({
        type: "text",
        text: `Riskscore: ${fmt(p.baseline_combined_score, 0)} -> ${fmt(p.projected_combined_score, 0)}  |  Mal klimatar: ${p.target_misalignment_year ?? "—"}  |  Mal MEPS: ${p.target_meps_status ?? "—"}`,
      });
      if (p.notes) {
        lines.push({ type: "text", text: `Notering: ${p.notes.slice(0, 140)}` });
      }
      if (p.actions.length === 0) {
        lines.push({ type: "text", text: "Inga atgarder i planen." });
      } else {
        lines.push({
          type: "row",
          cells: ["Atgard", "Kostnad", "Spar kWh", "Payback", "MEPS d", "Klimat"],
          widths: [160, 60, 60, 55, 55, 50],
        });
        for (const a of p.actions) {
          const sav = savingMap.get(a.action_id) ?? null;
          const apb = paybackYears(a.investment_cost, sav);
          lines.push({
            type: "row",
            cells: [
              (a.action_title ?? "—").slice(0, 32),
              tkr(a.investment_cost),
              sav != null ? fmt(sav, 0) : "—",
              apb != null ? fmt(apb, 1) : "—",
              a.expected_impact.meps_gap != null
                ? fmt(a.expected_impact.meps_gap, 1)
                : "—",
              a.expected_impact.misalignment_shift != null
                ? String(a.expected_impact.misalignment_shift)
                : "—",
            ],
            widths: [160, 60, 60, 55, 55, 50],
          });
        }
      }
    }

    lines.push(
      { type: "space", h: 10 },
      { type: "subtitle", text: "4. Rekommendation" },
      {
        type: "text",
        text:
          plans.some((p) => p.status === "draft")
            ? "Godkann utkast efter granskning av kostnad och forvantad riskminskning. Prioritera planer med hogst score-delta per krona."
            : "Folj upp godkannade planer till klar status sa att modeled spar tillampas.",
      },
      {
        type: "text",
        text: "Forvaltare: ________________________  Datum: __________",
      },
      ...footer()
    );

    const pdf = buildSimplePdf(lines);
    const fileName = `renovationsplaner_${safeName(scopeName)}_${year}.pdf`;
    logger.info("export.report.renovation", {
      propertyId: input.propertyId ?? null,
      year,
      count: plans.length,
    });
    return { success: true, data: { fileBase64: pdfToBase64(pdf), fileName } };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Export misslyckades",
    };
  }
}
