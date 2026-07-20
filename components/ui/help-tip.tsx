"use client";

import { CircleHelp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Diskret hjälpikon med svensk förklaring – för icke-tekniska användare. */
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
        <button
          type="button"
          className={cn(
            "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            className
          )}
          aria-label={label ?? "Förklaring"}
        >
          <CircleHelp className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs text-left font-sans text-xs leading-snug normal-case tracking-normal">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
