"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser, assertRole, WRITE_ROLES } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export type RiskScoreRow = {
  building_id: string;
  building_name: string;
  property_id: string | null;
  property_name: string;
  year: number;
  meps_score: number | null;
  crrem_score: number | null;
  physical_score: number | null;
  data_quality_score: number | null;
  combined_score: number;
  meps_status: string | null;
  crrem_misalignment_year: number | null;
  financial_risk_flag: boolean;
  meps_2030_gap: number | null;
  energy_class: string | null;
};

function toError(e: unknown): ActionResult<never> {
  const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
  if (message === "UNAUTHORIZED")
    return { success: false, error: "Inloggning krävs", code: "UNAUTHORIZED" };
  if (message === "FORBIDDEN" || message.startsWith("FORBIDDEN_ROLE"))
    return { success: false, error: "Otillräcklig behörighet", code: "FORBIDDEN" };
  return { success: false, error: message, code: "ERROR" };
}

export async function calculateBuildingRiskScore(raw: {
  building_id: string;
  year?: number;
}): Promise<ActionResult<{ score: number; year: number }>> {
  try {
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const year = raw.year ?? new Date().getFullYear() - 1;
    const { data, error } = await supabase.rpc("calculate_combined_risk_score", {
      p_building_id: raw.building_id,
      p_year: year,
    });
    if (error) return { success: false, error: error.message };

    logger.info("risk_score.calculated", {
      userId: user.id,
      buildingId: raw.building_id,
      score: data,
    });
    return { success: true, data: { score: Number(data ?? 0), year } };
  } catch (e) {
    return toError(e);
  }
}

export async function refreshPortfolioRiskScores(
  year?: number
): Promise<ActionResult<{ count: number; year: number }>> {
  try {
    const y = year ?? new Date().getFullYear() - 1;
    const supabase = await createClient();
    const user = await requireUser(supabase);
    assertRole(user, WRITE_ROLES);

    const { data, error } = await supabase.rpc("refresh_all_risk_scores", {
      p_year: y,
    });
    if (error) return { success: false, error: error.message };

    return { success: true, data: { count: Number(data ?? 0), year: y } };
  } catch (e) {
    return toError(e);
  }
}

export async function listRiskScores(opts?: {
  year?: number;
  minScore?: number;
}): Promise<ActionResult<RiskScoreRow[]>> {
  try {
    const year = opts?.year ?? new Date().getFullYear() - 1;
    const supabase = await createClient();
    await requireUser(supabase);

    // Prefer risk_scores join; fallback PI combined fields
    const { data: scores, error } = await supabase
      .from("risk_scores")
      .select(
        `
        building_id, year, meps_score, crrem_score, physical_score,
        data_quality_score, combined_score,
        buildings!inner ( name, property_id, properties!inner ( id, name ) )
      `
      )
      .eq("year", year)
      .order("combined_score", { ascending: false })
      .limit(300);

    if (error) {
      // Table may not exist yet pre-migration
      return { success: false, error: error.message };
    }

    const buildingIds = (scores ?? []).map((s) => s.building_id as string);
    const piMap = new Map<
      string,
      {
        meps_status: string | null;
        crrem_misalignment_year: number | null;
        financial_risk_flag: boolean;
        meps_2030_gap: number | null;
        energy_class: string | null;
      }
    >();

    if (buildingIds.length > 0) {
      const { data: pis } = await supabase
        .from("performance_indicators")
        .select(
          "building_id, meps_status, crrem_misalignment_year, crrem_stranding_year, financial_risk_flag, meps_2030_gap, energy_class"
        )
        .eq("year", year)
        .in("building_id", buildingIds);

      for (const pi of pis ?? []) {
        piMap.set(pi.building_id as string, {
          meps_status: (pi.meps_status as string) ?? null,
          crrem_misalignment_year:
            (pi.crrem_misalignment_year as number | null) ??
            (pi.crrem_stranding_year as number | null),
          financial_risk_flag: Boolean(pi.financial_risk_flag),
          meps_2030_gap: pi.meps_2030_gap as number | null,
          energy_class: pi.energy_class as string | null,
        });
      }
    }

    let rows: RiskScoreRow[] = (scores ?? []).map((s) => {
      const b = s.buildings as unknown as {
        name: string;
        property_id: string | null;
        properties:
          | { id: string; name: string }
          | { id: string; name: string }[]
          | null;
      };
      const prop = Array.isArray(b?.properties) ? b.properties[0] : b?.properties;
      const pi = piMap.get(s.building_id as string);
      return {
        building_id: s.building_id as string,
        building_name: b?.name ?? "—",
        property_id: prop?.id ?? b?.property_id ?? null,
        property_name: prop?.name ?? "—",
        year: s.year as number,
        meps_score: s.meps_score as number | null,
        crrem_score: s.crrem_score as number | null,
        physical_score: s.physical_score as number | null,
        data_quality_score: s.data_quality_score as number | null,
        combined_score: Number(s.combined_score ?? 0),
        meps_status: pi?.meps_status ?? null,
        crrem_misalignment_year: pi?.crrem_misalignment_year ?? null,
        financial_risk_flag: pi?.financial_risk_flag ?? false,
        meps_2030_gap: pi?.meps_2030_gap ?? null,
        energy_class: pi?.energy_class ?? null,
      };
    });

    if (opts?.minScore != null) {
      rows = rows.filter((r) => r.combined_score >= opts.minScore!);
    }

    return { success: true, data: rows };
  } catch (e) {
    return toError(e);
  }
}

export async function getPortfolioRiskSummary(year?: number): Promise<
  ActionResult<{
    year: number;
    avgCombined: number | null;
    financialRiskCount: number;
    nonCompliantCount: number;
    highRiskCount: number;
    buildingCount: number;
  }>
> {
  try {
    const y = year ?? new Date().getFullYear() - 1;
    const supabase = await createClient();
    await requireUser(supabase);

    const { data: pis } = await supabase
      .from("performance_indicators")
      .select(
        "combined_risk_score, financial_risk_flag, meps_status, building_id"
      )
      .eq("year", y);

    const rows = pis ?? [];
    const scores = rows
      .map((r) => r.combined_risk_score as number | null)
      .filter((s): s is number => s != null);
    const avg =
      scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : null;

    return {
      success: true,
      data: {
        year: y,
        avgCombined: avg != null ? Math.round(avg * 10) / 10 : null,
        financialRiskCount: rows.filter((r) => r.financial_risk_flag).length,
        nonCompliantCount: rows.filter((r) => r.meps_status === "non_compliant")
          .length,
        highRiskCount: scores.filter((s) => s >= 60).length,
        buildingCount: rows.length,
      },
    };
  } catch (e) {
    return toError(e);
  }
}
