import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
function get(key) {
  const m = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^"|"$/g, "") : "";
}

const url = get("NEXT_PUBLIC_SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY");
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const props = await (
  await fetch(`${url}/rest/v1/properties?select=id,name,status`, { headers })
).json();
const buildings = await (
  await fetch(`${url}/rest/v1/buildings?select=id,property_id`, { headers })
).json();

if (!Array.isArray(props) || !Array.isArray(buildings)) {
  console.error("unexpected response", props, buildings);
  process.exit(1);
}

const have = new Set(buildings.map((b) => b.property_id));
const missing = props.filter((p) => !have.has(p.id));
console.log(
  JSON.stringify({
    properties: props.length,
    buildings: buildings.length,
    missing: missing.length,
    names: missing.map((p) => p.name),
  }),
);

if (missing.length === 0) process.exit(0);

const res = await fetch(`${url}/rest/v1/buildings`, {
  method: "POST",
  headers,
  body: JSON.stringify(
    missing.map((p) => ({
      property_id: p.id,
      name: p.name || "Huvudbyggnad",
    })),
  ),
});
const body = await res.text();
console.log("insert", res.status, body.slice(0, 400));
if (!res.ok) process.exit(1);
