import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { DataGapStatus, EnergyClass } from "@/lib/supabase/database.types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(
  value: number | null | undefined,
  digits = 1
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
}

export function formatKwh(value: number | null | undefined): string {
  if (value == null) return "—";
  if (Math.abs(value) >= 1_000_000) {
    return `${formatNumber(value / 1_000_000, 2)} GWh`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${formatNumber(value / 1_000, 1)} MWh`;
  }
  return `${formatNumber(value, 0)} kWh`;
}

export function formatIntensity(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${formatNumber(value, 1)} kWh/m²`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${formatNumber(value, 1)} %`;
}

/** A–G färgkodning: grön A–B, gul C–D, orange E, röd F–G */
export function energyClassColor(cls: EnergyClass | null | undefined): string {
  switch (cls) {
    case "A":
      return "bg-energy-A text-white";
    case "B":
      return "bg-energy-B text-white";
    case "C":
      return "bg-energy-C text-black";
    case "D":
      return "bg-energy-D text-black";
    case "E":
      return "bg-energy-E text-white";
    case "F":
      return "bg-energy-F text-white";
    case "G":
      return "bg-energy-G text-white";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function energyClassTextColor(
  cls: EnergyClass | null | undefined
): string {
  switch (cls) {
    case "A":
    case "B":
      return "text-energy-A";
    case "C":
    case "D":
      return "text-energy-C";
    case "E":
      return "text-energy-E";
    case "F":
    case "G":
      return "text-energy-F";
    default:
      return "text-muted-foreground";
  }
}

export function dataGapColor(status: DataGapStatus | null | undefined): string {
  switch (status) {
    case "COMPLETE":
      return "bg-gap-complete/20 text-gap-complete border-gap-complete/40";
    case "EXTRAPOLATED_WARNING":
      return "bg-gap-extrapolated/20 text-gap-extrapolated border-gap-extrapolated/40";
    case "INCOMPLETE_DATA":
      return "bg-gap-incomplete/20 text-gap-incomplete border-gap-incomplete/40";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function dataGapLabel(status: DataGapStatus | null | undefined): string {
  switch (status) {
    case "COMPLETE":
      return "Komplett";
    case "EXTRAPOLATED_WARNING":
      return "Uppskattad";
    case "INCOMPLETE_DATA":
      return "Saknas data";
    default:
      return "—";
  }
}

/** Heatmap cell intensity 0–1 for risk score */
export function riskHeatColor(score: number): string {
  // 0 = green, 0.5 = yellow, 1 = red
  const clamped = Math.max(0, Math.min(1, score));
  if (clamped < 0.33) return "bg-gap-complete/70";
  if (clamped < 0.66) return "bg-gap-extrapolated/70";
  return "bg-gap-incomplete/70";
}
