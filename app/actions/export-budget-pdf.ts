"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { buildSimplePdf, pdfToBase64, type PdfLine } from "@/lib/pdf/simple-pdf";
import { summarizePropertyDecision } from "@/lib/property-decision";
import { uuidSchema } from "@/lib/validations/enums";

export async function exportPropertyBudgetPdf(raw: {
  propertyId: string;
}): Promise<
  | { success: true; data: { fileBase64: string; fileName: string } }
  | { success: false; error: string }
> {
  try {
    const propertyId = uuidSchema.parse(raw.propertyId);
    const supabase = await createClient();
    await requireUser(supabase);

    const { data: property, error } = await supabase
      .from("properties")
      .select("id, name, address, municipality, external_id")
      .eq("id", propertyId)
      .maybeSingle();
    if (error || !property) {
      return { success: false, error: error?.message ?? "Fastighet hittades inte" };
    }

    const { data: buildings } = await supabase
      .from("buildings")
      .select("id, name")
      .eq("property_id", propertyId);
    const buildingIds = (buildings ?? []).map((b) => b.id);

    const { data: pis } = buildingIds.length
      ? await supabase
          .from("performance_indicators")
          .select(
            "building_id, energy_intensity, data_gap_status, meps_2030_gap, crrem_stranding_year, energy_class",
          )
          .in("building_id", buildingIds)
          .order("year", { ascending: false })
      : { data: [] };

    const seen = new Set<string>();
    const perf = (pis ?? []).filter((p) => {
      if (seen.has(p.building_id)) return false;
      seen.add(p.building_id);
      return true;
    });

    const decision = summarizePropertyDecision(
      buildingIds.length,
      perf,
      propertyId,
      { linked: true },
    );

    const { data: action } = buildingIds.length
      ? await supabase
          .from("actions")
          .select("title, investment_cost, status, estimated_saving_kwh")
          .in("building_id", buildingIds)
          .in("status", ["proposed", "approved", "in_progress"])
          .order("priority_score", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    const today = new Date().toISOString().slice(0, 10);
    const kwh =
      decision.energyIntensity != null
        ? `${Math.round(decision.energyIntensity)} kWh/m²`
        : "—";
    const meps =
      decision.meets2030 == null ? "—" : decision.meets2030 ? "Ja" : "Nej";
    const year =
      decision.climateYear != null ? String(decision.climateYear) : "—";
    const cost =
      action?.investment_cost != null
        ? `${Math.round(Number(action.investment_cost) / 1000)} tkr`
        : "—";
    const saving =
      action?.estimated_saving_kwh != null
        ? `${Math.round(Number(action.estimated_saving_kwh)).toLocaleString("sv-SE")} kWh/år`
        : "—";

    const lines: PdfLine[] = [
      {
        type: "brand_header",
        title: property.name,
        subtitle: [property.address, property.municipality, property.external_id]
          .filter(Boolean)
          .join(" · "),
        meta: today,
      },
      { type: "space", h: 8 },
      {
        type: "kpi_row",
        items: [
          { label: "Energi", value: kwh },
          { label: "Klarar 2030?", value: meps },
          { label: "Klimatriskår", value: year },
        ],
      },
      { type: "space", h: 12 },
      { type: "subtitle", text: "Föreslagen åtgärd" },
      action
        ? {
            type: "table",
            headers: ["Åtgärd", "Kostnad", "Spar"],
            rows: [[action.title, cost, saving]],
            widths: [280, 100, 120],
          }
        : { type: "text", text: "Ingen öppen åtgärd." },
      { type: "space", h: 16 },
      { type: "text", text: decision.why },
    ];

    const pdf = buildSimplePdf(lines, { footerLeft: "EnergyPulse · underlag" });
    const slug = property.name
      .toLowerCase()
      .replace(/[^a-z0-9åäö]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    return {
      success: true,
      data: {
        fileBase64: pdfToBase64(pdf),
        fileName: `underlag-${slug || "fastighet"}-${today}.pdf`,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Kunde inte skapa PDF",
    };
  }
}
