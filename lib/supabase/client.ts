"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Typed Supabase browser client for React Query hooks / client components.
 * RLS applies based on the authenticated user session.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase-nycklar saknas i klienten. Sätt NEXT_PUBLIC_SUPABASE_URL och NEXT_PUBLIC_SUPABASE_ANON_KEY (inte Sensitive) på Vercel och bygg om.",
    );
  }
  return createBrowserClient<Database>(url, key);
}

let browserClient: ReturnType<typeof createClient> | undefined;

/** Singleton for client-side hooks (avoids multiple GoTrue clients). */
export function getBrowserClient() {
  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}
