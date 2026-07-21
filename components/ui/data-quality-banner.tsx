"use client";

import Link from "next/link";
import { AlertTriangle, ShieldAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DataQualityLevel } from "@/lib/errors";

/**
 * Varnar innan beslut/export när data är ofullständig eller uppskattad.
 */
export function DataQualityBanner({
  level,
  incompleteCount = 0,
  extrapolatedCount = 0,
  context = "beslut",
  className,
}: {
  level: DataQualityLevel;
  incompleteCount?: number;
  extrapolatedCount?: number;
  /** t.ex. "rapport", "beslutsunderlag", "score" */
  context?: string;
  className?: string;
}) {
  if (level === "ok") return null;

  if (level === "blocked") {
    return (
      <div
        className={cn(
          "flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900",
          className
        )}
        role="alert"
      >
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            Ofullständig data – var försiktig med {context}
          </div>
          <p className="mt-0.5 text-red-800/90">
            {incompleteCount > 0
              ? `${incompleteCount} byggnadsår saknar för mycket mätvärden. `
              : ""}
            Använd inte siffrorna som enda underlag till ledningen utan att
            komplettera data eller dokumentera override.
          </p>
          <Link
            href="/import"
            className="mt-2 inline-block font-medium text-red-900 underline-offset-2 hover:underline"
          >
            Importera energidata →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950",
        className
      )}
      role="status"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Uppskattad eller begränsad data</div>
        <p className="mt-0.5 text-amber-900/90">
          {extrapolatedCount > 0
            ? `${extrapolatedCount} byggnadsår har ifyllda månader. `
            : "Prestanda saknas för delar av urvalet. "}
          Resultatet kan användas som indikation – dubbelkolla före formella
          beslut.
        </p>
      </div>
    </div>
  );
}

export function DataQualityHint({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "inline-flex items-start gap-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {text}
    </p>
  );
}
