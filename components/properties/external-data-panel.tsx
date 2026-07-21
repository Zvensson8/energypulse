"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getExternalDataStatus,
  getExternalIntegrationFlags,
  refreshPropertyExternalData,
} from "@/app/actions/external-data";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { HelpTip } from "@/components/ui/help-tip";
import {
  Landmark,
  Mountain,
  Waves,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExternalRefreshReport } from "@/lib/integrations";

const SOURCE_UI: Record<
  string,
  { label: string; icon: typeof Landmark; purpose: string }
> = {
  boverket: {
    label: "Boverket",
    icon: Landmark,
    purpose: "Klimatzon + DVUT (öppen data)",
  },
  msb: {
    label: "MSB",
    icon: Waves,
    purpose: "Översvämning vattendrag/kust",
  },
  sgi: {
    label: "SGI",
    icon: Mountain,
    purpose: "Skred-aktsamhet (SGU WMS)",
  },
};

const STATUS_SV: Record<string, string> = {
  disabled: "Av",
  stub: "Förberedd",
  ok: "Live",
  error: "Fel",
  missing_coords: "Saknar koordinater",
};

const RISK_SV: Record<string, string> = {
  flood: "Översvämning",
  heat: "Värme",
  storm: "Storm / vind",
  subsidence: "Sättning",
  wildfire: "Skogsbrand",
  other: "Skred / övrigt",
};

export function ExternalDataPanel({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const [applySuggestions, setApplySuggestions] = useState(false);
  const [lastReport, setLastReport] = useState<ExternalRefreshReport | null>(
    null
  );

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
        applySuggestions,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (data) => {
      setLastReport(data);
      void qc.invalidateQueries({
        queryKey: ["external-data-status", propertyId],
      });
      void qc.invalidateQueries({ queryKey: ["property", propertyId] });
      void qc.invalidateQueries({ queryKey: ["physical-risks"] });
    },
  });

  const sources = flagsQ.data?.sources ?? [
    {
      id: "boverket",
      label: "Boverket",
      purpose: SOURCE_UI.boverket.purpose,
      enabled: true,
    },
    {
      id: "msb",
      label: "MSB",
      purpose: SOURCE_UI.msb.purpose,
      enabled: true,
    },
    { id: "sgi", label: "SGI", purpose: SOURCE_UI.sgi.purpose, enabled: true },
  ];

  const lastBySource = new Map(
    (statusQ.data ?? []).map((r) => [r.source, r])
  );

  // Optional-chain every nested field – partial/legacy reports must not crash UI
  const hazardSuggestions = [
    ...(lastReport?.msb?.suggestions ?? []),
    ...(lastReport?.sgi?.suggestions ?? []),
  ];
  const anyEnabled = flagsQ.data?.anyEnabled ?? true;
  const boverketNotes = lastReport?.boverket?.notes ?? [];

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Externa datakällor</h2>
            <HelpTip text="Öppna data utan avtal: Boverket (klimatzon + DVUT), MSB (översvämningskartering), SGI via SGU WMS (skred-aktsamhet). Inte kortsiktigt väder. Förslag till fysiska risker sparas bara om du bockar i rutan." />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Kräver geokodad adress (lat/lon). Resultat sparas som snapshots;
            risker skapas endast om du väljer det.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={applySuggestions}
              onCheckedChange={(v) => setApplySuggestions(v === true)}
            />
            Spara MSB/SGI-förslag som risker
          </label>
          <Button
            size="sm"
            disabled={refresh.isPending || !anyEnabled}
            onClick={() => void refresh.mutateAsync()}
          >
            {refresh.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Uppdatera externa källor
          </Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {sources.map((s) => {
          const ui = SOURCE_UI[s.id] ?? {
            label: s.label,
            icon: Landmark,
            purpose: s.purpose,
          };
          const Icon = ui.icon;
          const last = lastBySource.get(s.id);
          const liveStatus =
            s.id === "boverket"
              ? lastReport?.boverket?.status
              : s.id === "msb"
                ? lastReport?.msb?.status
                : s.id === "sgi"
                  ? lastReport?.sgi?.status
                  : null;
          const status =
            liveStatus ?? last?.status ?? (s.enabled ? "ok" : "disabled");
          const liveMessage =
            s.id === "boverket"
              ? lastReport?.boverket?.message
              : s.id === "msb"
                ? lastReport?.msb?.message
                : s.id === "sgi"
                  ? lastReport?.sgi?.message
                  : null;
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
                    status === "disabled" && "bg-slate-100 text-slate-600",
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
              {(liveMessage || last?.message) && (
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                  {liveMessage ?? last?.message}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {boverketNotes.length > 0 && (
        <div className="rounded-xl border border-border bg-secondary/10 px-3 py-3">
          <div className="text-sm font-medium">Boverket – underlag</div>
          <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-muted-foreground">
            {boverketNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {hazardSuggestions.length > 0 && (
        <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-3">
          <div className="text-sm font-medium text-sky-950">
            Riskförslag ({hazardSuggestions.length})
          </div>
          <ul className="space-y-2">
            {hazardSuggestions.map((h) => (
              <li
                key={h.sourceRef + h.risk_type}
                className="rounded-lg border border-sky-100 bg-white px-3 py-2 text-xs text-foreground"
              >
                <span className="font-semibold">
                  {RISK_SV[h.risk_type] ?? h.risk_type}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · sannolikhet {h.probability} · konsekvens {h.consequence}
                </span>
                <p className="mt-1 leading-relaxed text-muted-foreground">
                  {h.summary}
                </p>
              </li>
            ))}
          </ul>
          {!applySuggestions && (
            <p className="text-[11px] text-sky-900">
              Bocka i «Spara MSB/SGI-förslag som risker» och kör igen för att
              lägga in dem i riskregistret.
            </p>
          )}
        </div>
      )}

      {refresh.isSuccess && refresh.data && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Klart. Snapshots: {refresh.data.snapshotIds?.length ?? 0}
            {(refresh.data.appliedRiskIds?.length ?? 0) > 0
              ? ` · nya risker: ${refresh.data.appliedRiskIds.length}`
              : applySuggestions
                ? " · inga nya risker (inga förslag eller redan sparade)"
                : " · risker sparades inte (kryssruta av)"}
            .
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
