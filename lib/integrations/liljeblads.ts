/**
 * Read-only client for Liljeblads (technical FM).
 * Uses existing jarvis-webhook + lbl_ API key — no Liljeblads schema change.
 */

export type LiljebladsProperty = {
  id: string;
  name: string;
  address: string | null;
  property_number: string | null;
};

export type LiljebladsComponent = {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  room_zone: string | null;
  next_service_date: string | null;
  property_id: string | null;
  property_name: string | null;
  risk_score: number | null;
  risk_level: string | null;
  remaining_b10_years: number | null;
};

export type LiljebladsComponentRisk = {
  component_id: string;
  risk_score: number | null;
  risk_level: string | null;
  remaining_b10_years: number | null;
  recommendation: string | null;
};

export type LiljebladsWorkOrder = {
  id: string;
};

export type LiljebladsPlanItem = {
  id: string;
  plan_id: string;
  created: boolean;
};

type WebhookOk = {
  success: true;
  results?: unknown[];
};

function webhookUrl(): string {
  const url = (process.env.LILJEBLADS_WEBHOOK_URL ?? "").trim();
  if (!url) {
    throw new Error(
      "LILJEBLADS_WEBHOOK_URL saknas (t.ex. …/functions/v1/jarvis-webhook)",
    );
  }
  return url;
}

function apiKey(): string {
  const key = (process.env.LILJEBLADS_API_KEY ?? "").trim();
  if (!key) throw new Error("LILJEBLADS_API_KEY saknas (lbl_…)");
  return key;
}

export function isLiljebladsConfigured(): boolean {
  return Boolean(
    process.env.LILJEBLADS_WEBHOOK_URL?.trim() &&
      process.env.LILJEBLADS_API_KEY?.trim(),
  );
}

async function callWebhook(body: Record<string, unknown>): Promise<unknown> {
  const key = apiKey();
  const anon =
    (process.env.LILJEBLADS_ANON_KEY ?? process.env.LILJEBLADS_PUBLISHABLE_KEY ?? "").trim();
  const res = await fetch(webhookUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "x-api-key": key,
      ...(anon ? { apikey: anon } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as
    | WebhookOk
    | { success?: false; error?: string }
    | null;
  if (!res.ok || !json || json.success === false) {
    const msg =
      json && "error" in json && json.error
        ? String(json.error)
        : `Liljeblads ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

export async function listLiljebladsProperties(): Promise<LiljebladsProperty[]> {
  const json = (await callWebhook({ type: "list_properties" })) as {
    results?: Array<Record<string, unknown>>;
  };
  return (json.results ?? []).map((p) => ({
    id: String(p.id),
    name: String(p.name ?? ""),
    address: (p.address as string | null) ?? null,
    property_number: (p.property_number as string | null) ?? null,
  }));
}

export async function listLiljebladsComponents(
  propertyId: string,
): Promise<LiljebladsComponent[]> {
  const json = (await callWebhook({
    type: "search_components",
    property_id: propertyId,
    limit: 100,
  })) as { results?: Array<Record<string, unknown>> };
  return (json.results ?? []).map((c) => ({
    id: String(c.id),
    name: String(c.name ?? ""),
    type: (c.type as string | null) ?? null,
    status: (c.status as string | null) ?? null,
    manufacturer: (c.manufacturer as string | null) ?? null,
    model: (c.model as string | null) ?? null,
    serial_number: (c.serial_number as string | null) ?? null,
    room_zone: (c.room_zone as string | null) ?? null,
    next_service_date: (c.next_service_date as string | null) ?? null,
    property_id: (c.property_id as string | null) ?? null,
    property_name: (c.property_name as string | null) ?? null,
    risk_score: null,
    risk_level: null,
    remaining_b10_years: null,
  }));
}

export async function listLiljebladsComponentRisks(
  propertyId: string,
): Promise<LiljebladsComponentRisk[]> {
  const json = (await callWebhook({
    type: "list_high_risk_components",
    property_id: propertyId,
    min_level: "low",
    min_confidence: "low",
    limit: 50,
  })) as { results?: Array<Record<string, unknown>> };
  return (json.results ?? []).map((r) => ({
    component_id: String(r.component_id ?? ""),
    risk_score:
      typeof r.risk_score === "number" ? r.risk_score : null,
    risk_level: (r.risk_level as string | null) ?? null,
    remaining_b10_years:
      typeof r.remaining_b10_years === "number"
        ? r.remaining_b10_years
        : null,
    recommendation: (r.recommendation as string | null) ?? null,
  }));
}

export async function createLiljebladsWorkOrder(input: {
  propertyId: string;
  actionText: string;
  componentId?: string | null;
  priority?: string;
  priceEstimate?: string | null;
  rawContext?: string;
}): Promise<LiljebladsWorkOrder> {
  const json = (await callWebhook({
    type: "work_order",
    property_id: input.propertyId,
    action_text: input.actionText,
    component_id: input.componentId ?? undefined,
    priority: input.priority ?? "medium",
    price_estimate: input.priceEstimate ?? undefined,
    source: "energypulse",
    raw_context: input.rawContext ?? undefined,
  })) as { result?: { id?: string } };
  const id = json.result?.id;
  if (!id) throw new Error("Liljeblads svarade utan arbetsorder-id");
  return { id: String(id) };
}

export async function upsertLiljebladsPlanItem(input: {
  propertyId: string;
  actionText: string;
  externalId: string;
  year: number;
  quarter: number;
  actionType: string;
  estimatedCost?: number | null;
  notes?: string | null;
  componentId?: string | null;
}): Promise<LiljebladsPlanItem> {
  const json = (await callWebhook({
    type: "upsert_plan_item",
    property_id: input.propertyId,
    action_text: input.actionText,
    external_id: input.externalId,
    year: input.year,
    quarter: input.quarter,
    action_type: input.actionType,
    estimated_cost: input.estimatedCost ?? undefined,
    notes: input.notes ?? undefined,
    component_id: input.componentId ?? undefined,
    source: "energypulse",
  })) as {
    created?: boolean;
    result?: { id?: string; plan_id?: string };
  };
  const id = json.result?.id;
  const planId = json.result?.plan_id;
  if (!id || !planId) {
    throw new Error("Liljeblads svarade utan planrad-id");
  }
  return { id: String(id), plan_id: String(planId), created: Boolean(json.created) };
}
