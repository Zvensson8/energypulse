/**
 * Regelbaserade åtgärdsförslag per risk – ingen extern AI krävs.
 * Används för att generera proposed actions + plantext med fastighetskontext.
 */

export type SuggestedAction = {
  title: string;
  category:
    | "envelope"
    | "hvac"
    | "lighting"
    | "controls"
    | "renewable"
    | "behaviour"
    | "other";
  description: string;
  estimated_saving_kwh: number | null;
  investment_cost: number | null;
  payback_years: number | null;
};

const PHYSICAL: Record<string, SuggestedAction[]> = {
  flood: [
    {
      title: "Översvämningsskydd – trösklar och backventiler",
      category: "envelope",
      description:
        "Minska skada vid höga vattennivåer: höjda trösklar, backventiler i avlopp, tätning av källaröppningar.",
      estimated_saving_kwh: null,
      investment_cost: 250000,
      payback_years: null,
    },
    {
      title: "Dränering och ytavrinning",
      category: "other",
      description:
        "Säkra dagvatten och marklutning bort från byggnad för att minska risken vid skyfall.",
      estimated_saving_kwh: null,
      investment_cost: 180000,
      payback_years: null,
    },
  ],
  heat: [
    {
      title: "Solskydd och nattkyla",
      category: "controls",
      description:
        "Automatiserad solavskärmning och nattvädring/kyla för att minska övertemperatur och komfortproblem.",
      estimated_saving_kwh: 40000,
      investment_cost: 320000,
      payback_years: 8,
    },
    {
      title: "Kylbehov – effektivisering VVX/HVAC",
      category: "hvac",
      description:
        "Optimera kyla/ventilation för värmeböljor utan onödig energianvändning.",
      estimated_saving_kwh: 60000,
      investment_cost: 450000,
      payback_years: 7,
    },
  ],
  storm: [
    {
      title: "Förstärkning av tak och fästen",
      category: "envelope",
      description:
        "Kontrollera och förstärk tak, plåt och fönsterfästen mot storm och fallande föremål.",
      estimated_saving_kwh: null,
      investment_cost: 200000,
      payback_years: null,
    },
  ],
  subsidence: [
    {
      title: "Grundundersökning och markstabilisering",
      category: "other",
      description:
        "Geoteknisk bedömning och åtgärder mot sättning (dränering, lastfördelning).",
      estimated_saving_kwh: null,
      investment_cost: 500000,
      payback_years: null,
    },
  ],
  wildfire: [
    {
      title: "Brandskydd yttre – vegetation och material",
      category: "other",
      description:
        "Rensa brandfarlig vegetation, säkra material nära fasad, se över brandceller.",
      estimated_saving_kwh: null,
      investment_cost: 150000,
      payback_years: null,
    },
  ],
  other: [
    {
      title: "Klimatanpassningsåtgärd – utredning",
      category: "other",
      description:
        "Teknisk utredning av identifierad fysisk klimatrisk och prioriterad åtgärdspaket.",
      estimated_saving_kwh: null,
      investment_cost: 80000,
      payback_years: null,
    },
  ],
};

const COMPLIANCE: Record<string, SuggestedAction[]> = {
  meps_2030: [
    {
      title: "Energieffektivisering mot krav 2030",
      category: "envelope",
      description:
        "Paket för att stänga kravgapet till 2030: klimatskal, fönster och/eller isolering baserat på gap.",
      estimated_saving_kwh: 120000,
      investment_cost: 900000,
      payback_years: 10,
    },
    {
      title: "Styr & regler – optimering energianvändning",
      category: "controls",
      description:
        "Trimning av styrning, scheman och nattkyla för att sänka kWh/m² mot MEPS.",
      estimated_saving_kwh: 45000,
      investment_cost: 180000,
      payback_years: 5,
    },
  ],
  meps_2033: [
    {
      title: "Långsiktig energieffektivisering mot 2033",
      category: "hvac",
      description:
        "Större systemåtgärder (VVX, värmepump, injustering) för 2033-kravet.",
      estimated_saving_kwh: 150000,
      investment_cost: 1200000,
      payback_years: 12,
    },
  ],
  crrem_stranding: [
    {
      title: "Sänk utsläppsintensitet – energibyte / PEF",
      category: "renewable",
      description:
        "Byt till lägre utsläpp (fjärrvärme/elavtal) eller sol/värmepump för att skjuta CRREM-misalignment.",
      estimated_saving_kwh: 80000,
      investment_cost: 750000,
      payback_years: 9,
    },
    {
      title: "Energieffektivisering för senare misalignment-år",
      category: "envelope",
      description:
        "Minska energibehov så GHG/m² sjunker och klimatriskåret flyttas framåt.",
      estimated_saving_kwh: 100000,
      investment_cost: 850000,
      payback_years: 10,
    },
  ],
};

export function templatesForPhysical(riskType: string): SuggestedAction[] {
  return PHYSICAL[riskType] ?? PHYSICAL.other;
}

export function templatesForCompliance(riskKind: string): SuggestedAction[] {
  return COMPLIANCE[riskKind] ?? COMPLIANCE.meps_2030;
}

export function buildPlanNarrative(input: {
  riskLabel: string;
  propertyName: string;
  buildingNames: string[];
  suggestions: SuggestedAction[];
}): string {
  const buildings =
    input.buildingNames.length > 0
      ? input.buildingNames.join(", ")
      : "byggnaderna under fastigheten";
  const bullets = input.suggestions
    .map((s, i) => `${i + 1}. ${s.title} – ${s.description}`)
    .join("\n");
  return [
    `Åtgärdsplan mot risk: ${input.riskLabel}`,
    `Fastighet: ${input.propertyName}`,
    `Berörda byggnader: ${buildings}`,
    "",
    "Föreslagna åtgärder (regelbaserat – granska och justera):",
    bullets,
    "",
    "Nästa steg: simulera åtgärder i EnergyPulse, jämför renovationsscenarier och exportera beslutsunderlag till ledningen.",
  ].join("\n");
}
