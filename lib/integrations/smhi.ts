/**
 * SMHI – klimat/väder → fysiska riskförslag.
 * Stub tills EXTERNAL_DATA_SMHI_ENABLED=true och live-klient implementeras.
 */

import type {
  ClimateHazardProvider,
  ClimateHazardResult,
  PropertyGeoContext,
} from "./types";
import { getExternalIntegrationConfig } from "./config";

function nowIso() {
  return new Date().toISOString();
}

export const smhiProvider: ClimateHazardProvider = {
  id: "smhi",

  async fetchHazards(ctx: PropertyGeoContext): Promise<ClimateHazardResult> {
    const { smhi } = getExternalIntegrationConfig();
    const fetchedAt = nowIso();

    if (!smhi.enabled) {
      return {
        source: "smhi",
        status: "disabled",
        fetchedAt,
        suggestions: [],
        message:
          "SMHI är avstängt (EXTERNAL_DATA_SMHI_ENABLED). Aktivera när API är konfigurerat.",
      };
    }

    if (ctx.latitude == null || ctx.longitude == null) {
      return {
        source: "smhi",
        status: "missing_coords",
        fetchedAt,
        suggestions: [],
        message:
          "Fastigheten saknar koordinater. Geokoda adress innan SMHI-anrop.",
      };
    }

    // Live: anropa SMHI Open Data med lat/lon, mappa till HazardSuggestion.
    // Stub: tom lista – ingen falsk risk skapas i production.
    return {
      source: "smhi",
      status: "stub",
      fetchedAt,
      suggestions: [],
      raw: {
        mode: "stub",
        lat: ctx.latitude,
        lon: ctx.longitude,
        note: "Replace with SMHI Open Data client",
      },
      message:
        "SMHI-stub aktiv. Live-hämtning av klimatindikatorer är inte inkopplad ännu.",
    };
  },
};
