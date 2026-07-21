/**
 * GSI – geodata / markrisk (skred, sättning).
 * Namnet "GSI" är konfigurerbart; stub tills EXTERNAL_DATA_GSI_ENABLED + endpoint.
 */

import type {
  GeoHazardProvider,
  GeoHazardResult,
  PropertyGeoContext,
} from "./types";
import { getExternalIntegrationConfig } from "./config";

function nowIso() {
  return new Date().toISOString();
}

export const gsiProvider: GeoHazardProvider = {
  id: "gsi",

  async fetchHazards(ctx: PropertyGeoContext): Promise<GeoHazardResult> {
    const { gsi } = getExternalIntegrationConfig();
    const fetchedAt = nowIso();

    if (!gsi.enabled) {
      return {
        source: "gsi",
        status: "disabled",
        fetchedAt,
        suggestions: [],
        message:
          "GSI är avstängt (EXTERNAL_DATA_GSI_ENABLED). Avsett för mark/skred/sättning (t.ex. SGI/SGU-lager).",
      };
    }

    if (ctx.latitude == null || ctx.longitude == null) {
      return {
        source: "gsi",
        status: "missing_coords",
        fetchedAt,
        suggestions: [],
        message: "Saknar koordinater för geohazard-uppslag.",
      };
    }

    return {
      source: "gsi",
      status: "stub",
      fetchedAt,
      suggestions: [],
      raw: {
        mode: "stub",
        lat: ctx.latitude,
        lon: ctx.longitude,
        apiUrl: gsi.apiUrl,
        note: "Wire GSI_API_URL / provider (SGI, SGU, commercial) here",
      },
      message:
        "GSI-stub aktiv. Koppla GSI_API_URL när leverantör och licens är klara.",
    };
  },
};
