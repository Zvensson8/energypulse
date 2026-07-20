"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getOverrideEligibility } from "@/app/actions/compliance";
import { overrideIncompletePerformance } from "@/app/actions/override";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { DataGapBadge } from "@/components/energy/data-gap-badge";
import type { DataGapStatus } from "@/lib/supabase/database.types";

export function OverrideDialog({
  open,
  onOpenChange,
  buildingId,
  buildingName,
  year,
  dataGapStatus,
  completeness,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string | null;
  buildingName?: string;
  year: number;
  dataGapStatus?: DataGapStatus | string | null;
  completeness?: number | null;
}) {
  const [reason, setReason] = useState("");
  const qc = useQueryClient();

  const eligibility = useQuery({
    queryKey: ["override-eligibility"],
    enabled: open,
    queryFn: async () => {
      const res = await getOverrideEligibility();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!buildingId) throw new Error("Saknar building_id");
      const res = await overrideIncompletePerformance({
        building_id: buildingId,
        year,
        override_reason: reason.trim(),
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["buildings-table"] });
      void qc.invalidateQueries({ queryKey: ["formula-context"] });
      void qc.invalidateQueries({ queryKey: ["provenance"] });
      void qc.invalidateQueries({ queryKey: ["audit-trail"] });
      void qc.invalidateQueries({ queryKey: ["crrem-chart"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      setReason("");
      onOpenChange(false);
    },
  });

  const allowed = eligibility.data?.allowed ?? false;
  const canSubmit =
    allowed && reason.trim().length >= 5 && Boolean(buildingId) && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <div className="border-b border-border px-5 py-4 pr-12">
          <DialogHeader>
            <DialogTitle className="text-base">
              Override INCOMPLETE_DATA
            </DialogTitle>
            <DialogDescription>
              {buildingName ?? buildingId?.slice(0, 8)} · år {year}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-3 p-5">
          {/* Warning */}
          <div className="flex gap-2 rounded-xl border border-gap-incomplete/50 bg-gap-incomplete/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gap-incomplete" />
            <div className="space-y-1.5">
              <div className="font-medium text-gap-incomplete">
                Beslut tas på ofullständig data
              </div>
              <p className="text-xs text-muted-foreground">
                Override låser upp MEPS- och CRREM-beräkningar trots{" "}
                <code className="text-gap-incomplete">INCOMPLETE_DATA</code>.
                Motivering loggas i{" "}
                <code>data_quality_logs.override_reason</code> och är
                revisionsskyldig.
              </p>
              {dataGapStatus && (
                <DataGapBadge
                  status={dataGapStatus as DataGapStatus}
                  completeness={completeness}
                />
              )}
            </div>
          </div>

          {eligibility.isLoading && (
            <div className="text-xs text-muted-foreground">Kontrollerar behörighet…</div>
          )}

          {eligibility.data && !allowed && (
            <div className="rounded-xl border border-border bg-muted/50 p-3 text-sm text-destructive">
              Override ej tillåten
              {eligibility.data.role ? ` för roll ${eligibility.data.role}` : ""}.
              {eligibility.data.reason ? ` ${eligibility.data.reason}` : ""}
            </div>
          )}

          {allowed && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Motivering (obligatorisk, min 5 tecken)
                </label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="T.ex. Godkänt av portföljchef för Q1-rapport – saknad data bedöms ej material…"
                  className="min-h-[88px] text-sm"
                />
                <div className="text-xs tabular text-muted-foreground">
                  {reason.trim().length}/5+
                </div>
              </div>

              {mutation.isError && (
                <div className="text-sm text-destructive">
                  {(mutation.error as Error).message}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                >
                  Avbryt
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!canSubmit}
                  onClick={() => mutation.mutate()}
                >
                  {mutation.isPending ? "Kör…" : "Bekräfta override"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
