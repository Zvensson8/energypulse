import type { AppSupabaseClient } from "@/lib/supabase/server";

export type CompleteCoreResult =
  | { ok: true; already: boolean; actionId: string }
  | { ok: false; error: string };

type AnyClient = Pick<AppSupabaseClient, "from" | "rpc">;

export async function applyCompletedActionCore(
  supabase: AnyClient,
  input: { actionId: string; year?: number | null; reason: string },
): Promise<CompleteCoreResult> {
  const { data: action, error: aErr } = await supabase
    .from("actions")
    .select("id, status")
    .eq("id", input.actionId)
    .maybeSingle();
  if (aErr || !action) {
    return { ok: false, error: aErr?.message ?? "Åtgärden hittades inte" };
  }
  if (action.status === "completed") {
    return { ok: true, already: true, actionId: action.id };
  }

  const { error: uErr } = await supabase
    .from("actions")
    .update({
      status: "completed",
      completed_date: new Date().toISOString().slice(0, 10),
    })
    .eq("id", input.actionId);
  if (uErr) return { ok: false, error: uErr.message };

  const { data: existingApp } = await supabase
    .from("action_applications")
    .select("id")
    .eq("action_id", input.actionId)
    .eq("status", "applied")
    .maybeSingle();

  if (!existingApp) {
    const { error: rpcErr } = await supabase.rpc("apply_completed_action", {
      p_action_id: input.actionId,
      p_year: input.year ?? null,
      p_reason: input.reason,
    });
    if (rpcErr) {
      return {
        ok: false,
        error: `Åtgärd markerad klar men tillämpning misslyckades: ${rpcErr.message}`,
      };
    }
  }

  return { ok: true, already: false, actionId: input.actionId };
}

export async function completeActionByWorkOrderId(
  supabase: AnyClient,
  workOrderId: string,
): Promise<CompleteCoreResult | { ok: true; skipped: true }> {
  const { data: action, error } = await supabase
    .from("actions")
    .select("id")
    .eq("liljeblads_work_order_id", workOrderId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!action) return { ok: true, skipped: true };
  return applyCompletedActionCore(supabase, {
    actionId: action.id,
    reason: "Arbetsorder klar i Liljeblads",
  });
}
