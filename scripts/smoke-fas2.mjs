/**
 * Smoke checks for Fas 2 (errors + data quality levels).
 * Run: node scripts/smoke-fas2.mjs
 */

function dataQualityLevel(incomplete, extrapolated, total) {
  if (total === 0) return "warning";
  if (incomplete > 0) return "blocked";
  if (extrapolated > 0) return "warning";
  return "ok";
}

function toUserError(raw) {
  const MAP = [
    [/UNAUTHORIZED|JWT/i, "Du är inte inloggad"],
    [/FORBIDDEN/i, "Du saknar behörighet"],
    [/network|fetch failed/i, "Nätverksfel"],
  ];
  for (const [re, msg] of MAP) {
    if (re.test(raw)) return msg;
  }
  return raw;
}

function assert(c, m) {
  if (!c) throw new Error(m);
}

assert(dataQualityLevel(0, 0, 10) === "ok", "ok");
assert(dataQualityLevel(1, 0, 10) === "blocked", "blocked");
assert(dataQualityLevel(0, 2, 10) === "warning", "warning");
assert(dataQualityLevel(0, 0, 0) === "warning", "empty warning");

assert(
  toUserError("UNAUTHORIZED").includes("inloggad"),
  "map unauthorized"
);
assert(
  toUserError("FORBIDDEN_ROLE").includes("behörighet"),
  "map forbidden"
);
assert(toUserError("fetch failed").includes("Nätverks"), "map network");
assert(toUserError("Något svenskt fel") === "Något svenskt fel", "pass through");

console.log("OK smoke-fas2: data quality + error mapping");
