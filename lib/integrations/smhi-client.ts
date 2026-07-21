/**
 * SMHI Open Data – Meteorological Observations (metobs).
 * https://opendata-download-metobs.smhi.se
 *
 * No API key required. We resolve nearest active station(s) and pull
 * latest-months series for temperature, wind and precipitation.
 */

import type { HazardSuggestion, RiskLevel } from "./types";

const METOBS = "https://opendata-download-metobs.smhi.se/api/version/1.0";

/** SMHI parameter ids (metobs) */
const PARAM = {
  /** Air temperature hour */
  temp: 1,
  /** Wind speed */
  wind: 4,
  /** Precipitation amount */
  precip: 5,
  /** Wind gust */
  gust: 21,
} as const;

export type SmhiStation = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  active: boolean;
};

export type SmhiSeriesPoint = {
  date: number;
  value: number;
  quality?: string;
};

export type SmhiAnalysis = {
  station: {
    temp: SmhiStation | null;
    wind: SmhiStation | null;
    precip: SmhiStation | null;
  };
  stats: {
    tempMax: number | null;
    tempMin: number | null;
    tempMean: number | null;
    hotDaysGe25: number;
    windMax: number | null;
    gustMax: number | null;
    precipSumMm: number | null;
    precipMaxDayMm: number | null;
    sampleCount: number;
  };
  suggestions: HazardSuggestion[];
  fetchedAt: string;
};

type StationListCache = {
  at: number;
  stations: SmhiStation[];
};

const stationCache = new Map<number, StationListCache>();
const CACHE_MS = 6 * 60 * 60 * 1000; // 6h

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    // Next.js / Node fetch
    next: { revalidate: 0 },
  } as RequestInit);
  if (!res.ok) {
    throw new Error(`SMHI HTTP ${res.status} för ${url}`);
  }
  return (await res.json()) as T;
}

async function loadStations(parameterId: number): Promise<SmhiStation[]> {
  const cached = stationCache.get(parameterId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.stations;

  const data = await fetchJson<{
    station?: Array<{
      id: number;
      name: string;
      latitude: number;
      longitude: number;
      active: boolean;
    }>;
  }>(`${METOBS}/parameter/${parameterId}.json`);

  const stations = (data.station ?? [])
    .filter((s) => s.active && s.latitude != null && s.longitude != null)
    .map((s) => ({
      id: s.id,
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      active: s.active,
    }));

  stationCache.set(parameterId, { at: Date.now(), stations });
  return stations;
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function findNearestStation(
  stations: SmhiStation[],
  lat: number,
  lon: number
): SmhiStation | null {
  let best: SmhiStation | null = null;
  let bestD = Infinity;
  for (const s of stations) {
    const d = haversineKm(lat, lon, s.latitude, s.longitude);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

async function loadLatestMonths(
  parameterId: number,
  stationId: number
): Promise<SmhiSeriesPoint[]> {
  const url = `${METOBS}/parameter/${parameterId}/station/${stationId}/period/latest-months/data.json`;
  try {
    const data = await fetchJson<{
      value?: Array<{ date: number; value: string; quality?: string }>;
    }>(url);
    return (data.value ?? [])
      .map((v) => ({
        date: v.date,
        value: Number(v.value),
        quality: v.quality,
      }))
      .filter((v) => Number.isFinite(v.value));
  } catch {
    // fallback latest-day
    try {
      const data = await fetchJson<{
        value?: Array<{ date: number; value: string; quality?: string }>;
      }>(
        `${METOBS}/parameter/${parameterId}/station/${stationId}/period/latest-day/data.json`
      );
      return (data.value ?? [])
        .map((v) => ({
          date: v.date,
          value: Number(v.value),
          quality: v.quality,
        }))
        .filter((v) => Number.isFinite(v.value));
    } catch {
      return [];
    }
  }
}

function maxOf(xs: number[]): number | null {
  if (!xs.length) return null;
  return Math.max(...xs);
}
function minOf(xs: number[]): number | null {
  if (!xs.length) return null;
  return Math.min(...xs);
}
function meanOf(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Daily max aggregation for hourly series */
function dailyMax(points: SmhiSeriesPoint[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of points) {
    const day = new Date(p.date).toISOString().slice(0, 10);
    const prev = m.get(day);
    if (prev == null || p.value > prev) m.set(day, p.value);
  }
  return m;
}

function dailySum(points: SmhiSeriesPoint[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of points) {
    const day = new Date(p.date).toISOString().slice(0, 10);
    m.set(day, (m.get(day) ?? 0) + p.value);
  }
  return m;
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 4) return "very_high";
  if (score >= 3) return "high";
  if (score >= 2) return "medium";
  return "low";
}

/**
 * Fetch SMHI latest-months near lat/lon and map to hazard suggestions.
 */
export async function analyzeSmhiPoint(
  lat: number,
  lon: number
): Promise<SmhiAnalysis> {
  const fetchedAt = new Date().toISOString();

  const [tempStations, windStations, precipStations] = await Promise.all([
    loadStations(PARAM.temp),
    loadStations(PARAM.wind),
    loadStations(PARAM.precip),
  ]);

  const tempSt = findNearestStation(tempStations, lat, lon);
  const windSt = findNearestStation(windStations, lat, lon);
  const precipSt = findNearestStation(precipStations, lat, lon);

  const [temps, winds, precip, gusts] = await Promise.all([
    tempSt ? loadLatestMonths(PARAM.temp, tempSt.id) : Promise.resolve([]),
    windSt ? loadLatestMonths(PARAM.wind, windSt.id) : Promise.resolve([]),
    precipSt
      ? loadLatestMonths(PARAM.precip, precipSt.id)
      : Promise.resolve([]),
    windSt ? loadLatestMonths(PARAM.gust, windSt.id) : Promise.resolve([]),
  ]);

  const tempVals = temps.map((t) => t.value);
  const windVals = winds.map((t) => t.value);
  const gustVals = gusts.map((t) => t.value);
  const precipVals = precip.map((t) => t.value);

  const dayMaxT = dailyMax(temps);
  const hotDaysGe25 = [...dayMaxT.values()].filter((v) => v >= 25).length;
  const dayPrecip = dailySum(precip);
  const precipMaxDay = maxOf([...dayPrecip.values()]);
  const precipSum = precipVals.length
    ? precipVals.reduce((a, b) => a + b, 0)
    : null;

  const stats = {
    tempMax: maxOf(tempVals),
    tempMin: minOf(tempVals),
    tempMean: meanOf(tempVals),
    hotDaysGe25,
    windMax: maxOf(windVals),
    gustMax: maxOf(gustVals),
    precipSumMm: precipSum,
    precipMaxDayMm: precipMaxDay,
    sampleCount: tempVals.length + windVals.length + precipVals.length,
  };

  const suggestions: HazardSuggestion[] = [];
  const stLabel = tempSt?.name ?? windSt?.name ?? precipSt?.name ?? "närmaste station";

  // --- Heat ---
  if (stats.tempMax != null) {
    let heatScore = 0;
    if (stats.tempMax >= 32) heatScore = 4;
    else if (stats.tempMax >= 30) heatScore = 3;
    else if (stats.tempMax >= 28) heatScore = 2;
    else if (stats.tempMax >= 25 || hotDaysGe25 >= 5) heatScore = 1;

    if (heatScore >= 2) {
      const probability = levelFromScore(heatScore);
      const consequence: RiskLevel =
        heatScore >= 3 ? "high" : heatScore >= 2 ? "medium" : "low";
      suggestions.push({
        risk_type: "heat",
        probability,
        consequence,
        summary: `SMHI (${stLabel}): max ${stats.tempMax.toFixed(1)} °C senaste månaderna, ${hotDaysGe25} dygn ≥25 °C. Värmebelastning kan påverka inomhusklimat och kylbehov.`,
        sourceRef: `smhi:metobs:temp:station:${tempSt?.id ?? "na"}`,
        confidence: tempVals.length > 100 ? "high" : "medium",
      });
    }
  }

  // --- Storm / wind ---
  const windPeak = Math.max(stats.windMax ?? 0, stats.gustMax ?? 0);
  if (windPeak > 0) {
    let windScore = 0;
    // m/s thresholds (approx Beaufort)
    if (windPeak >= 25) windScore = 4; // ~storm
    else if (windPeak >= 21) windScore = 3;
    else if (windPeak >= 14) windScore = 2; // strong breeze+
    else if (windPeak >= 11) windScore = 1;

    if (windScore >= 2) {
      suggestions.push({
        risk_type: "storm",
        probability: levelFromScore(windScore),
        consequence: windScore >= 3 ? "high" : "medium",
        summary: `SMHI (${windSt?.name ?? stLabel}): max vind ${stats.windMax?.toFixed(1) ?? "—"} m/s${stats.gustMax != null ? `, byar ${stats.gustMax.toFixed(1)} m/s` : ""} under senaste perioden. Ökad risk för stormskador på fasad/tak.`,
        sourceRef: `smhi:metobs:wind:station:${windSt?.id ?? "na"}`,
        confidence: windVals.length > 50 ? "high" : "medium",
      });
    }
  }

  // --- Flood / heavy rain (proxy via precip) ---
  if (stats.precipMaxDayMm != null || stats.precipSumMm != null) {
    let rainScore = 0;
    const dayMax = stats.precipMaxDayMm ?? 0;
    const sum = stats.precipSumMm ?? 0;
    if (dayMax >= 40 || sum >= 150) rainScore = 4;
    else if (dayMax >= 25 || sum >= 100) rainScore = 3;
    else if (dayMax >= 15 || sum >= 60) rainScore = 2;
    else if (dayMax >= 10) rainScore = 1;

    if (rainScore >= 2) {
      suggestions.push({
        risk_type: "flood",
        probability: levelFromScore(rainScore),
        consequence: rainScore >= 3 ? "high" : "medium",
        summary: `SMHI (${precipSt?.name ?? stLabel}): nederbörd max ca ${dayMax.toFixed(1)} mm/dygn, summa ${sum.toFixed(0)} mm (senaste perioden). Förhöjd risk för dagvatten/översvämning – granska lokala förhållanden.`,
        sourceRef: `smhi:metobs:precip:station:${precipSt?.id ?? "na"}`,
        confidence: precipVals.length > 30 ? "medium" : "low",
      });
    }
  }

  return {
    station: { temp: tempSt, wind: windSt, precip: precipSt },
    stats,
    suggestions,
    fetchedAt,
  };
}
