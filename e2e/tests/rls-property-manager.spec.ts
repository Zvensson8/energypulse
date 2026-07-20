import { test, expect } from "@playwright/test";
import {
  anonClient,
  cleanupBuilding,
  createUserWithRole,
  seedBuildingScenario,
  serviceClient,
  type TestIds,
} from "../helpers/supabase";

/**
 * RLS: property_manager ser bara tilldelade fastigheter
 * och spaces_safe maskerar tenant_name.
 */
test.describe("RLS + GDPR tenant maskering", () => {
  const sb = serviceClient();
  const year = new Date().getFullYear() - 1;
  let allowed: TestIds;
  let denied: TestIds;
  let pmEmail: string;
  let pmPassword: string;
  let pmUserId: string;

  test.beforeAll(async () => {
    allowed = await seedBuildingScenario(sb, {
      label: "rls-allowed",
      year,
      missingMonths: 0,
    });
    denied = await seedBuildingScenario(sb, {
      label: "rls-denied",
      year,
      missingMonths: 0,
    });

    pmEmail = `e2e.pm.${Date.now()}@example.com`;
    pmPassword = `E2ePm_${Date.now()}!Aa1`;
    pmUserId = await createUserWithRole(sb, {
      email: pmEmail,
      password: pmPassword,
      role: "property_manager",
      propertyIds: [allowed.propertyId],
    });
  });

  test.afterAll(async () => {
    try {
      await sb.auth.admin.deleteUser(pmUserId);
    } catch {
      /* ignore */
    }
    try {
      await cleanupBuilding(sb, allowed);
      await cleanupBuilding(sb, denied);
    } catch {
      /* ignore */
    }
  });

  test("anon utan JWT ser 0 rader på skyddade tabeller", async () => {
    const anon = anonClient();
    const { data: props } = await anon.from("properties").select("id");
    const { data: pi } = await anon.from("performance_indicators").select("id");
    expect(props ?? []).toHaveLength(0);
    expect(pi ?? []).toHaveLength(0);
  });

  test("property_manager ser endast tilldelad property", async () => {
    const client = anonClient();
    const { data: session, error } = await client.auth.signInWithPassword({
      email: pmEmail,
      password: pmPassword,
    });
    expect(error).toBeNull();
    expect(session.session).toBeTruthy();

    const { data: properties } = await client
      .from("properties")
      .select("id, name");

    const ids = (properties ?? []).map((p) => p.id);
    expect(ids).toContain(allowed.propertyId);
    expect(ids).not.toContain(denied.propertyId);

    const { data: buildings } = await client.from("buildings").select("id");
    const bIds = (buildings ?? []).map((b) => b.id);
    expect(bIds).toContain(allowed.buildingId);
    expect(bIds).not.toContain(denied.buildingId);
  });

  test("spaces_safe maskerar tenant_name; raw ciphertext ej dekrypterad i view", async () => {
    const client = anonClient();
    await client.auth.signInWithPassword({
      email: pmEmail,
      password: pmPassword,
    });

    const { data: safe } = await client
      .from("spaces_safe")
      .select("id, tenant_name, has_tenant, building_id")
      .eq("building_id", allowed.buildingId);

    expect((safe ?? []).length).toBeGreaterThan(0);
    for (const row of safe ?? []) {
      if (row.has_tenant) {
        expect(row.tenant_name).toBe("***MASKERAD***");
        expect(row.tenant_name).not.toContain("Hemligt");
      }
    }

    // Direct table access may return ciphertext but never plaintext tenant
    const { data: raw } = await client
      .from("spaces")
      .select("id, tenant_name_encrypted")
      .eq("building_id", allowed.buildingId);

    for (const row of raw ?? []) {
      if (row.tenant_name_encrypted) {
        const asStr = String(row.tenant_name_encrypted);
        expect(asStr).not.toContain("Hemligt Hyresgäst");
      }
    }
  });

  test("viewer kan inte decrypt_tenant_name_audit", async () => {
    const email = `e2e.viewer.${Date.now()}@example.com`;
    const password = `E2eView_${Date.now()}!Aa1`;
    let viewerId = "";
    try {
      viewerId = await createUserWithRole(sb, {
        email,
        password,
        role: "viewer",
        propertyIds: [allowed.propertyId],
      });

      const client = anonClient();
      await client.auth.signInWithPassword({ email, password });

      const { data: spaces } = await client
        .from("spaces_safe")
        .select("id")
        .eq("building_id", allowed.buildingId)
        .limit(1);

      const spaceId = spaces?.[0]?.id;
      if (!spaceId) {
        test.skip(true, "ingen space");
        return;
      }

      const { error } = await client.rpc("decrypt_tenant_name_audit", {
        p_space_id: spaceId,
        p_reason: "e2e should fail",
      });
      expect(error).toBeTruthy();
    } finally {
      if (viewerId) {
        try {
          await sb.auth.admin.deleteUser(viewerId);
        } catch {
          /* ignore */
        }
      }
    }
  });
});
