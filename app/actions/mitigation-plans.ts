"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import {
  acceptPlanSchema,
  generatePlanSchema,
} from "@/lib/validations/workflow";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export type MitigationPlan = {
  id: string;
  building_id: string;
  year: number;
  status: string;
  total_cost: number | null;
  total_saving_kwh: number | null;
  expected_meps_delta: number | null;
  expected_stranding_after: number | null;
  baseline_meps_2030_gap: number | null;
  baseline_stranding_year: number | null;
  items: MitigationPlanItem[];
};

export type MitigationPlanItem = {
  id: string;
  action_id: string | null;
  sort_order: number;
  include_in_plan: boolean;
  title_snapshot: string | null;
  investment_cost: number | null;
  estimated_saving_kwh: number | null;
  payback_years: number | null;
  priority_score: number | null;
};

function toError(e: unknown): ActionResult<never> {
  const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
  if (message === "UNAUTHORIZED")
    return { success: false, error: "Inloggning krävs", code: "UNAUTHORIZED" };
  if (message === "FORBIDDEN" || message.startsWith("FORBIDDEN_ROLE"))
    return { success: false, error: "Otillräcklig behörighet", code: "FORBIDDEN" };
  return { success: false, error: message, code: "ERROR" };
}

async function loadPlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string
): Promise<MitigationPlan | null> {
  const { data: plan, error } = await supabase
    .from("mitigation_plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();
  if (error || !plan) return null;

  const { data: items } = await supabase
    .from("mitigation_plan_items")
    .select("*")
    .eq("plan_id", planId)
    .order("sort_order");

  return {
    id: plan.id as string,
    building_id: plan.building_id as string,
    year: plan.year as number,
    status: plan.status as string,
    total_cost: plan.total_cost as number | null,
    total_saving_kwh: plan.total_saving_kwh as number | null,
    expected_meps_delta: plan.expected_meps_delta as number | null,
    expected_stranding_after: plan.expected_stranding_after as number | null,
    baseline_meps_2030_gap: plan.baseline_meps_2030_gap as number | null,
    baseline_stranding_year: plan.baseline_stranding_year as number | null,
    items: (items ?? []).map((i) => ({
      id: i.id as string,
      action_id: i.action_id as string | null,
      sort_order: i.sort_order as number,
      include_in_plan: i.include_in_plan as boolean,
      title_snapshot: i.title_snapshot as string | null,
      investment_cost: i.investment_cost as number | null,
      estimated_saving_kwh: i.estimated_saving_kwh as number | null,
      payback_years: i.payback_years as number | null,
      priority_score: i.priority_score as number | null,
    })),
  };
}

export async function generateMitigationPlan(
  raw: unknown
): Promise<ActionResult<MitigationPlan>> {
  try {
    const input = generatePlanSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { data: planId, error } = await supabase.rpc(
      "generate_mitigation_plan",
      {
        p_building_id: input.building_id,
        p_year: input.year ?? null,
      }
    );
    if (error) return { success: false, error: error.message };

    const plan = await loadPlan(supabase, planId as string);
    if (!plan) return { success: false, error: "Plan skapades men kunde inte laddas" };

    logger.info("mitigation.generated", {
      userId: user.id,
      planId: plan.id,
    });
    return { success: true, data: plan };
  } catch (e) {
    return toError(e);
  }
}

export async function acceptMitigationPlan(
  raw: unknown
): Promise<ActionResult<MitigationPlan>> {
  try {
    const input = acceptPlanSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { error } = await supabase.rpc("accept_mitigation_plan", {
      p_plan_id: input.plan_id,
      p_item_ids: input.item_ids ?? null,
    });
    if (error) return { success: false, error: error.message };

    const plan = await loadPlan(supabase, input.plan_id);
    if (!plan) return { success: false, error: "Plan saknas efter accept" };

    logger.info("mitigation.accepted", {
      userId: user.id,
      planId: plan.id,
    });
    return { success: true, data: plan };
  } catch (e) {
    return toError(e);
  }
}

export async function getMitigationPlan(
  planId: string
): Promise<ActionResult<MitigationPlan | null>> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);
    const plan = await loadPlan(supabase, planId);
    return { success: true, data: plan };
  } catch (e) {
    return toError(e);
  }
}

export async function updatePlanItemInclude(raw: {
  item_id: string;
  include: boolean;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { error } = await supabase
      .from("mitigation_plan_items")
      .update({ include_in_plan: raw.include })
      .eq("id", raw.item_id);
    if (error) return { success: false, error: error.message };
    return { success: true, data: { id: raw.item_id } };
  } catch (e) {
    return toError(e);
  }
}
