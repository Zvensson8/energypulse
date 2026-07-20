import { test, expect } from "@playwright/test";
import {
  calculatePerformance,
  cleanupBuilding,
  seedBuildingScenario,
  serviceClient,
  type TestIds,
} from "../helpers/supabase";

/**
 * Data Gap-scenarier: 0, 2, 4 saknade månader
 * (tröskel default = 3)
 */
test.describe("Data Gap scenarios (API)", () => {
  const sb = serviceClient();
  const year = new Date().getFullYear() - 1;
  const fixtures: TestIds[] = [];

  test.afterAll(async () => {
    for (const id of fixtures) {
      try {
        await cleanupBuilding(sb, id);
      } catch {
        /* ignore cleanup errors */
      }
    }
  });

  test("0 saknade månader → COMPLETE", async () => {
    const ids = await seedBuildingScenario(sb, {
      label: "gap0",
      year,
      missingMonths: 0,
    });
    fixtures.push(ids);

    const pi = await calculatePerformance(sb, ids.buildingId, year);
    expect(pi.data_gap_status).toBe("COMPLETE");
    expect(Number(pi.data_completeness_percent)).toBe(100);
    expect(pi.meps_2030_gap).not.toBeNull();
    expect(pi.energy_intensity).not.toBeNull();
  });

  test("2 saknade månader → EXTRAPOLATED_WARNING + is_estimated", async () => {
    const ids = await seedBuildingScenario(sb, {
      label: "gap2",
      year,
      missingMonths: 2,
    });
    fixtures.push(ids);

    const pi = await calculatePerformance(sb, ids.buildingId, year);
    expect(pi.data_gap_status).toBe("EXTRAPOLATED_WARNING");
    expect(Number(pi.data_completeness_percent)).toBeGreaterThan(80);
    expect(pi.meps_2030_gap).not.toBeNull();

    const { data: estimated } = await sb
      .from("energy_consumption")
      .select("id, month, is_estimated")
      .eq("building_id", ids.buildingId)
      .eq("year", year)
      .eq("is_estimated", true);

    expect((estimated ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("4 saknade månader → INCOMPLETE_DATA blockerar MEPS/CRREM", async () => {
    const ids = await seedBuildingScenario(sb, {
      label: "gap4",
      year,
      missingMonths: 4,
    });
    fixtures.push(ids);

    const pi = await calculatePerformance(sb, ids.buildingId, year);
    expect(pi.data_gap_status).toBe("INCOMPLETE_DATA");
    expect(pi.meps_2030_gap).toBeNull();
    expect(pi.crrem_stranding_year).toBeNull();
    // Intensity still calculated on available data
    expect(pi.energy_intensity).not.toBeNull();
  });
});
