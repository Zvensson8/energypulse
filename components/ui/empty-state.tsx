"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/**
 * Konsekvent tomt läge: vad saknas, varför det spelar roll, vad man gör nu.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  why,
  ctaLabel,
  ctaHref,
  onCta,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  /** Kort “varför det spelar roll” */
  why?: string;
  ctaLabel?: string;
  ctaHref?: string;
  onCta?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-dashed border-border bg-card p-10 text-center",
        className
      )}
    >
      {Icon && (
        <Icon className="mx-auto h-10 w-10 text-muted-foreground/40" />
      )}
      <h3 className="mt-3 text-lg font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {body}
      </p>
      {why && (
        <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground/90">
          <span className="font-medium text-foreground/80">Varför: </span>
          {why}
        </p>
      )}
      {(ctaHref || onCta) && ctaLabel && (
        <div className="mt-5">
          {ctaHref ? (
            <Button asChild>
              <Link href={ctaHref}>{ctaLabel}</Link>
            </Button>
          ) : (
            <Button type="button" onClick={onCta}>
              {ctaLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
