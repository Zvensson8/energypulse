"use client";

import { useQuery } from "@tanstack/react-query";
import { getBuildingAuditTrail } from "@/app/actions/compliance";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

export function AuditTrailSheet({
  open,
  onOpenChange,
  buildingId,
  buildingName,
  year,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string | null;
  buildingName?: string;
  year: number;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-trail", buildingId, year],
    enabled: open && Boolean(buildingId),
    queryFn: async () => {
      const res = await getBuildingAuditTrail({
        building_id: buildingId!,
        year,
        limit: 250,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Audit trail</SheetTitle>
          <SheetDescription>
            {buildingName ?? buildingId?.slice(0, 8)} · år {year} ·{" "}
            data_quality_logs
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 px-3 pb-3">
          {isLoading && (
            <div className="py-6 text-center text-table text-muted-foreground">
              Laddar loggar…
            </div>
          )}
          {error && (
            <div className="py-4 text-table text-destructive">
              {(error as Error).message}
            </div>
          )}
          {data && data.length === 0 && (
            <div className="py-6 text-center text-table text-muted-foreground">
              Inga loggrader för byggnad/år
            </div>
          )}
          <div className="space-y-1">
            {(data ?? []).map((log) => (
              <div
                key={log.id}
                className="rounded-sm border border-terminal-border/70 bg-terminal-bg px-2 py-1.5 font-mono text-2xs"
              >
                <div className="flex flex-wrap items-center gap-1">
                  <Badge
                    variant={
                      log.operation === "OVERRIDE"
                        ? "danger"
                        : log.operation === "DECRYPT"
                          ? "warning"
                          : "outline"
                    }
                  >
                    {log.operation}
                  </Badge>
                  <span className="text-terminal-muted">
                    {log.entity_type}
                    {log.field ? `.${log.field}` : ""}
                  </span>
                  <span className="ml-auto tabular text-terminal-muted">
                    {format(new Date(log.changed_at), "yyyy-MM-dd HH:mm:ss", {
                      locale: sv,
                    })}
                  </span>
                </div>
                {log.override_reason && (
                  <div className="mt-0.5 text-gap-incomplete">
                    override_reason: {log.override_reason}
                  </div>
                )}
                {(log.old_value || log.new_value) && (
                  <div className="mt-0.5 grid grid-cols-2 gap-1 text-[10px] text-terminal-muted">
                    <div className="truncate" title={log.old_value ?? ""}>
                      old: {truncate(log.old_value)}
                    </div>
                    <div className="truncate" title={log.new_value ?? ""}>
                      new: {truncate(log.new_value)}
                    </div>
                  </div>
                )}
                {log.changed_by && (
                  <div className="mt-0.5 text-[10px] text-terminal-muted">
                    by: {log.changed_by.slice(0, 8)}…
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function truncate(v: string | null, n = 80): string {
  if (!v) return "—";
  return v.length > n ? `${v.slice(0, n)}…` : v;
}
