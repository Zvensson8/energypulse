/**
 * Boverket – öppna data: DVUT + klimatzon (ingen avtals-API).
 */

import type {
  BuildingNormProvider,
  BuildingNormResult,
  PropertyGeoContext,
} from "./types";
import { getExternalIntegrationConfig } from "./config";
import { analyzeBoverketContext } from "./boverket-client";

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
          "Boverket är avstängt (EXTERNAL_DATA_BOVERKET_ENABLED=false).",
      };
    }

    try {
      const analysis = await analyzeBoverketContext({
        latitude: ctx.latitude,
        longitude: ctx.longitude,
        municipality: ctx.municipality,
      });

      return {
        source: "boverket",
        status: "ok",
        fetchedAt: analysis.fetchedAt,
        suggestedClimateZone: analysis.climateZone,
        notes: analysis.notes,
        raw: {
          zoneSource: analysis.zoneSource,
          zoneLabel: analysis.zoneLabel,
          nearestDvut: analysis.nearestDvut,
        },
        message: analysis.nearestDvut
          ? `Boverket: zon ${analysis.climateZone ?? "—"}, DVUT via ${analysis.nearestDvut.name}.`
          : `Boverket: klimatzon ${analysis.climateZone ?? "okänd"} (DVUT kräver koordinater).`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Okänt Boverket-fel";
      return {
        source: "boverket",
        status: "error",
        fetchedAt,
        suggestedClimateZone: null,
        notes: [],
        message: `Boverket-anrop misslyckades: ${msg}`,
      };
    }
  },
};
