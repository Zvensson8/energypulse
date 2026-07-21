/**
 * MSB – översvämning (vattendrag + kust) via öppna ArcGIS REST.
 */

import type {
  GeoHazardProvider,
  GeoHazardResult,
  PropertyGeoContext,
} from "./types";
import { getExternalIntegrationConfig } from "./config";
import { analyzeMsbPoint } from "./msb-client";

function nowIso() {
  return new Date().toISOString();
}

export const msbProvider: GeoHazardProvider = {
  id: "msb",

  async fetchHazards(ctx: PropertyGeoContext): Promise<GeoHazardResult> {
    const { msb } = getExternalIntegrationConfig();
    const fetchedAt = nowIso();

    if (!msb.enabled) {
      return {
        source: "msb",
        status: "disabled",
        fetchedAt,
        suggestions: [],
        message:
          "MSB är avstängt (EXTERNAL_DATA_MSB_ENABLED=false).",
      };
    }

    if (ctx.latitude == null || ctx.longitude == null) {
      return {
        source: "msb",
        status: "missing_coords",
        fetchedAt,
        suggestions: [],
        message: "Saknar koordinater för MSB-uppslag.",
      };
    }

    try {
      const analysis = await analyzeMsbPoint(ctx.latitude, ctx.longitude);
      const n = analysis.suggestions.length;
      return {
        source: "msb",
        status: "ok",
        fetchedAt: analysis.fetchedAt,
        suggestions: analysis.suggestions,
        raw: {
          riverHits: analysis.riverHits,
          coastMinM: analysis.coastMinM,
          coastHits: analysis.coastHits,
        },
        message:
          n > 0
            ? `MSB: ${n} översvämningsindikator(er) (vattendrag/kust).`
            : "MSB: ingen träff i karterade flöden/kustnivåer vid punkten (kartering saknas eller plats utanför utbredning).",
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Okänt MSB-fel";
      return {
        source: "msb",
        status: "error",
        fetchedAt,
        suggestions: [],
        message: `MSB-anrop misslyckades: ${msg}`,
      };
    }
  },
};
