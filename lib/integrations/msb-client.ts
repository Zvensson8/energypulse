/**
 * MSB översvämningskartering – öppna ArcGIS REST (ingen API-nyckel).
 * https://gisapp.msb.se/Apps/oversvamningsportal/
 *
 * - Vattendrag: 100/200-årsflöde, beräknat högsta, klimatanpassade flöden
 * - Kust: utbredning vid havsvattenstånd 0,1–5,0 m RH2000
 */

import type { HazardSuggestion, RiskLevel } from "./types";
import { fetchJson, toWebMercator } from "./geo-utils";

const RIVER =
  "https://gisapp.msb.se/arcgis/rest/services/Oversvamningskarteringar/karteringar/MapServer";
const COAST =
  "https://gisapp.msb.se/arcgis/rest/services/Oversvamningskarteringar/kustoversvamning/MapServer";

/** Layer ids of interest on river MapServer */
const RIVER_LAYERS = {
  2: { key: "100y", label: "100-årsflöde", score: 3 },
  3: {
    key: "100y_climate",
    label: "100-årsflöde (klimatanpassat, sekelslut)",
    score: 3,
  },
  4: {
    key: "200y_climate",
    label: "200-årsflöde (klimatanpassat, sekelslut)",
    score: 4,
  },
  15: { key: "1000y", label: "1000-årsflöde", score: 4 },
  5: { key: "highest", label: "Beräknat högsta flöde", score: 2 },
  6: {
    key: "highest_climate",
    label: "Beräknat högsta flöde (klimatanpassat)",
    score: 3,
  },
} as const;

type IdentifyResult = {
  results?: Array<{
    layerId: number;
    layerName: string;
    attributes?: Record<string, unknown>;
  }>;
  error?: { message?: string };
};

function levelFromScore(score: number): RiskLevel {
  if (score >= 4) return "very_high";
  if (score >= 3) return "high";
  if (score >= 2) return "medium";
  return "low";
}

async function identify(
  mapServer: string,
  lon: number,
  lat: number,
  layers: string,
  padM = 2500,
  tolerance = 12
): Promise<IdentifyResult["results"]> {
  const { x, y } = toWebMercator(lon, lat);
  const params = new URLSearchParams({
    geometry: JSON.stringify({ x, y }),
    geometryType: "esriGeometryPoint",
    sr: "3857",
    layers,
    tolerance: String(tolerance),
    mapExtent: `${x - padM},${y - padM},${x + padM},${y + padM}`,
    imageDisplay: "800,600,96",
    returnGeometry: "false",
    f: "json",
  });
  const data = await fetchJson<IdentifyResult>(
    `${mapServer}/identify?${params}`,
    { timeoutMs: 50_000 }
  );
  if (data.error?.message) {
    throw new Error(data.error.message);
  }
  return data.results ?? [];
}

export type MsbAnalysis = {
  riverHits: Array<{ layerId: number; layerName: string; kartering?: string }>;
  /** Lowest coastal water level (m) where point is inundated, if any */
  coastMinM: number | null;
  coastHits: number;
  suggestions: HazardSuggestion[];
  fetchedAt: string;
};

export async function analyzeMsbPoint(
  lat: number,
  lon: number
): Promise<MsbAnalysis> {
  const fetchedAt = new Date().toISOString();
  const suggestions: HazardSuggestion[] = [];

  const [riverRaw, coastRaw] = await Promise.all([
    identify(RIVER, lon, lat, "all", 3000, 15),
    identify(
      COAST,
      lon,
      lat,
      // Sample every 0.5 m from 0.5–4.0 m to keep payload small
      "visible:4,9,14,19,24,29,34,39",
      2000,
      8
    ),
  ]);
  const riverResults = riverRaw ?? [];
  const coastResults = coastRaw ?? [];

  const riverHits: MsbAnalysis["riverHits"] = [];
  let bestRiverScore = 0;
  const riverLabels: string[] = [];

  for (const r of riverResults) {
    const meta = RIVER_LAYERS[r.layerId as keyof typeof RIVER_LAYERS];
    if (!meta) continue;
    const kartering = r.attributes?.Kartering
      ? String(r.attributes.Kartering)
      : undefined;
    riverHits.push({
      layerId: r.layerId,
      layerName: r.layerName,
      kartering,
    });
    if (meta.score > bestRiverScore) bestRiverScore = meta.score;
    riverLabels.push(
      kartering ? `${meta.label} (${kartering})` : meta.label
    );
  }

  if (bestRiverScore >= 2) {
    suggestions.push({
      risk_type: "flood",
      probability: levelFromScore(bestRiverScore),
      consequence: bestRiverScore >= 3 ? "high" : "medium",
      summary: `MSB översvämningskartering (vattendrag): träff på ${riverLabels.join("; ")}. Granska kartering och lokal topografi innan åtgärd.`,
      sourceRef: `msb:river:${riverHits.map((h) => h.layerId).join(",")}`,
      confidence: "medium",
    });
  }

  // Coastal: layer id N ≈ (N+1)/10 m  (id 0 = 0.1 m, id 9 = 1.0 m, id 19 = 2.0 m)
  let coastMinM: number | null = null;
  for (const r of coastResults) {
    const m = Math.round((r.layerId + 1) * 10) / 100; // 0.1, 0.2, …
    if (coastMinM == null || m < coastMinM) coastMinM = m;
  }

  // Also parse layer name like "2,0 m" if present
  for (const r of coastResults) {
    const match = String(r.layerName).match(/(\d+)[,.](\d+)\s*m/i);
    if (match) {
      const m = Number(`${match[1]}.${match[2]}`);
      if (Number.isFinite(m) && (coastMinM == null || m < coastMinM)) {
        coastMinM = m;
      }
    }
  }

  if (coastMinM != null) {
    let score = 1;
    if (coastMinM <= 1.0) score = 4;
    else if (coastMinM <= 1.5) score = 3;
    else if (coastMinM <= 2.5) score = 2;
    else score = 1;

    if (score >= 2) {
      suggestions.push({
        risk_type: "flood",
        probability: levelFromScore(score),
        consequence: score >= 3 ? "high" : "medium",
        summary: `MSB kustöversvämning: platsen ligger inom utbredning från ca ${coastMinM.toFixed(1)} m havsvattenstånd (RH2000). Klimatdriven havsnivåhöjning kan öka exponering.`,
        sourceRef: `msb:coast:minm:${coastMinM.toFixed(1)}`,
        confidence: "medium",
      });
    }
  }

  return {
    riverHits,
    coastMinM,
    coastHits: coastResults.length,
    suggestions,
    fetchedAt,
  };
}
