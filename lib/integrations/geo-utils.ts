/** Shared geo helpers for open data clients. */

export function toWebMercator(lon: number, lat: number): { x: number; y: number } {
  const x = (lon * 20037508.34) / 180;
  let y =
    Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  y = (y * 20037508.34) / 180;
  return { x, y };
}

export function haversineKm(
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

export async function fetchJson<T>(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const timeoutMs = init?.timeoutMs ?? 45_000;
  const { timeoutMs: _, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(rest.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
    next: { revalidate: 0 },
  } as RequestInit);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} för ${url.slice(0, 120)}`);
  }
  return (await res.json()) as T;
}
