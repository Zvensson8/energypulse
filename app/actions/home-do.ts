"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import { createWorkOrderFromAction } from "@/app/actions/liljeblads-bridge";
import { uuidSchema } from "@/lib/validations/enums";

export type DoNextResult =
  | { kind: "link"; href: string }
  | { kind: "import"; href: string }
  | { kind: "plan"; href: string }
  | { kind: "wo"; url: string; already: boolean; title: string };

export async function doNextForProperty(
  propertyId: string,
): Promise<
  { success: true; data: DoNextResult } | { success: false; error: string }
> {
  try {
    uuidSchema.parse(propertyId);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { data: property, error } = await supabase
      .from("properties")
      .select("id, liljeblads_property_id")
      .eq("id", propertyId)
      .maybeSingle();
    if (error || !property) {
      return { success: false, error: error?.message ?? "Fastighet hittades inte" };
    }
    if (!property.liljeblads_property_id) {
      return {
        success: true,
        data: { kind: "link", href: `/properties/${propertyId}` },
      };
    }

    const { data: buildings } = await supabase
      .from("buildings")
      .select("id")
      .eq("property_id", propertyId);
    const buildingIds = (buildings ?? []).map((b) => b.id);
    if (buildingIds.length === 0) {
      return {
        success: true,
        data: { kind: "plan", href: `/properties/${propertyId}?tab=buildings` },
      };
    }

    const { data: action } = await supabase
      .from("actions")
      .select("id, title, liljeblads_work_order_id")
      .in("building_id", buildingIds)
      .in("status", ["proposed", "approved", "in_progress"])
      .order("priority_score", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (!action) {
      return {
        success: true,
        data: { kind: "plan", href: `/properties/${propertyId}?tab=plan` },
      };
    }

    const wo = await createWorkOrderFromAction({ actionId: action.id });
    if (!wo.success) return { success: false, error: wo.error };

    return {
      success: true,
      data: {
        kind: "wo",
        url: wo.data.url,
        already: wo.data.already_existed,
        title: action.title,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Kunde inte skapa arbetsorder",
    };
  }
}
