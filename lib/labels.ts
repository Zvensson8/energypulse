/**
 * Svenska, begripliga etiketter för tekniska förvaltare
 * (undvik onödig engelsk jargong i UI).
 */

import type { DataGapStatus } from "@/lib/supabase/database.types";

export const APP_TAGLINE =
  "Energi, krav och klimatrisk – samlat för din portfölj";

/** Kort förklaring av datakvalitet (data gap). */
export function dataGapHelp(status: DataGapStatus | null | undefined): string {
  switch (status) {
    case "COMPLETE":
      return "Alla månader har mätvärden. Resultatet är tillförlitligt.";
    case "EXTRAPOLATED_WARNING":
      return "Några månader saknas och har fyllts i med uppskattning. Kontrollera gärna underlaget.";
    case "INCOMPLETE_DATA":
      return "För mycket data saknas. Använd inte för beslut utan att komplettera mätvärden.";
    default:
      return "Ingen beräkning ännu. Importera energidata och kör beräkning.";
  }
}

/** Längre etikett för data gap (listor, filter). */
export function dataGapLabelLong(
  status: DataGapStatus | null | undefined
): string {
  switch (status) {
    case "COMPLETE":
      return "Komplett data";
    case "EXTRAPOLATED_WARNING":
      return "Uppskattad (saknade månader)";
    case "INCOMPLETE_DATA":
      return "Ofullständig data";
    default:
      return "Ej beräknad";
  }
}

export const STATUS_SV: Record<string, string> = {
  active: "Aktiv",
  inactive: "Inaktiv",
  disposed: "Avyttrad",
  under_development: "Under utveckling",
};

export const OWNERSHIP_SV: Record<string, string> = {
  owned: "Ägd",
  leased: "Hyrd",
  joint_venture: "Joint venture",
  other: "Övrigt",
};

/** Begrepp som visas i UI med kort hjälptext. */
export const TERMS = {
  overview: {
    label: "Översikt",
    help: "Samlad bild av energianvändning, datakvalitet och risker i hela beståndet.",
  },
  properties: {
    label: "Fastigheter",
    help: "Dina fastigheter och tillhörande byggnader.",
  },
  buildings: {
    label: "Byggnader",
    help: "Prestanda per byggnad: energiklass, kravgap och datakvalitet.",
  },
  crrem: {
    label: "Klimatrisk",
    help: "CRREM visar när en byggnad riskerar att bli olönsam ur klimatsynpunkt om utsläppen inte sänks (stranding-år).",
  },
  totalEnergy: {
    label: "Total energi",
    help: "Sammanlagd energianvändning för beräknade byggnader det valda året.",
  },
  intensity: {
    label: "Energi per m²",
    help: "Genomsnittlig energianvändning per kvadratmeter uppvärmd yta (Atemp). Lägre är bättre.",
  },
  mepsRisk: {
    label: "Kravrisk 2030",
    help: "Antal byggnader som ligger över energikravet (MEPS) för 2030. Dessa behöver åtgärder eller bättre data.",
  },
  stranded: {
    label: "Klimatrisk snart",
    help: "Byggnader som enligt CRREM når kritisk utsläppsnivå inom ca 10 år om inget görs.",
  },
  investment: {
    label: "Investering vs spar",
    help: "Uppskattat investeringsbehov jämfört med årlig energibesparing från planerade åtgärder.",
  },
  dataQuality: {
    label: "Datakvalitet",
    help: "Hur komplett mätunderlaget är. Grönt = säkert underlag, gult = uppskattat, rött = saknas för mycket.",
  },
  mepsGap: {
    label: "Kravgap 2030",
    help: "Hur mycket energianvändningen (kWh/m²) överskrider kravnivån för 2030. Positivt tal = behov av förbättring.",
  },
  strandingYear: {
    label: "Riskår",
    help: "Första år då byggnadens utsläpp enligt CRREM överstiger banan (pathway). Tidigare år = högre prioritet.",
  },
  energyClass: {
    label: "Energiklass",
    help: "Klass A–G enligt beräknad prestanda. A är bäst, G är sämst.",
  },
  atemp: {
    label: "Atemp",
    help: "Uppvärmd area (m²) som används i energiberäkningar.",
  },
  primaryEnergy: {
    label: "Primärenergi",
    help: "Energi viktad med primärenergifaktor (PE). Används ofta i lagkrav.",
  },
  ghg: {
    label: "Klimatutsläpp",
    help: "Växthusgasintensitet (kg CO₂e/m²). Underlag för klimatrisk (CRREM).",
  },
} as const;

export type TermKey = keyof typeof TERMS;
