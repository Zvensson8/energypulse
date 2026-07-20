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
        <div className="border-b border-terminal-border px-3 py-2 pr-10">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">
              Override INCOMPLETE_DATA
            </DialogTitle>
            <DialogDescription>
              {buildingName ?? buildingId?.slice(0, 8)} · år {year}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-2 p-3">
          {/* Warning */}
          <div className="flex gap-2 rounded-sm border border-gap-incomplete/50 bg-gap-incomplete/10 p-2 text-table">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gap-incomplete" />
            <div className="space-y-1">
              <div className="font-medium text-gap-incomplete">
                Beslut tas på ofullständig data
              </div>
              <p className="text-2xs text-terminal-muted">
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
            <div className="text-2xs text-terminal-muted">Kontrollerar behörighet…</div>
          )}

          {eligibility.data && !allowed && (
            <div className="rounded-sm border border-terminal-border bg-terminal-row p-2 text-table text-destructive">
              Override ej tillåten
              {eligibility.data.role ? ` för roll ${eligibility.data.role}` : ""}.
              {eligibility.data.reason ? ` ${eligibility.data.reason}` : ""}
            </div>
          )}

          {allowed && (
            <>
              <div className="space-y-1">
                <label className="text-2xs uppercase text-terminal-muted">
                  Motivering (obligatorisk, min 5 tecken)
                </label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="T.ex. Godkänt av portföljchef för Q1-rapport – saknad data bedöms ej material…"
                  className="min-h-[88px] font-mono text-table"
                />
                <div className="text-2xs text-terminal-muted tabular">
                  {reason.trim().length}/5+
                </div>
              </div>

              {mutation.isError && (
                <div className="text-table text-destructive">
                  {(mutation.error as Error).message}
                </div>
              )}

              <div className="flex justify-end gap-1">
                <Button
                  type="button"
                  variant="terminal"
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
