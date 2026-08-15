import { NextResponse } from "next/server";
import { verifyBridgeSecret } from "@/lib/integrations/energy-bridge";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!verifyBridgeSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    plan_item_id?: string;
    action_id?: string;
    title?: string;
    notes?: string | null;
    planned_year?: number;
    planned_quarter?: number;
    investment_cost?: number | null;
  };

  const actionId = String(body.action_id ?? "").trim();
  const planItemId = String(body.plan_item_id ?? "").trim();
  if (!actionId && !planItemId) {
    return NextResponse.json(
      { error: "action_id or plan_item_id required" },
      { status: 400 },
    );
  }

  try {
    const supabase = createServiceClient();
    let query = supabase.from("actions").select("id, title, description");
    if (actionId) query = query.eq("id", actionId);
    else query = query.eq("liljeblads_plan_item_id", planItemId);

    const { data: action, error: loadErr } = await query.maybeSingle();
    if (loadErr) {
      return NextResponse.json({ error: loadErr.message }, { status: 500 });
    }
    if (!action) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const quarter =
      typeof body.planned_quarter === "number" &&
      body.planned_quarter >= 1 &&
      body.planned_quarter <= 4
        ? body.planned_quarter
        : null;
    const year =
      typeof body.planned_year === "number" && body.planned_year >= 2000
        ? Math.round(body.planned_year)
        : null;

    const notes = body.notes != null ? String(body.notes).trim() : "";
    const descriptionParts = [
      quarter && year ? `Planerad Q${quarter} ${year}.` : null,
      notes || null,
    ].filter(Boolean);

    const patch: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) {
      patch.title = body.title.trim();
    }
    if (descriptionParts.length) {
      patch.description = descriptionParts.join(" ");
    }
    if (year != null) patch.planned_year = year;
    if (body.investment_cost === null) patch.investment_cost = null;
    else if (
      typeof body.investment_cost === "number" &&
      Number.isFinite(body.investment_cost)
    ) {
      patch.investment_cost = body.investment_cost;
    }
    if (planItemId) patch.liljeblads_plan_item_id = planItemId;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: true, action_id: action.id });
    }

    const { error: updErr } = await supabase
      .from("actions")
      .update(patch)
      .eq("id", action.id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, action_id: action.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bridge failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
