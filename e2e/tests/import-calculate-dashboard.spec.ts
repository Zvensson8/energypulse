import { test, expect } from "@playwright/test";
import {
  calculatePerformance,
  cleanupBuilding,
  seedBuildingScenario,
  serviceClient,
  type TestIds,
} from "../helpers/supabase";
import { e2eAdminCreds, loginAs } from "../helpers/auth";

/**
 * Full kedja: seed(import-sim) → calculate_yearly_performance → dashboard KPI syns.
 */
test.describe("Import → calculate → dashboard", () => {
  const sb = serviceClient();
  const year = new Date().getFullYear() - 1;
  let ids: TestIds;

  test.beforeAll(async () => {
    ids = await seedBuildingScenario(sb, {
      label: "import-dash",
      year,
      missingMonths: 0,
    });
  });

  test.afterAll(async () => {
    try {
      await cleanupBuilding(sb, ids);
    } catch {
      /* ignore */
    }
  });

  test("calculate_yearly_performance UPSERT:ar PI", async () => {
    const t0 = Date.now();
    const pi = await calculatePerformance(sb, ids.buildingId, year);
    const ms = Date.now() - t0;

    expect(pi.data_gap_status).toBe("COMPLETE");
    expect(Number(pi.energy_intensity)).toBeGreaterThan(0);
    expect(ms).toBeLessThan(15_000);

    const { data: stored } = await sb
      .from("performance_indicators")
      .select("building_id, year, data_gap_status, energy_intensity")
      .eq("building_id", ids.buildingId)
      .eq("year", year)
      .maybeSingle();

    expect(stored?.data_gap_status).toBe("COMPLETE");
  });

  test("dashboard visar KPI efter beräkning (UI)", async ({ page }) => {
    const { email, password } = e2eAdminCreds();
    test.skip(!email || !password, "E2E_ADMIN_EMAIL/PASSWORD saknas");

    await calculatePerformance(sb, ids.buildingId, year);

    const t0 = Date.now();
    await loginAs(page, email, password);
    await page.goto("/dashboard");
    await expect(page.getByText(/portfolio dashboard|total energi|data completeness/i).first()).toBeVisible({
      timeout: 30_000,
    });
    const loadMs = Date.now() - t0;

    // Soft budget for interactive path (login + dashboard)
    expect(loadMs).toBeLessThan(20_000);

    // KPI cards should render numbers
    await expect(page.locator("text=/kWh|MWh|GWh|%/").first()).toBeVisible();
  });

  test("fastigheter visar bestånd efter import", async ({ page }) => {
    const { email, password } = e2eAdminCreds();
    test.skip(!email || !password, "E2E_ADMIN_EMAIL/PASSWORD saknas");

    await loginAs(page, email, password);
    await page.goto("/properties");
    await expect(page.getByPlaceholder(/sök/i)).toBeVisible({ timeout: 30_000 });
  });
});
