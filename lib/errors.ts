/**
 * Mappa tekniska fel till svenska, handlingsbara meddelanden.
 */

const MAP: Array<{ match: RegExp | string; message: string }> = [
  {
    match: /UNAUTHORIZED|not authenticated|JWT|session/i,
    message: "Du är inte inloggad eller sessionen har gått ut. Logga in igen.",
  },
  {
    match: /FORBIDDEN|otillräcklig|ej aktiverad|not enabled/i,
    message: "Du saknar behörighet för den här åtgärden. Kontakta en administratör.",
  },
  {
    match: /network|fetch failed|Failed to fetch|ECONNREFUSED|timeout/i,
    message: "Nätverksfel – kontrollera uppkopplingen och försök igen.",
  },
  {
    match: /JWT|Invalid API key|supabase/i,
    message: "Kunde inte nå databasen. Försök igen om en stund.",
  },
  {
    match: /Ogiltig JSON|JSON\.parse/i,
    message: "Ogiltigt format i fältet. Kontrollera siffror och sparade värden.",
  },
  {
    match: /duplicate key|unique constraint/i,
    message: "Posten finns redan. Ändra namn eller identifierare.",
  },
  {
    match: /foreign key|violates foreign/i,
    message: "Kopplingen saknas (t.ex. byggnad eller fastighet). Ladda om sidan.",
  },
  {
    match: /row-level security|RLS|permission denied/i,
    message: "Åtkomst nekad av behörighetsregler. Du får inte se eller ändra denna data.",
  },
];

export function toUserError(error: unknown, fallback?: string): string {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : fallback ?? "Något gick fel. Försök igen.";

  for (const { match, message } of MAP) {
    if (typeof match === "string") {
      if (raw.includes(match)) return message;
    } else if (match.test(raw)) {
      return message;
    }
  }

  // Already Swedish-ish short messages from our actions
  if (/^[A-ZÅÄÖa-zåäö0-9 .,:;()%/\-–—]+$/.test(raw) && raw.length < 220) {
    return raw;
  }

  return fallback ?? "Något gick fel. Försök igen eller kontakta support.";
}

export type DataQualityLevel = "ok" | "warning" | "blocked";

export function dataQualityLevel(
  incompleteCount: number,
  extrapolatedCount: number,
  totalWithPerf: number
): DataQualityLevel {
  if (totalWithPerf === 0) return "warning";
  if (incompleteCount > 0) return "blocked";
  if (extrapolatedCount > 0) return "warning";
  return "ok";
}
