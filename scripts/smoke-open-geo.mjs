/**
 * Smoke: Boverket DVUT, MSB flood, SGI/SGU skred (network required).
 * node scripts/smoke-open-geo.mjs
 */

function toWebMercator(lon, lat) {
  const x = (lon * 20037508.34) / 180;
  let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  y = (y * 20037508.34) / 180;
  return { x, y };
}

async function smokeBoverket() {
  const url =
    "https://www.boverket.se/contentassets/78ea1170505245b8b105e163b56dff27/dvut_1991_2020.csv";
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`DVUT ${r.status}`);
  const t = await r.text();
  if (!t.includes("Ort") || !t.includes("1-dygn")) {
    throw new Error("DVUT CSV unexpected");
  }
  console.log("OK boverket DVUT csv", t.length, "bytes");
}

async function smokeMsb() {
  const lat = 59.3793;
  const lon = 13.5036;
  const { x, y } = toWebMercator(lon, lat);
  const pad = 3000;
  const base =
    "https://gisapp.msb.se/arcgis/rest/services/Oversvamningskarteringar/karteringar/MapServer";
  const params = new URLSearchParams({
    geometry: JSON.stringify({ x, y }),
    geometryType: "esriGeometryPoint",
    sr: "3857",
    layers: "all",
    tolerance: "15",
    mapExtent: `${x - pad},${y - pad},${x + pad},${y + pad}`,
    imageDisplay: "800,600,96",
    returnGeometry: "false",
    f: "json",
  });
  const r = await fetch(`${base}/identify?${params}`, {
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`MSB ${r.status}`);
  const j = await r.json();
  const n = (j.results || []).length;
  console.log("OK msb identify Karlstad results=", n);
  if (n < 1) console.warn("WARN: expected river hit near Karlstad");
}

async function smokeSgi() {
  const lat = 57.7;
  const lon = 12.0;
  const d = 0.02;
  const bbox = `${lat - d},${lon - d},${lat + d},${lon + d}`;
  const u = new URL("https://maps3.sgu.se/geoserver/ows");
  u.searchParams.set("SERVICE", "WMS");
  u.searchParams.set("VERSION", "1.3.0");
  u.searchParams.set("REQUEST", "GetFeatureInfo");
  u.searchParams.set(
    "LAYERS",
    "misc:SE.GOV.SGU.FORUTSATTNING_SKRED_FINKORNING_JORDART"
  );
  u.searchParams.set(
    "QUERY_LAYERS",
    "misc:SE.GOV.SGU.FORUTSATTNING_SKRED_FINKORNING_JORDART"
  );
  u.searchParams.set("CRS", "EPSG:4326");
  u.searchParams.set("BBOX", bbox);
  u.searchParams.set("WIDTH", "101");
  u.searchParams.set("HEIGHT", "101");
  u.searchParams.set("I", "50");
  u.searchParams.set("J", "50");
  u.searchParams.set("INFO_FORMAT", "application/json");
  u.searchParams.set("FEATURE_COUNT", "5");
  const r = await fetch(u, { signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`SGU ${r.status}`);
  const j = await r.json();
  const n = (j.features || []).length;
  console.log("OK sgi/sgu GFI features=", n);
  if (n < 1) console.warn("WARN: expected skred aktsamhet near test point");
}

async function main() {
  await smokeBoverket();
  await smokeMsb();
  await smokeSgi();
  console.log("OK smoke-open-geo all");
}

main().catch((e) => {
  console.error("FAIL smoke-open-geo", e.message || e);
  process.exit(1);
});
