"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listPropertyDecisions } from "@/app/actions/property-decisions";
import {
  ArrowRight,
  AlertTriangle,
  Loader2,
  MapPinned,
  Upload,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toUserError } from "@/lib/errors";
import type { PropertyDecisionStatus } from "@/lib/property-decision";

const TONE: Record<
  PropertyDecisionStatus,
  { chip: string; border: string; label: string }
> = {
  needs_decision: {
    chip: "bg-red-50 text-red-700",
    border: "border-red-200 hover:border-red-300",
    label: "Kräver beslut",
  },
  missing_data: {
    chip: "bg-amber-50 text-amber-800",
    border: "border-amber-200 hover:border-amber-300",
    label: "Saknar data",
  },
  ok: {
    chip: "bg-emerald-50 text-emerald-800",
    border: "border-border hover:border-primary/25",
    label: "Ok",
  },
};

export function HomeHub() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["property-decisions"],
    queryFn: async () => {
      const res = await listPropertyDecisions();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const rows = data ?? [];
  const attention = rows.filter((r) => r.status !== "ok");
  const okCount = rows.filter((r) => r.status === "ok").length;
  const decideCount = rows.filter((r) => r.status === "needs_decision").length;
  const dataCount = rows.filter((r) => r.status === "missing_data").length;

  return (
    <div className="page-shell">
      <div className="page-inner max-w-3xl">
        <section>
          <h1 className="page-title">Beslut</h1>
          <p className="page-subtitle">
            Kräver beslut = klarar inte 2030 eller klimatriskår före 2035.
            Saknar data = ingen eller ofullständig beräkning.
          </p>
          {!isLoading && rows.length > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="font-medium text-red-700">{decideCount} kräver beslut</span>
              {" · "}
              <span className="font-medium text-amber-800">{dataCount} saknar data</span>
              {" · "}
              <span className="font-medium text-emerald-800">{okCount} ok</span>
            </p>
          )}
        </section>

        {isLoading && (
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Hämtar beståndet…
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {toUserError(error, "Logga in och försök igen.")}
          </div>
        )}

        {!isLoading && !error && rows.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
            <MapPinned className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <h2 className="mt-3 text-lg font-semibold">Inga fastigheter här än</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Hämta från Liljeblads eller skapa en ny. Sedan importerar du
              energi.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/properties">
                  <MapPinned className="h-4 w-4" />
                  Fastigheter
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/import">
                  <Upload className="h-4 w-4" />
                  Importera
                </Link>
              </Button>
            </div>
          </div>
        )}

        {!isLoading && attention.length > 0 && (
          <ul className="space-y-2">
            {attention.map((row) => {
              const tone = TONE[row.status];
              return (
                <li key={row.propertyId}>
                  <Link
                    href={`/properties/${row.propertyId}`}
                    className={cn(
                      "group flex items-start justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm transition hover:shadow-md",
                      tone.border,
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            tone.chip,
                          )}
                        >
                          {tone.label}
                        </span>
                        <h2 className="truncate text-base font-semibold group-hover:text-primary">
                          {row.name}
                        </h2>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {row.why}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                      Öppna
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {!isLoading && rows.length > 0 && attention.length === 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
            <div className="flex items-center gap-2 font-semibold text-emerald-900">
              <CheckCircle2 className="h-5 w-5" />
              Inget akut
            </div>
            <p className="mt-1 text-sm text-emerald-900/80">
              Inget krav- eller klimattröskelbrott i senaste beräkningen.
            </p>
            <Button className="mt-4" variant="outline" asChild>
              <Link href="/properties">Alla fastigheter</Link>
            </Button>
          </div>
        )}

        {okCount > 0 && attention.length > 0 && (
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/properties" className="text-primary hover:underline">
              {okCount} hus är ok
            </Link>
            {" — inget 2030-gap eller klimatriskår före 2035."}
          </p>
        )}
      </div>
    </div>
  );
}
