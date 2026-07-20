import type { Page } from "@playwright/test";

export async function loginAs(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/e-post/i).fill(email);
  // fallback if label association differs
  if (!(await page.getByLabel(/e-post/i).count())) {
    await page.locator('input[type="email"]').fill(email);
  }
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /logga in/i }).click();
  await page.waitForURL(/dashboard|buildings/, { timeout: 30_000 });
}

export function e2eAdminCreds() {
  return {
    email: process.env.E2E_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? "",
    password:
      process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "",
  };
}
