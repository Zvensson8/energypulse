/**
 * SMHI – klimat/väder → fysiska riskförslag (live via Open Data metobs).
 */

import type {
  ClimateHazardProvider,
  ClimateHazardResult,
  PropertyGeoContext,
} from "./types";
import { getExternalIntegrationConfig } from "./config";
import { analyzeSmhiPoint } from "./smhi-client";

function nowIso() {
  return new Date().toISOString();
}

export const smhiProvider: ClimateHazardProvider = {
  id: "smhi",

  async fetchHazards(ctx: PropertyGeoContext): Promise<ClimateHazardResult> {
    const { smhi } = getExternalIntegrationConfig();
    const fetchedAt = nowIso();

    // Open data – enabled by default unless explicitly disabled
    if (!smhi.enabled) {
      return {
        source: "smhi",
        status: "disabled",
        fetchedAt,
        suggestions: [],
        message:
          "SMHI är avstängt (EXTERNAL_DATA_SMHI_ENABLED=false). Sätt true eller ta bort flaggan för att aktivera.",
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

    try {
      const analysis = await analyzeSmhiPoint(ctx.latitude, ctx.longitude);
      const st =
        analysis.station.temp?.name ??
        analysis.station.wind?.name ??
        analysis.station.precip?.name;

      return {
        source: "smhi",
        status: "ok",
        fetchedAt: analysis.fetchedAt,
        suggestions: analysis.suggestions,
        raw: {
          mode: "live",
          lat: ctx.latitude,
          lon: ctx.longitude,
          stations: analysis.station,
          stats: analysis.stats,
        },
        message:
          analysis.suggestions.length > 0
            ? `SMHI: ${analysis.suggestions.length} riskförslag från observationer nära ${st ?? "platsen"} (senaste månaderna).`
            : `SMHI: data hämtad (${st ?? "station"}). Inga tröskelvärden överskridna för värme/vind/nederbörd i perioden – inga automatiska riskförslag.`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Okänt SMHI-fel";
      return {
        source: "smhi",
        status: "error",
        fetchedAt,
        suggestions: [],
        message: `SMHI-anrop misslyckades: ${msg}`,
        raw: { error: msg },
      };
    }
  },
};
