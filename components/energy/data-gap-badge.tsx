import { AlertTriangle } from "lucide-react";
import type { DataGapStatus } from "@/lib/supabase/database.types";
import { cn, dataGapColor, dataGapLabel } from "@/lib/utils";
import { dataGapHelp } from "@/lib/labels";

export function DataGapBadge({
  status,
  completeness,
  className,
}: {
  status: DataGapStatus | null | undefined;
  completeness?: number | null;
  className?: string;
}) {
  const title = [
    dataGapLabel(status),
    completeness != null ? `${completeness.toFixed(0)} % komplett` : null,
    dataGapHelp(status),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        dataGapColor(status),
        className
      )}
      title={title}
    >
      {status === "INCOMPLETE_DATA" && (
        <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
      )}
      <span>{dataGapLabel(status)}</span>
      {completeness != null && (
        <span className="opacity-80 tabular">{completeness.toFixed(0)}%</span>
      )}
    </span>
  );
}
