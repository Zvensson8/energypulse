/**
 * Boverket – klimatzon / normkontext.
 * Stub: återanvänder lokal zon-heuristik när enabled, annars disabled.
 */

import type {
  BuildingNormProvider,
  BuildingNormResult,
  PropertyGeoContext,
} from "./types";
import { getExternalIntegrationConfig } from "./config";
import { suggestClimateZone } from "@/lib/geo/climate-zones";

function nowIso() {
  return new Date().toISOString();
}

export const boverketProvider: BuildingNormProvider = {
  id: "boverket",

  async fetchNorms(ctx: PropertyGeoContext): Promise<BuildingNormResult> {
    const { boverket } = getExternalIntegrationConfig();
    const fetchedAt = nowIso();

    if (!boverket.enabled) {
      return {
        source: "boverket",
        status: "disabled",
        fetchedAt,
        suggestedClimateZone: null,
        notes: [],
        message:
          "Boverket är avstängt (EXTERNAL_DATA_BOVERKET_ENABLED). Lokal zon-mappning används i formulär.",
      };
    }

    // Stub: samma kommun→zon-heuristik som formuläret (inte live Boverket-API).
    const { zone, source, label } = suggestClimateZone({
      municipality: ctx.municipality,
    });

    return {
      source: "boverket",
      status: "stub",
      fetchedAt,
      suggestedClimateZone: zone,
      notes: [
        zone
          ? `Stub föreslår klimatzon ${zone} (${source}: ${label}).`
          : "Kunde inte härleda zon från kommun – sätt manuellt.",
        "Framtida live-källa: Boverkets öppna data / officiell zontabell.",
      ],
      raw: { mode: "stub", municipality: ctx.municipality, zone, source },
      message: "Boverket-stub: zonförslag via lokal heuristik.",
    };
  },
};
