import { NextResponse } from "next/server";
import { verifyBridgeSecret } from "@/lib/integrations/energy-bridge";
import { createServiceClient } from "@/lib/supabase/server";
import { completeActionByWorkOrderId } from "@/lib/complete-action-core";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!verifyBridgeSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    work_order_id?: string;
  };
  const workOrderId = String(body.work_order_id ?? "").trim();
  if (!workOrderId) {
    return NextResponse.json(
      { error: "work_order_id required" },
      { status: 400 },
    );
  }

  try {
    const supabase = createServiceClient();
    const result = await completeActionByWorkOrderId(supabase, workOrderId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    if ("skipped" in result) {
      return NextResponse.json({ success: true, skipped: true });
    }
    return NextResponse.json({
      success: true,
      already: result.already,
      action_id: result.actionId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bridge failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
