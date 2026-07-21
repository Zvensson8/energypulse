/**
 * Boverket öppna data (utan avtals-API):
 * - DVUT 1991–2020 (CSV, Boverket/SMHI) – närmaste ort
 * - Klimatzon I–IV via lokal mappning (Boverket-aligned)
 *
 * Energideklarations-API kräver avtal och anropas inte.
 * Klimatlaster-API (Azure APIM) kräver registrering – utelämnas.
 */

import { haversineKm } from "./geo-utils";
import {
  suggestClimateZone,
  type ClimateZone,
} from "@/lib/geo/climate-zones";

const DVUT_URL =
  "https://www.boverket.se/contentassets/78ea1170505245b8b105e163b56dff27/dvut_1991_2020.csv";

export type DvutPlace = {
  name: string;
  lat: number;
  lon: number;
  /** 1-dygn DVUT °C */
  dvut1: number;
  /** 5-dygn DVUT °C */
  dvut5: number;
};

export type BoverketAnalysis = {
  climateZone: ClimateZone | null;
  zoneSource: string | null;
  zoneLabel: string | null;
  nearestDvut: (DvutPlace & { distanceKm: number }) | null;
  notes: string[];
  fetchedAt: string;
};

type Cache = { at: number; places: DvutPlace[] };
let dvutCache: Cache | null = null;
const CACHE_MS = 24 * 60 * 60 * 1000;

function parseNumber(s: string): number | null {
  const n = Number(String(s).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function loadDvutPlaces(): Promise<DvutPlace[]> {
  if (dvutCache && Date.now() - dvutCache.at < CACHE_MS) {
    return dvutCache.places;
  }
  const res = await fetch(DVUT_URL, {
    signal: AbortSignal.timeout(60_000),
    next: { revalidate: 86_400 },
  } as RequestInit);
  if (!res.ok) throw new Error(`DVUT CSV HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  // Skip comment lines starting with #
  const dataLines = lines.filter((l) => !l.startsWith("#"));
  if (dataLines.length < 2) throw new Error("DVUT CSV saknar rader");

  const header = dataLines[0].split(";");
  const idx = (name: string) =>
    header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());

  const iOrt = idx("Ort");
  const iLat = idx("Latitud");
  const iLon = idx("Longitud");
  const i1 = idx("1-dygn");
  const i5 = idx("5-dygn");
  if (iOrt < 0 || iLat < 0 || iLon < 0 || i1 < 0) {
    throw new Error("DVUT CSV oväntad header");
  }

  const places: DvutPlace[] = [];
  for (let i = 1; i < dataLines.length; i++) {
    const cols = dataLines[i].split(";");
    const lat = parseNumber(cols[iLat] ?? "");
    const lon = parseNumber(cols[iLon] ?? "");
    const dvut1 = parseNumber(cols[i1] ?? "");
    const dvut5 = i5 >= 0 ? parseNumber(cols[i5] ?? "") : null;
    const name = (cols[iOrt] ?? "").trim();
    if (lat == null || lon == null || dvut1 == null || !name) continue;
    places.push({
      name,
      lat,
      lon,
      dvut1,
      dvut5: dvut5 ?? dvut1,
    });
  }
  if (!places.length) throw new Error("DVUT CSV: inga giltiga orter");
  dvutCache = { at: Date.now(), places };
  return places;
}

function nearestPlace(
  places: DvutPlace[],
  lat: number,
  lon: number
): DvutPlace & { distanceKm: number } {
  let best = places[0];
  let bestD = Infinity;
  for (const p of places) {
    const d = haversineKm(lat, lon, p.lat, p.lon);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return { ...best, distanceKm: bestD };
}

export async function analyzeBoverketContext(opts: {
  latitude: number | null;
  longitude: number | null;
  municipality: string | null;
}): Promise<BoverketAnalysis> {
  const fetchedAt = new Date().toISOString();
  const notes: string[] = [];

  const zone = suggestClimateZone({ municipality: opts.municipality });
  if (zone.zone) {
    notes.push(
      `Klimatzon ${zone.zone} föreslagen från ${zone.source}: ${zone.label} (Boverket-aligned lokal mappning).`
    );
  } else {
    notes.push(
      "Kunde inte härleda klimatzon från kommun – sätt manuellt i fastighetsformuläret."
    );
  }

  let nearestDvut: BoverketAnalysis["nearestDvut"] = null;
  if (opts.latitude != null && opts.longitude != null) {
    const places = await loadDvutPlaces();
    nearestDvut = nearestPlace(places, opts.latitude, opts.longitude);
    notes.push(
      `DVUT 1991–2020 (Boverket/SMHI): närmaste ort ${nearestDvut.name} (${nearestDvut.distanceKm.toFixed(1)} km) – 1-dygn ${nearestDvut.dvut1} °C, 5-dygn ${nearestDvut.dvut5} °C.`
    );
    notes.push(
      "DVUT är dimensionerande vinterutetemperatur (energi/värme), inte fysisk klimatrisk."
    );
  } else {
    notes.push("Saknar koordinater – DVUT-uppslag hoppas över.");
  }

  return {
    climateZone: zone.zone,
    zoneSource: zone.source,
    zoneLabel: zone.label,
    nearestDvut,
    notes,
    fetchedAt,
  };
}
