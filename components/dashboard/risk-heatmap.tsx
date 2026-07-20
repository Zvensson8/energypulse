"use client";

import Link from "next/link";
import type { HeatmapCell } from "@/app/actions/dashboard";
import { DataGapBadge } from "@/components/energy/data-gap-badge";
import { EnergyClassBadge } from "@/components/energy/energy-class-badge";
import { HelpTip } from "@/components/ui/help-tip";
import { cn, formatNumber, riskHeatColor } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function RiskHeatmap({ cells }: { cells: HeatmapCell[] }) {
  if (cells.length === 0) {
    return (
      <div className="panel flex h-full flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-xs text-muted-foreground">
        <p>Ingen prestandadata för valt år.</p>
        <p className="text-2xs">
          Importera energidata och beräkna, eller välj ett annat år.
        </p>
      </div>
    );
  }

  return (
    <div className="panel flex h-full flex-col rounded-md">
      <div className="panel-header !normal-case !tracking-normal">
        <span className="inline-flex items-center gap-1">
          Risköversikt
          <HelpTip text="Varje ruta är en byggnad. Färgen visar samlad risk (kravgap + klimatrisk). Klicka för mer info. Röd ring = ofullständig data." />
        </span>
        <span className="font-normal text-terminal-muted">
          {cells.length} byggnader
        </span>
      </div>
      <div className="grid flex-1 auto-rows-min grid-cols-6 gap-1 overflow-auto p-2 sm:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
        {cells.map((cell) => (
          <Tooltip key={cell.building_id}>
            <TooltipTrigger asChild>
              <Link
                href={`/buildings?building=${cell.building_id}`}
                className={cn(
                  "relative flex aspect-square min-h-[2.25rem] flex-col items-center justify-center rounded-md border border-black/20 p-0.5 text-center shadow-sm transition hover:ring-2 hover:ring-terminal-accent",
                  riskHeatColor(cell.risk_score),
                  cell.data_gap_status === "INCOMPLETE_DATA" &&
                    "ring-1 ring-gap-incomplete"
                )}
              >
                <EnergyClassBadge value={cell.energy_class} />
                {cell.data_gap_status === "INCOMPLETE_DATA" && (
                  <span
                    className="absolute right-0.5 top-0.5 text-[9px] leading-none text-white drop-shadow"
                    aria-label="Ofullständig data"
                  >
                    ⚠
                  </span>
                )}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs space-y-1.5 font-sans">
              <div className="text-xs font-semibold text-terminal-accent">
                {cell.building_name}
              </div>
              <div className="text-2xs text-terminal-muted">
                {cell.property_name}
                {cell.municipality ? ` · ${cell.municipality}` : ""}
              </div>
              <div className="space-y-0.5 text-2xs">
                <div>
                  Energi: {formatNumber(cell.energy_intensity, 1)} kWh/m²
                </div>
                <div>
                  Kravgap 2030: {formatNumber(cell.meps_2030_gap, 1)} kWh/m²
                </div>
                <div>
                  Klimatriskår: {cell.crrem_stranding_year ?? "—"}
                </div>
              </div>
              <DataGapBadge
                status={cell.data_gap_status}
                completeness={cell.data_completeness_percent}
              />
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-terminal-border px-2 py-1.5 text-2xs text-terminal-muted">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-3.5 rounded-sm bg-gap-complete/70" />
          Låg risk
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-3.5 rounded-sm bg-gap-extrapolated/70" />
          Medel
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-3.5 rounded-sm bg-gap-incomplete/70" />
          Hög risk
        </span>
        <span className="text-terminal-muted">⚠ = saknas data</span>
      </div>
    </div>
  );
}
