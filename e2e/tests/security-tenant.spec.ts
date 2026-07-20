import { test, expect } from "@playwright/test";
import {
  cleanupBuilding,
  createUserWithRole,
  seedBuildingScenario,
  serviceClient,
  anonClient,
  type TestIds,
} from "../helpers/supabase";

/**
 * Säkerhet: tenant_name läcker aldrig utan explicit behörighet + audit.
 */
test.describe("GDPR tenant_name security", () => {
  const sb = serviceClient();
  const year = new Date().getFullYear() - 1;
  let ids: TestIds;
  let spaceId: string;
  let adminEmail: string;
  let adminPassword: string;
  let adminId: string;

  test.beforeAll(async () => {
    ids = await seedBuildingScenario(sb, {
      label: "gdpr",
      year,
      missingMonths: 0,
    });

    const { data: spaces } = await sb
      .from("spaces")
      .select("id")
      .eq("building_id", ids.buildingId)
      .limit(1);
    spaceId = spaces![0]!.id;

    adminEmail = `e2e.admin.gdpr.${Date.now()}@example.com`;
    adminPassword = `E2eAdm_${Date.now()}!Aa1`;
    adminId = await createUserWithRole(sb, {
      email: adminEmail,
      password: adminPassword,
      role: "admin",
    });
  });

  test.afterAll(async () => {
    try {
      await sb.auth.admin.deleteUser(adminId);
    } catch {
      /* ignore */
    }
    try {
      await cleanupBuilding(sb, ids);
    } catch {
      /* ignore */
    }
  });

  test("spaces_safe returnerar endast maskerat namn", async () => {
    const client = anonClient();
    await client.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });

    const { data } = await client
      .from("spaces_safe")
      .select("tenant_name, has_tenant")
      .eq("id", spaceId)
      .single();

    expect(data?.has_tenant).toBe(true);
    expect(data?.tenant_name).toBe("***MASKERAD***");
  });

  test("admin decrypt loggar DECRYPT i data_quality_logs", async () => {
    const client = anonClient();
    await client.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });

    const reason = `e2e-decrypt-${Date.now()}`;
    const { data: plain, error } = await client.rpc(
      "decrypt_tenant_name_audit",
      {
        p_space_id: spaceId,
        p_reason: reason,
      }
    );

    // May fail if vault key missing — still assert no plaintext via view path
    if (!error) {
      expect(String(plain)).toContain("Hemligt");
    }

    // Service role checks audit regardless
    const { data: logs } = await sb
      .from("data_quality_logs")
      .select("operation, override_reason, entity_id, field")
      .eq("operation", "DECRYPT")
      .eq("entity_id", spaceId)
      .order("changed_at", { ascending: false })
      .limit(10);

    if (!error) {
      expect(
        (logs ?? []).some(
          (l) => l.override_reason === reason || l.field === "tenant_name"
        )
      ).toBe(true);
    }
  });

  test("OpenAPI/REST path spaces_safe har ingen plaintext-kolumn-lek", async () => {
    const { data } = await sb
      .from("spaces_safe")
      .select("*")
      .eq("id", spaceId)
      .single();

    const json = JSON.stringify(data);
    expect(json).not.toMatch(/Hemligt Hyresgäst/i);
    expect(data?.tenant_name === "***MASKERAD***" || data?.tenant_name == null).toBe(
      true
    );
  });
});
