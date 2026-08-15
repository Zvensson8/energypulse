"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Minst 8 tecken.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = getBrowserClient();
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) {
        setError(updErr.message);
        return;
      }
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-3xl border border-border bg-card p-8 shadow-soft"
      >
        <h1 className="text-xl font-semibold">Nytt lösenord</h1>
        <p className="text-sm text-muted-foreground">
          Sätt ett lösenord för EnergyPulse. Detta är inte samma konto som
          Liljeblads.
        </p>
        <Input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          placeholder="Nytt lösenord"
        />
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Sparar…" : "Spara och gå in"}
        </Button>
      </form>
    </div>
  );
}
