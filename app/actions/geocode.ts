"use server";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { suggestClimateZone, type ClimateZone } from "@/lib/geo/climate-zones";
import { z } from "zod";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  display_name: string;
  municipality: string | null;
  county: string | null;
  postcode: string | null;
  climate_zone: ClimateZone | null;
  climate_zone_label: string | null;
  climate_zone_source: string | null;
};

/**
 * Geokoda svensk adress via OpenStreetMap Nominatim (gratis, ingen API-nyckel).
 * Fyller lat/long + kommun + föreslagen Boverket-klimatzon.
 */
export async function geocodeAddress(
  raw: unknown
): Promise<ActionResult<GeocodeResult>> {
  try {
    const { query } = z
      .object({
        query: z.string().trim().min(3).max(300),
      })
      .parse(raw);

    const supabase = await createClient();
    await requireUser(supabase);

    // Prefer Sweden; append country if missing
    const q = /sverige|sweden/i.test(query) ? query : `${query}, Sverige`;

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("countrycodes", "se");
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      headers: {
        // Nominatim policy: identify application
        "User-Agent": "EnergyPulse/2.0 (property management; contact via app)",
        Accept: "application/json",
      },
      // Next.js: don't cache stale geocodes forever
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return {
        success: false,
        error: `Geokodning misslyckades (${res.status}). Försök igen om en stund.`,
      };
    }

    const rows = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
      address?: {
        municipality?: string;
        city?: string;
        town?: string;
        village?: string;
        city_district?: string;
        county?: string;
        state?: string;
        postcode?: string;
      };
    }>;

    if (!rows?.length) {
      return {
        success: false,
        error:
          "Ingen träff på adressen. Prova med gata, postnummer och ort (t.ex. «Storgatan 1, 111 22 Stockholm»).",
      };
    }

    const hit = rows[0];
    const addr = hit.address ?? {};
    const municipality =
      addr.municipality ??
      addr.city ??
      addr.town ??
      addr.village ??
      null;
    const county = addr.county ?? addr.state ?? null;

    const zone = suggestClimateZone({ municipality, county });

    return {
      success: true,
      data: {
        latitude: Number(hit.lat),
        longitude: Number(hit.lon),
        display_name: hit.display_name,
        municipality,
        county,
        postcode: addr.postcode ?? null,
        climate_zone: zone.zone,
        climate_zone_label: zone.label,
        climate_zone_source: zone.source,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Geokodning misslyckades",
    };
  }
}

/** Endast klimatzon från kommunnamn (utan nätverksanrop). */
export async function suggestClimateZoneFromMunicipality(
  municipality: string
): Promise<ActionResult<{ zone: ClimateZone | null; label: string | null }>> {
  try {
    const { municipality: m } = z
      .object({ municipality: z.string().trim().min(1).max(100) })
      .parse({ municipality });
    const zone = suggestClimateZone({ municipality: m });
    return {
      success: true,
      data: { zone: zone.zone, label: zone.label },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Fel",
    };
  }
}
