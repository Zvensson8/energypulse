import type { AppSupabaseClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/database.types";
import { logger } from "@/lib/logger";

export interface SessionUser {
  id: string;
  email: string | null;
  role: UserRole;
  is_active: boolean;
}

export async function requireUser(
  supabase: AppSupabaseClient
): Promise<SessionUser> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("UNAUTHORIZED");
  }

  const { data: profile, error: pErr } = await supabase
    .from("user_profiles")
    .select("id, email, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr) {
    logger.error("Failed to load user_profiles", { error: pErr.message });
    throw new Error("PROFILE_LOAD_FAILED");
  }

  // Allow authenticated users without profile row in early setups:
  // treat as viewer so RLS still applies; Fas 3 UI remains usable for demos
  // once profile exists with elevated role.
  if (!profile) {
    logger.warn("user_profiles missing – defaulting to viewer", {
      userId: user.id,
    });
    return {
      id: user.id,
      email: user.email ?? null,
      role: "viewer",
      is_active: true,
    };
  }

  if (!profile.is_active) {
    throw new Error("FORBIDDEN");
  }

  return {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    is_active: profile.is_active,
  };
}

export function assertRole(user: SessionUser, allowed: UserRole[]): void {
  if (!allowed.includes(user.role)) {
    throw new Error(`FORBIDDEN_ROLE:${user.role}`);
  }
}

/** Roles that may write ingestion data. */
export const WRITE_ROLES: UserRole[] = [
  "admin",
  "portfolio_manager",
  "property_manager",
];

/** Roles that may override INCOMPLETE_DATA (default; also checked via system_config). */
export const OVERRIDE_ROLES: UserRole[] = ["admin", "portfolio_manager"];
