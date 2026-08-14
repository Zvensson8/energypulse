"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import {
  isLiljebladsConfigured,
  listLiljebladsComponents,
  listLiljebladsProperties,
  type LiljebladsComponent,
  type LiljebladsProperty,
} from "@/lib/integrations/liljeblads";
import { uuidSchema } from "@/lib/validations/enums";
import { z } from "zod";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

function fail(e: unknown): ActionResult<never> {
  const message = e instanceof Error ? e.message : "UNKNOWN";
  if (message === "UNAUTHORIZED") {
    return { success: false, error: "Logga in krävs", code: "UNAUTHORIZED" };
  }
  return { success: false, error: message };
}

export async function getLiljebladsBridgeStatus(): Promise<
  ActionResult<{ configured: boolean }>
> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);
    return { success: true, data: { configured: isLiljebladsConfigured() } };
  } catch (e) {
    return fail(e);
  }
}

export async function fetchLiljebladsPropertyOptions(): Promise<
  ActionResult<LiljebladsProperty[]>
> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);
    if (!isLiljebladsConfigured()) {
      return { success: false, error: "Liljeblads är inte konfigurerat" };
    }
    const rows = await listLiljebladsProperties();
    return { success: true, data: rows };
  } catch (e) {
    return fail(e);
  }
}

export async function fetchLinkedLiljebladsComponents(
  propertyId: string,
): Promise<
  ActionResult<{
    linked: boolean;
    liljeblads_property_id: string | null;
    components: LiljebladsComponent[];
  }>
> {
  try {
    uuidSchema.parse(propertyId);
    const supabase = await createClient();
    await requireUser(supabase);

    const { data: property, error } = await supabase
      .from("properties")
      .select("id, liljeblads_property_id")
      .eq("id", propertyId)
      .maybeSingle();
    if (error || !property) {
      return { success: false, error: error?.message ?? "Fastighet hittades inte" };
    }

    const link = property.liljeblads_property_id;
    if (!link) {
      return {
        success: true,
        data: { linked: false, liljeblads_property_id: null, components: [] },
      };
    }
    if (!isLiljebladsConfigured()) {
      return { success: false, error: "Liljeblads är inte konfigurerat" };
    }

    const components = await listLiljebladsComponents(link);
    return {
      success: true,
      data: {
        linked: true,
        liljeblads_property_id: link,
        components,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function linkLiljebladsProperty(raw: {
  propertyId: string;
  liljebladsPropertyId: string | null;
}): Promise<ActionResult<{ id: string; liljeblads_property_id: string | null }>> {
  try {
    const input = z
      .object({
        propertyId: uuidSchema,
        liljebladsPropertyId: uuidSchema.nullable(),
      })
      .parse(raw);

    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { data, error } = await supabase
      .from("properties")
      .update({ liljeblads_property_id: input.liljebladsPropertyId })
      .eq("id", input.propertyId)
      .select("id, liljeblads_property_id")
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Kunde inte spara länk" };
    }
    return { success: true, data };
  } catch (e) {
    return fail(e);
  }
}
