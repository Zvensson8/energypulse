import type { EnergyClass } from "@/lib/supabase/database.types";
import { cn, energyClassColor } from "@/lib/utils";

export function EnergyClassBadge({
  value,
  className,
}: {
  value: EnergyClass | null | undefined;
  className?: string;
}) {
  if (!value) {
    return (
      <span
        className={cn(
          "inline-flex h-4 min-w-[1.1rem] items-center justify-center rounded-sm bg-muted px-1 text-[11px] text-muted-foreground",
          className
        )}
      >
        —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-[1.1rem] items-center justify-center rounded-sm px-1 text-[11px] font-bold",
        energyClassColor(value),
        className
      )}
      title={`Energiklass ${value}`}
    >
      {value}
    </span>
  );
}
