import { test, expect } from "@playwright/test";
import {
  calculatePerformance,
  cleanupBuilding,
  seedBuildingScenario,
  serviceClient,
  type TestIds,
} from "../helpers/supabase";
import { e2eAdminCreds, loginAs } from "../helpers/auth";

test.describe("Override-flöde + audit", () => {
  const sb = serviceClient();
  const year = new Date().getFullYear() - 1;
  let ids: TestIds;

  test.beforeAll(async () => {
    ids = await seedBuildingScenario(sb, {
      label: "override",
      year,
      missingMonths: 4,
    });
  });

  test.afterAll(async () => {
    try {
      await cleanupBuilding(sb, ids);
    } catch {
      /* ignore */
    }
  });

  test("API: override kräver reason och sätter MEPS/CRREM", async () => {
    const blocked = await calculatePerformance(sb, ids.buildingId, year);
    expect(blocked.data_gap_status).toBe("INCOMPLETE_DATA");
    expect(blocked.meps_2030_gap).toBeNull();

    const reason = `E2E override ${Date.now()} – godkänd av QA`;
    const unlocked = await calculatePerformance(
      sb,
      ids.buildingId,
      year,
      true,
      reason
    );
    expect(unlocked.override_applied).toBe(true);
    expect(unlocked.override_reason).toContain("E2E override");
    expect(unlocked.meps_2030_gap).not.toBeNull();

    const { data: logs } = await sb
      .from("data_quality_logs")
      .select("operation, override_reason, entity_id")
      .eq("operation", "OVERRIDE")
      .eq("entity_id", ids.buildingId)
      .order("changed_at", { ascending: false })
      .limit(5);

    expect((logs ?? []).some((l) => l.override_reason?.includes("E2E override"))).toBe(
      true
    );
  });

  test("UI: override-dialog med motivering (admin)", async ({ page }) => {
    const { email, password } = e2eAdminCreds();
    test.skip(!email || !password, "E2E_ADMIN_EMAIL/PASSWORD saknas");

    // Ensure incomplete PI exists without override for UI path
    await calculatePerformance(sb, ids.buildingId, year, false, null);

    await loginAs(page, email, password);
    await page.goto(`/buildings/${ids.buildingId}`);
    await expect(page.getByText(/byggnad|performance|kWh|betyg|klass/i).first()).toBeVisible({
      timeout: 30_000,
    });

    // Open override via incomplete row icon if visible
    const overrideBtn = page.getByTitle("Override").first();
    if (await overrideBtn.count()) {
      await overrideBtn.click();
      await page
        .getByPlaceholder(/godkänt|motivering|portfölj/i)
        .fill(`UI E2E override ${Date.now()}`);
      await page.getByRole("button", { name: /bekräfta override/i }).click();
      await expect(
        page.getByText(/INCOMPLETE|Ofullständig|override/i).first()
      ).toBeVisible({ timeout: 15_000 });
    } else {
      // Fallback: provenance path
      await page.getByTitle("Provenance").first().click();
      const ov = page.getByRole("button", { name: /override/i });
      if (await ov.count()) {
        await ov.click();
        await page.locator("textarea").fill(`UI E2E override ${Date.now()}`);
        await page.getByRole("button", { name: /bekräfta override/i }).click();
      }
    }
  });
});
