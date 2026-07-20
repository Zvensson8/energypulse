/**
 * Boverkets klimatzoner (I–IV) för energiberäkning.
 * Förenklad mappning via län + vanliga kommuner.
 * Användaren kan alltid åsidosätta i formuläret.
 *
 * Ungefärlig karta:
 *  I  – Norrland (kallast)
 *  II – Södra Norrland / norra Svealand
 *  III – Mellansverige inkl. Stockholm
 *  IV – Södra Sverige (Skåne m.fl.)
 */

export type ClimateZone = "I" | "II" | "III" | "IV";

export const CLIMATE_ZONE_HELP: Record<ClimateZone, string> = {
  I: "Norrland – kallast (t.ex. Norrbotten, Västerbotten, Jämtland)",
  II: "Södra Norrland / norra Svealand (t.ex. Gävleborg, Dalarna, Värmland)",
  III: "Mellansverige (t.ex. Stockholm, Uppsala, Östergötland, Västmanland)",
  IV: "Södra Sverige (t.ex. Skåne, Halland, Blekinge, Kalmar, Gotland)",
};

/** Län (Nominatim county / officiellt län-namn) → zon */
const LAN_TO_ZONE: Record<string, ClimateZone> = {
  // I
  "norrbottens län": "I",
  norrbotten: "I",
  "västerbottens län": "I",
  västerbotten: "I",
  "jämtlands län": "I",
  jämtland: "I",
  // II
  "västernorrlands län": "II",
  västernorrland: "II",
  "gävleborgs län": "II",
  gävleborg: "II",
  "dalarnas län": "II",
  dalarna: "II",
  "värmlands län": "II",
  värmland: "II",
  // III
  "stockholms län": "III",
  stockholm: "III",
  "uppsala län": "III",
  uppsala: "III",
  "södermanlands län": "III",
  södermanland: "III",
  "östergötlands län": "III",
  östergötland: "III",
  "örebro län": "III",
  örebro: "III",
  "västmanlands län": "III",
  västmanland: "III",
  "västra götalands län": "III",
  "västra götaland": "III",
  "gotlands län": "IV", // Gotland oftast IV i energisammanhang
  gotland: "IV",
  // IV
  "skåne län": "IV",
  skåne: "IV",
  "blekinge län": "IV",
  blekinge: "IV",
  "hallands län": "IV",
  halland: "IV",
  "kalmar län": "IV",
  kalmar: "IV",
  "kronobergs län": "IV",
  kronoberg: "IV",
  "jönköpings län": "IV",
  jönköping: "IV",
};

/**
 * Kommun → zon (overrides / när län saknas).
 * Fokus på vanliga kommuner; okända faller tillbaka till län.
 */
const MUNICIPALITY_TO_ZONE: Record<string, ClimateZone> = {
  // I
  luleå: "I",
  umeå: "I",
  skellefteå: "I",
  kiruna: "I",
  östersund: "I",
  // II
  sundsvall: "II",
  gävle: "II",
  falun: "II",
  borlänge: "II",
  karlstad: "II",
  // III
  stockholm: "III",
  "södertälje": "III",
  solna: "III",
  nacka: "III",
  uppsala: "III",
  västerås: "III",
  örebro: "III",
  linköping: "III",
  norrköping: "III",
  eskilstuna: "III",
  göteborg: "III",
  borås: "III",
  trollhättan: "III",
  // IV
  malmö: "IV",
  lund: "IV",
  helsingborg: "IV",
  kristianstad: "IV",
  halmstad: "IV",
  kalmar: "IV",
  växjö: "IV",
  jönköping: "IV",
  karlskrona: "IV",
  visby: "IV",
  gotland: "IV",
};

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+kommun$/i, "")
    .replace(/\s+stad$/i, "")
    .normalize("NFC");
}

/**
 * Föreslå klimatzon från kommun och/eller län.
 */
export function suggestClimateZone(input: {
  municipality?: string | null;
  county?: string | null;
}): { zone: ClimateZone | null; source: string | null; label: string | null } {
  const mun = input.municipality ? norm(input.municipality) : "";
  const county = input.county ? norm(input.county) : "";

  if (mun && MUNICIPALITY_TO_ZONE[mun]) {
    const zone = MUNICIPALITY_TO_ZONE[mun];
    return {
      zone,
      source: "kommun",
      label: `Zon ${zone} – ${CLIMATE_ZONE_HELP[zone]}`,
    };
  }

  if (county) {
    // try exact, with/without "län"
    const zone =
      LAN_TO_ZONE[county] ??
      LAN_TO_ZONE[`${county} län`] ??
      LAN_TO_ZONE[county.replace(/\s+län$/, "")];
    if (zone) {
      return {
        zone,
        source: "län",
        label: `Zon ${zone} – ${CLIMATE_ZONE_HELP[zone]}`,
      };
    }
  }

  // partial municipality match
  if (mun) {
    for (const [k, zone] of Object.entries(MUNICIPALITY_TO_ZONE)) {
      if (mun.includes(k) || k.includes(mun)) {
        return {
          zone,
          source: "kommun",
          label: `Zon ${zone} – ${CLIMATE_ZONE_HELP[zone]}`,
        };
      }
    }
  }

  return { zone: null, source: null, label: null };
}
