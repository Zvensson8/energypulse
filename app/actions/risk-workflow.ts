"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES, OVERRIDE_ROLES } from "@/lib/auth/session";
import { setRiskStatusSchema } from "@/lib/validations/workflow";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

function toError(e: unknown): ActionResult<never> {
  const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
  if (message === "UNAUTHORIZED")
    return { success: false, error: "Inloggning krävs", code: "UNAUTHORIZED" };
  if (message === "FORBIDDEN" || message.startsWith("FORBIDDEN_ROLE"))
    return { success: false, error: "Otillräcklig behörighet", code: "FORBIDDEN" };
  return { success: false, error: message, code: "ERROR" };
}

export type ComplianceRiskRow = {
  id: string;
  building_id: string;
  building_name: string;
  property_name: string;
  year: number;
  risk_kind: string;
  metric_value: number | null;
  severity: number | null;
  workflow_status: string;
  status_reason: string | null;
  notes: string | null;
};

export async function setRiskWorkflowStatus(
  raw: unknown
): Promise<ActionResult<{ id: string; workflow_status: string }>> {
  try {
    const input = setRiskStatusSchema.parse(raw);
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    if (
      (input.status === "resolved" || input.status === "dismissed") &&
      (!input.reason || input.reason.length < 5)
    ) {
      return {
        success: false,
        error: "Motivering krävs (minst 5 tecken) vid åtgärdad/avskriven",
      };
    }

    // Dismiss only admin/PM
    if (input.status === "dismissed") {
      assertRole(user, OVERRIDE_ROLES);
    }

    if (input.kind === "physical") {
      const { data, error } = await supabase.rpc("set_physical_risk_status", {
        p_risk_id: input.risk_id,
        p_status: input.status,
        p_reason: input.reason ?? null,
      });
      if (error) return { success: false, error: error.message };
      const row = data as { id: string; workflow_status: string };
      return {
        success: true,
        data: { id: row.id, workflow_status: row.workflow_status },
      };
    }

    const { data, error } = await supabase.rpc("set_compliance_risk_status", {
      p_risk_id: input.risk_id,
      p_status: input.status,
      p_reason: input.reason ?? null,
    });
    if (error) return { success: false, error: error.message };
    const row = data as { id: string; workflow_status: string };
    logger.info("risk.status", {
      userId: user.id,
      riskId: input.risk_id,
      status: input.status,
    });
    return {
      success: true,
      data: { id: row.id, workflow_status: row.workflow_status },
    };
  } catch (e) {
    return toError(e);
  }
}

export async function refreshComplianceRisks(
  year?: number
): Promise<ActionResult<{ created: number; year: number }>> {
  try {
    const y = year ?? new Date().getFullYear() - 1;
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { data, error } = await supabase.rpc("refresh_compliance_risks", {
      p_year: y,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data: { created: Number(data ?? 0), year: y } };
  } catch (e) {
    return toError(e);
  }
}

export async function listComplianceRisks(opts?: {
  hideClosed?: boolean;
  year?: number;
}): Promise<ActionResult<ComplianceRiskRow[]>> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    let q = supabase
      .from("compliance_risks")
      .select(
        `
        id, building_id, year, risk_kind, metric_value, severity,
        workflow_status, status_reason, notes,
        buildings!inner ( name, properties!inner ( name ) )
      `
      )
      .order("severity", { ascending: false, nullsFirst: false })
      .limit(300);

    if (opts?.hideClosed !== false) {
      q = q.in("workflow_status", ["open", "monitoring"]);
    }
    if (opts?.year) q = q.eq("year", opts.year);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    const rows: ComplianceRiskRow[] = (data ?? []).map((r) => {
      const b = r.buildings as unknown as {
        name: string;
        properties: { name: string } | { name: string }[];
      };
      const prop = Array.isArray(b?.properties) ? b.properties[0] : b?.properties;
      return {
        id: r.id as string,
        building_id: r.building_id as string,
        building_name: b?.name ?? "—",
        property_name: prop?.name ?? "—",
        year: r.year as number,
        risk_kind: r.risk_kind as string,
        metric_value: r.metric_value as number | null,
        severity: r.severity as number | null,
        workflow_status: r.workflow_status as string,
        status_reason: r.status_reason as string | null,
        notes: r.notes as string | null,
      };
    });

    return { success: true, data: rows };
  } catch (e) {
    return toError(e);
  }
}

export async function countOpenWorkflowAlerts(): Promise<
  ActionResult<{
    openCompliance: number;
    openPhysical: number;
    declarationSuggestions: number;
  }>
> {
  try {
    const supabase = await createClient();
    await requireUser(supabase);

    const [c, p, a] = await Promise.all([
      supabase
        .from("compliance_risks")
        .select("id", { count: "exact", head: true })
        .in("workflow_status", ["open", "monitoring"]),
      supabase
        .from("physical_risks")
        .select("id", { count: "exact", head: true })
        .in("workflow_status", ["open", "monitoring"]),
      supabase
        .from("actions")
        .select("id", { count: "exact", head: true })
        .eq("source", "improvement_detection")
        .eq("status", "proposed"),
    ]);

    return {
      success: true,
      data: {
        openCompliance: c.count ?? 0,
        openPhysical: p.count ?? 0,
        declarationSuggestions: a.count ?? 0,
      },
    };
  } catch (e) {
    return toError(e);
  }
}
