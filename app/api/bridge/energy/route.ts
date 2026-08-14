import { NextResponse } from "next/server";
import {
  buildEnergyBridgePayload,
  verifyBridgeSecret,
} from "@/lib/integrations/energy-bridge";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!verifyBridgeSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    liljeblads_property_id?: string;
  };
  const id = String(body.liljeblads_property_id ?? "").trim();
  if (!id) {
    return NextResponse.json(
      { error: "liljeblads_property_id required" },
      { status: 400 },
    );
  }

  try {
    const data = await buildEnergyBridgePayload(id);
    return NextResponse.json({ success: true, ...data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bridge failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
