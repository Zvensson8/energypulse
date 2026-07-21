"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getExternalDataStatus,
  getExternalIntegrationFlags,
  refreshPropertyExternalData,
} from "@/app/actions/external-data";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/ui/help-tip";
import {
  CloudSun,
  Landmark,
  Mountain,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SOURCE_UI: Record<
  string,
  { label: string; icon: typeof CloudSun; purpose: string }
> = {
  smhi: {
    label: "SMHI",
    icon: CloudSun,
    purpose: "Klimat & väder → värme, nederbörd, storm",
  },
  boverket: {
    label: "Boverket",
    icon: Landmark,
    purpose: "Klimatzon & energinorm-kontext",
  },
  gsi: {
    label: "GSI",
    icon: Mountain,
    purpose: "Mark / skred / sättning (geodata)",
  },
};

const STATUS_SV: Record<string, string> = {
  disabled: "Av",
  stub: "Förberedd",
  ok: "OK",
  error: "Fel",
  missing_coords: "Saknar koordinater",
};

export function ExternalDataPanel({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();

  const flagsQ = useQuery({
    queryKey: ["external-integration-flags"],
    queryFn: async () => {
      const res = await getExternalIntegrationFlags();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    staleTime: 60_000,
  });

  const statusQ = useQuery({
    queryKey: ["external-data-status", propertyId],
    queryFn: async () => {
      const res = await getExternalDataStatus(propertyId);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const refresh = useMutation({
    mutationFn: async () => {
      const res = await refreshPropertyExternalData({
        propertyId,
        applySuggestions: false,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["external-data-status", propertyId],
      });
    },
  });

  const sources = flagsQ.data?.sources ?? [
    { id: "smhi", label: "SMHI", purpose: SOURCE_UI.smhi.purpose, enabled: false },
    {
      id: "boverket",
      label: "Boverket",
      purpose: SOURCE_UI.boverket.purpose,
      enabled: false,
    },
    { id: "gsi", label: "GSI", purpose: SOURCE_UI.gsi.purpose, enabled: false },
  ];

  const lastBySource = new Map(
    (statusQ.data ?? []).map((r) => [r.source, r])
  );

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Externa datakällor</h2>
            <HelpTip text="Förberedelse för API: SMHI (klimat), Boverket (zon/norm), GSI (markrisk). Inga live-anrop förrän flaggor aktiveras i miljövariabler. Se docs/INTEGRATIONS_SMHI_BOVERKET_GSI.md." />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Underlag till fysiska risker och klimatzon – ersätter inte
            energimätning eller manuell bedömning.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={refresh.isPending}
          onClick={() => void refresh.mutateAsync()}
        >
          {refresh.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Kör adapters
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {sources.map((s) => {
          const ui = SOURCE_UI[s.id] ?? {
            label: s.label,
            icon: CloudSun,
            purpose: s.purpose,
          };
          const Icon = ui.icon;
          const last = lastBySource.get(s.id);
          const status = last?.status ?? (s.enabled ? "stub" : "disabled");
          return (
            <div
              key={s.id}
              className="rounded-xl border border-border bg-secondary/20 px-3 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="h-4 w-4 text-primary" />
                  {ui.label}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                    status === "disabled" &&
                      "bg-slate-100 text-slate-600",
                    status === "stub" && "bg-sky-50 text-sky-800",
                    status === "ok" && "bg-emerald-50 text-emerald-700",
                    status === "error" && "bg-red-50 text-red-700",
                    status === "missing_coords" &&
                      "bg-amber-50 text-amber-800"
                  )}
                >
                  {STATUS_SV[status] ?? status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{ui.purpose}</p>
              {last?.message && (
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                  {last.message}
                </p>
              )}
              {last?.fetched_at && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Senast: {new Date(last.fetched_at).toLocaleString("sv-SE")}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {refresh.isSuccess && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Adapters körda. Snapshots:{" "}
            {refresh.data.snapshotIds.length || "0 (tabell saknas? kör migration)"}.
            Risker skapas inte automatiskt i stub-läge.
          </span>
        </div>
      )}
      {refresh.isError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {(refresh.error as Error).message}
        </div>
      )}
    </section>
  );
}
