/**
 * SGI-spåret: samordnat kartunderlag ras/skred/erosion.
 * Öppen data via SGU GeoServer WMS GetFeatureInfo (ingen API-nyckel).
 *
 * Lager: förutsättning för skred i finkornig jordart (aktsamhetsområde).
 * Källa: SGU öppna geodata – ingår i SGI/SGU/MSB m.fl. samordnade underlag.
 * https://www.sgu.se/samhallsplanering/risker/skred-och-ras/
 */

import type { HazardSuggestion } from "./types";

const WMS = "https://maps3.sgu.se/geoserver/ows";
const LAYER = "misc:SE.GOV.SGU.FORUTSATTNING_SKRED_FINKORNING_JORDART";

type GfiFeature = {
  properties?: {
    aktskre?: number | string;
    aktskre_tx?: string;
    metod?: string;
    [key: string]: unknown;
  };
};

type GfiResponse = {
  type?: string;
  features?: GfiFeature[];
};

export type SgiAnalysis = {
  inAktsamhetsomrade: boolean;
  label: string | null;
  method: string | null;
  suggestions: HazardSuggestion[];
  fetchedAt: string;
  rawFeatureCount: number;
};

async function getFeatureInfo(
  lon: number,
  lat: number,
  halfDeg = 0.015
): Promise<GfiResponse> {
  // WMS 1.3.0 + EPSG:4326: axis order is latitude, longitude
  const bbox = `${lat - halfDeg},${lon - halfDeg},${lat + halfDeg},${lon + halfDeg}`;
  const u = new URL(WMS);
  u.searchParams.set("SERVICE", "WMS");
  u.searchParams.set("VERSION", "1.3.0");
  u.searchParams.set("REQUEST", "GetFeatureInfo");
  u.searchParams.set("LAYERS", LAYER);
  u.searchParams.set("QUERY_LAYERS", LAYER);
  u.searchParams.set("CRS", "EPSG:4326");
  u.searchParams.set("BBOX", bbox);
  u.searchParams.set("WIDTH", "101");
  u.searchParams.set("HEIGHT", "101");
  u.searchParams.set("I", "50");
  u.searchParams.set("J", "50");
  u.searchParams.set("INFO_FORMAT", "application/json");
  u.searchParams.set("FEATURE_COUNT", "5");

  const res = await fetch(u.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(60_000),
    next: { revalidate: 0 },
  } as RequestInit);

  if (!res.ok) {
    throw new Error(`SGU WMS HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text.trim().startsWith("{")) {
    throw new Error(`SGU WMS oväntat svar: ${text.slice(0, 120)}`);
  }
  return JSON.parse(text) as GfiResponse;
}

/**
 * Point-in-layer check for skred aktsamhetsområde.
 */
export async function analyzeSgiPoint(
  lat: number,
  lon: number
): Promise<SgiAnalysis> {
  const fetchedAt = new Date().toISOString();
  const data = await getFeatureInfo(lon, lat);
  const features = data.features ?? [];
  const hit = features.find((f) => {
    const v = f.properties?.aktskre;
    return v === 1 || v === "1" || Number(v) === 1;
  });

  const suggestions: HazardSuggestion[] = [];
  const label = hit?.properties?.aktskre_tx
    ? String(hit.properties.aktskre_tx)
    : null;
  const method = hit?.properties?.metod
    ? String(hit.properties.metod)
    : null;

  if (hit) {
    suggestions.push({
      // ENUM has no landslide – use other with clear text
      risk_type: "other",
      probability: "medium",
      consequence: "high",
      summary: `SGI/SGU aktsamhetsområde: ${label ?? "skred i finkornig jordart"}${method ? ` (${method})` : ""}. Indikerar geoteknisk förutsättning – kräver lokal utredning, inte automatisk skredrisk.`,
      sourceRef: "sgi:sgu:forutsattning-skred-finkornig",
      confidence: "medium",
    });
  }

  return {
    inAktsamhetsomrade: Boolean(hit),
    label,
    method,
    suggestions,
    fetchedAt,
    rawFeatureCount: features.length,
  };
}
