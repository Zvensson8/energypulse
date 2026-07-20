"use client";

import { CircleHelp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Diskret hjälpikon med svensk förklaring.
 * Använder <span> (inte <button>) så den kan ligga inuti klickbara KPI-kort
 * utan invalid nested interactive elements / hydration errors.
 */
export function HelpTip({
  text,
  label,
  side = "top",
  className,
}: {
  text: string;
  /** Tillgänglighetslabel */
  label?: string;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          tabIndex={0}
          aria-label={label ?? "Förklaring"}
          className={cn(
            "inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            className
          )}
          onClick={(e) => {
            // Undvik att klick bubblar till omgivande filter-KPI / länk
            e.preventDefault();
            e.stopPropagation();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <CircleHelp className="h-3 w-3" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        className="max-w-xs text-left font-sans text-xs leading-snug normal-case tracking-normal"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
