/**
 * Live smoke test against SMHI Open Data (network required).
 * node scripts/smoke-smhi.mjs
 */

const METOBS = "https://opendata-download-metobs.smhi.se/api/version/1.0";

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function main() {
  const lat = 59.33;
  const lon = 18.07;
  const param = await fetch(`${METOBS}/parameter/1.json`).then((r) => r.json());
  const active = (param.station || []).filter((s) => s.active);
  let best = null;
  let bd = Infinity;
  for (const s of active) {
    const d = haversineKm(lat, lon, s.latitude, s.longitude);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  if (!best) throw new Error("No station");
  const data = await fetch(
    `${METOBS}/parameter/1/station/${best.id}/period/latest-months/data.json`
  ).then((r) => r.json());
  const vals = (data.value || []).map((v) => Number(v.value)).filter(Number.isFinite);
  if (vals.length < 10) throw new Error("Too few values");
  const max = Math.max(...vals);
  console.log(
    `OK smoke-smhi: nearest ${best.name} (${bd.toFixed(1)} km), n=${vals.length}, maxT=${max.toFixed(1)}°C`
  );
}

main().catch((e) => {
  console.error("FAIL smoke-smhi", e.message);
  process.exit(1);
});
