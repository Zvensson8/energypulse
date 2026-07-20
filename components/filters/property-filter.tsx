"use client";

import { useQuery } from "@tanstack/react-query";
import { listProperties } from "@/app/actions/properties-crud";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPinned } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Gemensamt fastighetsfilter för listmoduler.
 * value = property id eller "all".
 */
export function PropertyFilter({
  value,
  onChange,
  className,
  triggerClassName,
  includeAllLabel = "Alla fastigheter",
}: {
  value: string;
  onChange: (propertyId: string) => void;
  className?: string;
  triggerClassName?: string;
  includeAllLabel?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["properties-filter-options"],
    queryFn: async () => {
      const res = await listProperties();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    staleTime: 60_000,
  });

  const options = data ?? [];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <MapPinned className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
      <Select
        value={value || "all"}
        onValueChange={(v) => onChange(v === "all" ? "" : v)}
        disabled={isLoading}
      >
        <SelectTrigger className={cn("w-[min(100%,16rem)]", triggerClassName)}>
          <SelectValue
            placeholder={isLoading ? "Laddar fastigheter…" : includeAllLabel}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{includeAllLabel}</SelectItem>
          {options.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
              {p.municipality ? ` · ${p.municipality}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Hook-friendly: normalize empty string as "all" for queries. */
export function propertyFilterKey(propertyId: string): string {
  return propertyId || "all";
}
