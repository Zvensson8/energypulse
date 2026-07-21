/**
 * Smoke checks for Fas 1 pure logic (no DB).
 * Run: node scripts/smoke-fas1.mjs
 */

function buildSteps(input) {
  const {
    buildingCount,
    withPerf,
    incompletePerf,
    highRiskBuildings,
    openActions,
    planCount,
    draftPlans,
  } = input;

  const buildingsStatus =
    buildingCount === 0 ? "todo" : withPerf > 0 ? "done" : "partial";
  const dataStatus =
    buildingCount === 0
      ? "todo"
      : incompletePerf > 0
        ? "partial"
        : withPerf === buildingCount && buildingCount > 0
          ? "done"
          : withPerf > 0
            ? "partial"
            : "todo";
  const riskStatus =
    buildingCount === 0
      ? "todo"
      : highRiskBuildings > 0
        ? "partial"
        : withPerf > 0
          ? "done"
          : "todo";
  const planStatus =
    draftPlans > 0 ? "partial" : planCount > 0 ? "done" : "todo";

  return { buildingsStatus, dataStatus, riskStatus, planStatus, openActions };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Empty property
let s = buildSteps({
  buildingCount: 0,
  withPerf: 0,
  incompletePerf: 0,
  highRiskBuildings: 0,
  openActions: 0,
  planCount: 0,
  draftPlans: 0,
});
assert(s.buildingsStatus === "todo", "empty buildings todo");
assert(s.dataStatus === "todo", "empty data todo");

// Full healthy
s = buildSteps({
  buildingCount: 2,
  withPerf: 2,
  incompletePerf: 0,
  highRiskBuildings: 0,
  openActions: 0,
  planCount: 1,
  draftPlans: 0,
});
assert(s.buildingsStatus === "done", "healthy buildings done");
assert(s.dataStatus === "done", "healthy data done");
assert(s.planStatus === "done", "healthy plan done");

// Incomplete data
s = buildSteps({
  buildingCount: 2,
  withPerf: 2,
  incompletePerf: 1,
  highRiskBuildings: 1,
  openActions: 2,
  planCount: 1,
  draftPlans: 1,
});
assert(s.dataStatus === "partial", "incomplete partial");
assert(s.riskStatus === "partial", "high risk partial");
assert(s.planStatus === "partial", "draft plan partial");

// Priority sort order simulation
const order = { high: 0, medium: 1, low: 2 };
const pri = [
  { severity: "low" },
  { severity: "high" },
  { severity: "medium" },
].sort((a, b) => order[a.severity] - order[b.severity]);
assert(pri[0].severity === "high", "sort high first");
assert(pri[2].severity === "low", "sort low last");

console.log("OK smoke-fas1: journey + priority ordering");
