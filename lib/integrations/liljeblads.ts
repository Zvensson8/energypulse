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
  const res = await fetch(webhookUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
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
  }));
}
