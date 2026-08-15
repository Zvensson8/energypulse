"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listPropertyDecisions } from "@/app/actions/property-decisions";
import { doNextForProperty } from "@/app/actions/home-do";
import { exportPropertyBudgetPdf } from "@/app/actions/export-budget-pdf";
import { downloadBase64Pdf } from "@/lib/download-pdf";
import {
  Loader2,
  MapPinned,
  Upload,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toUserError } from "@/lib/errors";
import type { PropertyDecisionStatus } from "@/lib/property-decision";

const TONE: Record<
  PropertyDecisionStatus,
  { chip: string; border: string; label: string }
> = {
  unlinked: {
    chip: "bg-red-100 text-red-800",
    border: "border-red-300 hover:border-red-400",
    label: "Ej kopplad",
  },
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
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["property-decisions"],
    queryFn: async () => {
      const res = await listPropertyDecisions();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const rows = data ?? [];
  const work = rows.filter((r) => r.status !== "ok");
  const okCount = rows.filter((r) => r.status === "ok").length;

  const doMut = useMutation({
    mutationFn: async (propertyId: string) => {
      const res = await doNextForProperty(propertyId);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (d) => {
      window.location.href = d.href;
    },
  });

  const pdfMut = useMutation({
    mutationFn: async (propertyId: string) => {
      const res = await exportPropertyBudgetPdf({ propertyId });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (d) => downloadBase64Pdf(d.fileBase64, d.fileName),
  });

  return (
    <div className="page-shell">
      <div className="page-inner max-w-3xl">
        <section>
          <h1 className="page-title">I dag</h1>
          <p className="page-subtitle">
            Hus · därför · nästa. Gör öppnar åtgärder att godkänna.
          </p>
          {!isLoading && rows.length > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="font-medium text-red-700">
                {rows.filter((r) => r.status === "unlinked").length} ej kopplade
              </span>
              {" · "}
              <span className="font-medium text-red-700">
                {rows.filter((r) => r.status === "needs_decision").length} kräver
                beslut
              </span>
              {" · "}
              <span className="font-medium text-amber-800">
                {rows.filter((r) => r.status === "missing_data").length} saknar
                data
              </span>
              {" · "}
              <span className="font-medium text-emerald-800">{okCount} ok</span>
            </p>
          )}
        </section>

        {isLoading && (
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Hämtar kön…
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {toUserError(error, "Logga in och försök igen.")}
          </div>
        )}

        {(doMut.isError || pdfMut.isError) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {(doMut.error || pdfMut.error) instanceof Error
              ? ((doMut.error || pdfMut.error) as Error).message
              : "Något gick fel"}
          </div>
        )}

        {!isLoading && !error && rows.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
            <MapPinned className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <h2 className="mt-3 text-lg font-semibold">Inga fastigheter</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Hämta från Liljeblads. Koppla. Importera energi.
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

        {!isLoading && work.length > 0 && (
          <ul className="space-y-2">
            {work.map((row) => {
              const tone = TONE[row.status];
              const busy =
                (doMut.isPending && doMut.variables === row.propertyId) ||
                (pdfMut.isPending && pdfMut.variables === row.propertyId);
              const canDo = row.next.verb === "do" && row.linked;
              const href =
                row.next.verb === "do"
                  ? `/properties/${row.propertyId}?tab=plan`
                  : (row.next.href ?? `/properties/${row.propertyId}`);
              return (
                <li
                  key={row.propertyId}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm",
                    tone.border,
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          tone.chip,
                        )}
                      >
                        {tone.label}
                      </span>
                      <Link
                        href={`/properties/${row.propertyId}`}
                        className="truncate text-base font-semibold hover:text-primary"
                      >
                        {row.name}
                      </Link>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {row.why}
                      {row.topAction ? ` · ${row.topAction.title}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {row.linked && row.status !== "unlinked" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void pdfMut.mutateAsync(row.propertyId)}
                      >
                        {pdfMut.isPending &&
                        pdfMut.variables === row.propertyId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                        PDF
                      </Button>
                    )}
                    {canDo ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void doMut.mutateAsync(row.propertyId)}
                      >
                        {doMut.isPending &&
                        doMut.variables === row.propertyId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        Gör
                      </Button>
                    ) : (
                      <Button size="sm" asChild>
                        <Link href={href}>{row.next.label}</Link>
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!isLoading && rows.length > 0 && work.length === 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
            <div className="flex items-center gap-2 font-semibold text-emerald-900">
              <CheckCircle2 className="h-5 w-5" />
              Kön är tom
            </div>
            <p className="mt-1 text-sm text-emerald-900/80">
              Inget 2030-gap, klimatriskår före 2035 eller okopplad fastighet.
            </p>
            <Button className="mt-4" variant="outline" asChild>
              <Link href="/properties">Alla fastigheter</Link>
            </Button>
          </div>
        )}

        {okCount > 0 && work.length > 0 && (
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/properties" className="text-primary hover:underline">
              {okCount} hus är ok
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
