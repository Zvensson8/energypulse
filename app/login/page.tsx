"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Leaf, ShieldCheck } from "lucide-react";
import { APP_TAGLINE } from "@/lib/labels";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = getBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) {
        const msg = authError.message.toLowerCase();
        if (msg.includes("invalid") || msg.includes("credentials")) {
          setError("Fel e-post eller lösenord. Kontrollera uppgifterna och försök igen.");
        } else {
          setError(authError.message);
        }
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inloggning misslyckades");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden bg-terminal-bg p-4">
      {/* Soft ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/4 top-1/4 h-64 w-64 rounded-full bg-terminal-accent/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-48 w-48 rounded-full bg-terminal-green/5 blur-3xl" />
      </div>

      <form
        onSubmit={onSubmit}
        className="panel relative w-full max-w-md space-y-4 rounded-lg p-6 shadow-xl"
      >
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-terminal-accent/15 text-terminal-accent">
            <Leaf className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              EnergyPulse
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-terminal-muted">
              {APP_TAGLINE}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="text-xs font-medium text-terminal-muted"
            >
              E-postadress
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="fornamn.efternamn@foretag.se"
              className="h-10 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="text-xs font-medium text-terminal-muted"
            >
              Lösenord
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-10 text-sm"
            />
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </div>
        )}

        <Button type="submit" className="h-10 w-full text-sm" disabled={loading}>
          {loading ? "Loggar in…" : "Logga in"}
        </Button>

        <div className="flex items-start gap-2 rounded-md bg-terminal-row/60 px-3 py-2 text-2xs leading-snug text-terminal-muted">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-terminal-green" />
          <span>
            Du ser bara de fastigheter din organisation har gett dig tillgång
            till. Kontakta din administratör om du saknar behörighet.
          </span>
        </div>
      </form>
    </div>
  );
}
