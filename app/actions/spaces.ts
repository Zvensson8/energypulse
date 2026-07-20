"use server";

/**
 * GDPR-safe space access.
 *
 * ALL list/read queries go through `spaces_safe` (masked tenant_name).
 * Explicit decryption uses public.decrypt_tenant_name_audit → app.decrypt_tenant_name
 * (DB-level role checks + DECRYPT audit log).
 */

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import {
  decryptTenantRequestSchema,
  spaceSafeRowSchema,
  spaceInsertSchema,
  type SpaceSafeRow,
} from "@/lib/validations/spaces";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

/** List spaces for a building via masked view only. */
export async function listSpacesSafe(
  buildingId: string
): Promise<ActionResult<SpaceSafeRow[]>> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    const { data, error } = await supabase
      .from("spaces_safe")
      .select("*")
      .eq("building_id", buildingId)
      .order("name", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    const rows = (data ?? [])
      .map((r) => spaceSafeRowSchema.safeParse(r))
      .filter((r): r is { success: true; data: SpaceSafeRow } => r.success)
      .map((r) => r.data);

    return { success: true, data: rows };
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
    return { success: false, error: message };
  }
}

/** Single space via masked view. */
export async function getSpaceSafe(
  spaceId: string
): Promise<ActionResult<SpaceSafeRow | null>> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    const { data, error } = await supabase
      .from("spaces_safe")
      .select("*")
      .eq("id", spaceId)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }
    if (!data) {
      return { success: true, data: null };
    }

    const parsed = spaceSafeRowSchema.safeParse(data);
    return {
      success: true,
      data: parsed.success ? parsed.data : null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
    return { success: false, error: message };
  }
}

/**
 * Explicit tenant name reveal – requires reason, logs DECRYPT in DB.
 * viewer is blocked at DB level; never query spaces.tenant_name_encrypted from app code.
 */
export async function decryptTenantName(
  raw: unknown
): Promise<ActionResult<{ tenant_name: string | null }>> {
  try {
    const input = decryptTenantRequestSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);

    if (user.role === "viewer") {
      return {
        success: false,
        error: "viewer cannot decrypt tenant_name (GDPR)",
        code: "FORBIDDEN",
      };
    }

    logger.info("gdpr.decrypt_tenant.request", {
      userId: user.id,
      space_id: input.space_id,
      reason: input.reason,
    });

    // Public wrapper (Fas 2 migration) → app.decrypt_tenant_name with audit
    const { data, error } = await supabase.rpc("decrypt_tenant_name_audit", {
      p_space_id: input.space_id,
      p_reason: input.reason,
    });

    if (error) {
      logger.error("gdpr.decrypt_tenant.failed", {
        error: error.message,
        space_id: input.space_id,
        userId: user.id,
      });
      return {
        success: false,
        error: error.message,
        code: "DECRYPT_FAILED",
      };
    }

    logger.info("gdpr.decrypt_tenant.ok", {
      userId: user.id,
      space_id: input.space_id,
    });

    return {
      success: true,
      data: { tenant_name: data ?? null },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
    return { success: false, error: message };
  }
}

/**
 * Create space; tenant_name is encrypted via public.set_space_tenant_name after insert.
 * Never store plaintext tenant_name in spaces table.
 */
export async function createSpace(
  raw: unknown
): Promise<ActionResult<SpaceSafeRow>> {
  try {
    const input = spaceInsertSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { tenant_name, ...rest } = input;

    const { data: created, error } = await supabase
      .from("spaces")
      .insert({
        building_id: rest.building_id,
        name: rest.name ?? null,
        space_type: rest.space_type ?? "office",
        contract_start: rest.contract_start ?? null,
        contract_end: rest.contract_end ?? null,
        loa: rest.loa ?? null,
        boa: rest.boa ?? null,
        is_heated: rest.is_heated ?? true,
      })
      .select("id")
      .single();

    if (error || !created) {
      return { success: false, error: error?.message ?? "Insert failed" };
    }

    if (tenant_name) {
      const { error: encErr } = await supabase.rpc("set_space_tenant_name", {
        p_space_id: created.id,
        p_tenant_name: tenant_name,
      });
      if (encErr) {
        logger.error("space.encrypt_tenant_failed", { error: encErr.message });
      }
    }

    const safe = await getSpaceSafe(created.id);
    if (!safe.success || !safe.data) {
      return { success: false, error: "Created but failed to load spaces_safe" };
    }
    return { success: true, data: safe.data };
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
    return { success: false, error: message };
  }
}
