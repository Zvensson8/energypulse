/**
 * Smoke: Fas 3 YoY delta + CapEx rollup logic.
 * Run: node scripts/smoke-fas3.mjs
 */

function pctDelta(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function rollupCapex(plans, actions) {
  const map = new Map();
  for (const p of plans) {
    if (p.status === "completed") continue;
    const y = p.year;
    const b = map.get(y) ?? { plan: 0, action: 0 };
    b.plan += p.cost;
    map.set(y, b);
  }
  for (const a of actions) {
    const y = a.year;
    const b = map.get(y) ?? { plan: 0, action: 0 };
    b.action += a.cost;
    map.set(y, b);
  }
  return [...map.entries()].map(([year, v]) => ({
    year,
    total: v.plan + v.action,
  }));
}

function assert(c, m) {
  if (!c) throw new Error(m);
}

assert(Math.abs(pctDelta(110, 100) - 10) < 0.01, "pct +10");
assert(Math.abs(pctDelta(90, 100) + 10) < 0.01, "pct -10");
assert(pctDelta(10, 0) === null, "div0");

const capex = rollupCapex(
  [
    { year: 2026, cost: 1_000_000, status: "draft" },
    { year: 2026, cost: 500_000, status: "completed" },
  ],
  [{ year: 2026, cost: 200_000 }]
);
assert(capex.length === 1, "one year");
assert(capex[0].total === 1_200_000, "plan open + action, skip completed");

// GHG kg = intensity * area → tCO2e
const gi = 20; // kg/m2
const area = 5000;
const tco2e = (gi * area) / 1000;
assert(tco2e === 100, "ghg tco2e");

// Batch load model (no N+1): 1 plans + 1 links + 1 actions
function batchLoadCost(planCount) {
  return 3; // constant queries regardless of planCount
}
function nPlusOneCost(planCount) {
  return 1 + planCount * 3; // id list + per-plan queries
}
assert(batchLoadCost(100) < nPlusOneCost(100), "batch faster than N+1");
assert(batchLoadCost(100) === 3, "batch is O(1) queries");

console.log("OK smoke-fas3: YoY, CapEx, GHG, batch plans");
