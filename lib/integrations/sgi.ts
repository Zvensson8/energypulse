/**
 * SGI – mark/skred via SGU öppna WMS (samordnat underlag).
 */

import type {
  GeoHazardProvider,
  GeoHazardResult,
  PropertyGeoContext,
} from "./types";
import { getExternalIntegrationConfig } from "./config";
import { analyzeSgiPoint } from "./sgi-client";

function nowIso() {
  return new Date().toISOString();
}

export const sgiProvider: GeoHazardProvider = {
  id: "sgi",

  async fetchHazards(ctx: PropertyGeoContext): Promise<GeoHazardResult> {
    const { sgi } = getExternalIntegrationConfig();
    const fetchedAt = nowIso();

    if (!sgi.enabled) {
      return {
        source: "sgi",
        status: "disabled",
        fetchedAt,
        suggestions: [],
        message: "SGI är avstängt (EXTERNAL_DATA_SGI_ENABLED=false).",
      };
    }

    if (ctx.latitude == null || ctx.longitude == null) {
      return {
        source: "sgi",
        status: "missing_coords",
        fetchedAt,
        suggestions: [],
        message: "Saknar koordinater för skred-uppslag.",
      };
    }

    try {
      const analysis = await analyzeSgiPoint(ctx.latitude, ctx.longitude);
      return {
        source: "sgi",
        status: "ok",
        fetchedAt: analysis.fetchedAt,
        suggestions: analysis.suggestions,
        raw: {
          inAktsamhetsomrade: analysis.inAktsamhetsomrade,
          label: analysis.label,
          method: analysis.method,
          rawFeatureCount: analysis.rawFeatureCount,
          layer: "SGU förutsättning skred finkornig jordart",
        },
        message: analysis.inAktsamhetsomrade
          ? `SGI/SGU: aktsamhetsområde skred – ${analysis.label ?? "träff"}.`
          : "SGI/SGU: ingen träff i aktsamhetsområde för skred vid punkten (lager har begränsad yttäckning).",
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Okänt SGI/SGU-fel";
      return {
        source: "sgi",
        status: "error",
        fetchedAt,
        suggestions: [],
        message: `SGI/SGU-anrop misslyckades: ${msg}`,
      };
    }
  },
};
