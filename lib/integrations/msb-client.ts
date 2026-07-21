/**
 * MSB översvämningskartering – öppna ArcGIS REST (ingen API-nyckel).
 * https://gisapp.msb.se/Apps/oversvamningsportal/
 *
 * Performance notes:
 * - River identify with few layers: ~1–3 s
 * - Coast identify with many layers: 20–40 s+ (often timeouts)
 * - Coast with ONE layer at a time: ~4 s → we sample 2.0 m then refine
 * - Partial success: river/coast independent
 */

import type { HazardSuggestion, RiskLevel } from "./types";
import { toWebMercator } from "./geo-utils";

const RIVER_URL =
  "https://gisapp.msb.se/arcgis/rest/services/Oversvamningskarteringar/karteringar/MapServer";
const COAST_URL =
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

const RIVER_LAYER_IDS = "visible:2,3,4,5,6,15";

/**
 * Coastal MapServer: layer id N ≈ (N+1)/10 m RH2000
 * 9 → 1.0 m, 19 → 2.0 m, 29 → 3.0 m
 */
const COAST_LEVELS = {
  m1: { id: 9, meters: 1.0 },
  m2: { id: 19, meters: 2.0 },
  m3: { id: 29, meters: 3.0 },
} as const;

type IdentifyHit = {
  layerId: number;
  layerName: string;
  attributes?: Record<string, unknown>;
};

type IdentifyResult = {
  results?: IdentifyHit[];
  error?: { message?: string };
};

function levelFromScore(score: number): RiskLevel {
  if (score >= 4) return "very_high";
  if (score >= 3) return "high";
  if (score >= 2) return "medium";
  return "low";
}

function isTimeoutError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const m = e.message.toLowerCase();
  return (
    m.includes("timeout") ||
    m.includes("aborted") ||
    e.name === "TimeoutError" ||
    e.name === "AbortError"
  );
}

async function identifyOnce(
  mapServer: string,
  lon: number,
  lat: number,
  layers: string,
  opts: { padM: number; tolerance: number; timeoutMs: number }
): Promise<IdentifyHit[]> {
  const { x, y } = toWebMercator(lon, lat);
  const pad = opts.padM;
  const params = new URLSearchParams({
    geometry: `${x},${y}`,
    geometryType: "esriGeometryPoint",
    sr: "3857",
    layers,
    tolerance: String(opts.tolerance),
    mapExtent: `${x - pad},${y - pad},${x + pad},${y + pad}`,
    imageDisplay: "200,200,96",
    returnGeometry: "false",
    f: "json",
  });

  const res = await fetch(`${mapServer}/identify?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(opts.timeoutMs),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`MSB HTTP ${res.status}`);
  }

  const data = (await res.json()) as IdentifyResult;
  if (data.error?.message) {
    throw new Error(data.error.message);
  }
  return data.results ?? [];
}

async function identifyWithRetry(
  mapServer: string,
  lon: number,
  lat: number,
  layers: string,
  opts: { padM: number; tolerance: number; timeoutMs: number }
): Promise<IdentifyHit[]> {
  try {
    return await identifyOnce(mapServer, lon, lat, layers, opts);
  } catch (e) {
    if (!isTimeoutError(e) && !(e instanceof TypeError)) throw e;
    return await identifyOnce(mapServer, lon, lat, layers, {
      ...opts,
      timeoutMs: Math.min(opts.timeoutMs + 12_000, 45_000),
    });
  }
}

/**
 * Coast: sample one layer at a time (multi-layer identify is too slow).
 * 1) 2.0 m screen  2) if hit → 1.0 m severity  3) if miss → 3.0 m lower severity
 */
async function analyzeCoast(
  lon: number,
  lat: number
): Promise<{ minM: number | null; hits: number; layersTried: number[] }> {
  const base = {
    padM: 1500,
    tolerance: 6,
    timeoutMs: 15_000,
  };
  const layersTried: number[] = [];

  const probe = async (layerId: number) => {
    layersTried.push(layerId);
    const hits = await identifyWithRetry(
      COAST_URL,
      lon,
      lat,
      `visible:${layerId}`,
      base
    );
    return hits.length > 0;
  };

  // Screen at 2.0 m (most useful climate/planning threshold)
  const hit2 = await probe(COAST_LEVELS.m2.id);
  if (hit2) {
    // Refine: is it already under water at 1.0 m?
    try {
      const hit1 = await probe(COAST_LEVELS.m1.id);
      return {
        minM: hit1 ? COAST_LEVELS.m1.meters : COAST_LEVELS.m2.meters,
        hits: hit1 ? 2 : 1,
        layersTried,
      };
    } catch {
      return { minM: COAST_LEVELS.m2.meters, hits: 1, layersTried };
    }
  }

  // Not at 2.0 m – check 3.0 m for lower severity coastal exposure
  try {
    const hit3 = await probe(COAST_LEVELS.m3.id);
    if (hit3) {
      return { minM: COAST_LEVELS.m3.meters, hits: 1, layersTried };
    }
  } catch {
    // ignore – treat as no coastal hit
  }

  return { minM: null, hits: 0, layersTried };
}

export type MsbAnalysis = {
  riverHits: Array<{ layerId: number; layerName: string; kartering?: string }>;
  coastMinM: number | null;
  coastHits: number;
  suggestions: HazardSuggestion[];
  fetchedAt: string;
  warnings: string[];
};

export async function analyzeMsbPoint(
  lat: number,
  lon: number
): Promise<MsbAnalysis> {
  const fetchedAt = new Date().toISOString();
  const suggestions: HazardSuggestion[] = [];
  const warnings: string[] = [];

  const riverP = identifyWithRetry(RIVER_URL, lon, lat, RIVER_LAYER_IDS, {
    padM: 2500,
    tolerance: 12,
    timeoutMs: 18_000,
  }).then(
    (r) => ({ ok: true as const, results: r }),
    (e: unknown) => ({
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
    })
  );

  const coastP = analyzeCoast(lon, lat).then(
    (r) => ({ ok: true as const, ...r }),
    (e: unknown) => ({
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
    })
  );

  const [riverOut, coastOut] = await Promise.all([riverP, coastP]);

  if (!riverOut.ok && !coastOut.ok) {
    throw new Error(
      `Vattendrag: ${riverOut.error}; Kust: ${"error" in coastOut ? coastOut.error : "okänt"}`
    );
  }

  const riverResults = riverOut.ok ? riverOut.results : [];
  if (!riverOut.ok) warnings.push(`Vattendrag: ${riverOut.error}`);
  if (!coastOut.ok) warnings.push(`Kust: ${coastOut.error}`);

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

  const coastMinM = coastOut.ok ? coastOut.minM : null;
  const coastHits = coastOut.ok ? coastOut.hits : 0;

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
    coastHits,
    suggestions,
    fetchedAt,
    warnings,
  };
}
