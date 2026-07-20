"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BuildingPerformanceRow } from "@/app/actions/buildings-table";
import { getFormulaContext } from "@/app/actions/compliance";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { formatIntensity, formatNumber } from "@/lib/utils";
import { FileSearch, Loader2 } from "lucide-react";

export type FormulaField =
  | "energy_intensity"
  | "primary_energy_intensity"
  | "ghg_intensity"
  | "meps_2030_gap"
  | "meps_2033_gap"
  | "crrem_stranding_year";

type FormulaKey =
  | "energy_intensity"
  | "primary_energy"
  | "ghg_intensity"
  | "meps_gap"
  | "crrem_stranding";

const FIELD_META: Record<
  FormulaField,
  { title: string; formulaKey: FormulaKey }
> = {
  energy_intensity: {
    title: "Energiintensitet",
    formulaKey: "energy_intensity",
  },
  primary_energy_intensity: {
    title: "Primärenergital",
    formulaKey: "primary_energy",
  },
  ghg_intensity: {
    title: "GHG-intensitet",
    formulaKey: "ghg_intensity",
  },
  meps_2030_gap: {
    title: "MEPS-gap 2030",
    formulaKey: "meps_gap",
  },
  meps_2033_gap: {
    title: "MEPS-gap 2033",
    formulaKey: "meps_gap",
  },
  crrem_stranding_year: {
    title: "CRREM stranding year",
    formulaKey: "crrem_stranding",
  },
};

/**
 * Dense formula tooltip with live källdata from getFormulaContext.
 * Opens provenance via onOpenProvenance.
 */
export function FormulaTooltip({
  field,
  row,
  children,
  onOpenProvenance,
}: {
  field: FormulaField;
  row: BuildingPerformanceRow;
  children: React.ReactNode;
  onOpenProvenance?: (buildingId: string, year: number) => void;
}) {
  const [active, setActive] = useState(false);
  const meta = FIELD_META[field];

  const { data, isFetching } = useQuery({
    queryKey: ["formula-context", row.building_id, row.year],
    enabled: active,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await getFormulaContext({
        building_id: row.building_id,
        year: row.year,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const formula =
    data?.formulas[meta.formulaKey] ??
    fallbackFormula(field, row);

  const resultLine = resultForField(field, row);

  return (
    <Tooltip
      delayDuration={180}
      onOpenChange={(open) => {
        if (open) setActive(true);
      }}
    >
      <TooltipTrigger asChild>
        <span className="cursor-help border-b border-dotted border-terminal-muted/50">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-sm space-y-1.5 p-2 font-mono"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-2xs font-semibold uppercase tracking-wide text-terminal-accent">
            {meta.title}
          </div>
          {isFetching && (
            <Loader2 className="h-3 w-3 animate-spin text-terminal-muted" />
          )}
        </div>

        <div className="text-2xs text-terminal-text">{formula}</div>
        <div className="text-2xs text-foreground">{resultLine}</div>

        <div className="space-y-0.5 border-t border-terminal-border pt-1 text-2xs text-terminal-muted">
          <div>
            <span className="text-terminal-muted">area: </span>
            {data?.area
              ? `a_temp=${formatNumber(data.area.a_temp, 1)} m² · ${data.area.valid_from}→${data.area.valid_to ?? "∞"} · Q${data.area.quality_class}${data.area.source ? ` · ${data.area.source}` : ""}`
              : row.a_temp != null
                ? `a_temp=${formatNumber(row.a_temp, 1)} m² (från PI)`
                : "—"}
          </div>
          <div>
            <span className="text-terminal-muted">data_gap: </span>
            {data?.data_gap_status ?? row.data_gap_status} ·{" "}
            {formatNumber(
              data?.data_completeness_percent ?? row.data_completeness_percent,
              1
            )}
            %
          </div>
          <div>
            <span className="text-terminal-muted">crrem_version: </span>
            {data?.crrem_version_used ?? row.crrem_version_used ?? "—"}
          </div>
          {data?.interpolation_method && (
            <div className="text-gap-extrapolated">
              interpolering: {data.interpolation_method} (
              {data.estimated_row_count} est / {data.measured_row_count} mätt)
            </div>
          )}
        </div>

        {/* Consumption rows used */}
        <div className="border-t border-terminal-border pt-1">
          <div className="mb-0.5 text-2xs uppercase text-terminal-muted">
            energy_consumption (
            {data?.consumption_summary.length ?? "…"} rader)
          </div>
          <div className="max-h-28 overflow-auto">
            <table className="w-full text-[10px] leading-tight">
              <thead>
                <tr className="text-terminal-muted">
                  <th className="px-0.5 text-left">M</th>
                  <th className="px-0.5 text-left">Källa</th>
                  <th className="px-0.5 text-right">kWh</th>
                  <th className="px-0.5 text-center">Est</th>
                </tr>
              </thead>
              <tbody>
                {(data?.consumption_summary ?? []).slice(0, 24).map((c) => (
                  <tr key={c.id} className="border-t border-terminal-border/40">
                    <td className="px-0.5">{c.month}</td>
                    <td className="max-w-[7rem] truncate px-0.5">
                      {c.energy_source_name}
                    </td>
                    <td className="px-0.5 text-right tabular">
                      {formatNumber(c.consumption_kwh, 0)}
                    </td>
                    <td className="px-0.5 text-center">
                      {c.is_estimated ? (
                        <span className="text-gap-extrapolated">Y</span>
                      ) : (
                        "N"
                      )}
                    </td>
                  </tr>
                ))}
                {!data && (
                  <tr>
                    <td colSpan={4} className="px-0.5 py-1 text-terminal-muted">
                      Hovra för att ladda rader…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {onOpenProvenance && (
          <Button
            type="button"
            size="sm"
            variant="terminal"
            className="h-6 w-full gap-1 text-2xs"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenProvenance(row.building_id, row.year);
            }}
          >
            <FileSearch className="h-3 w-3" />
            Öppna provenance
          </Button>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function fallbackFormula(
  field: FormulaField,
  row: BuildingPerformanceRow
): string {
  switch (field) {
    case "energy_intensity":
      return `total_energy_kwh / a_temp${
        row.total_energy_kwh != null && row.a_temp != null
          ? ` = ${row.total_energy_kwh} / ${row.a_temp}`
          : ""
      }`;
    case "primary_energy_intensity":
      return "Σ(consumption_kwh × primary_energy_factor) / a_temp";
    case "ghg_intensity":
      return "Σ(consumption_kwh × emission_factor) / a_temp";
    case "meps_2030_gap":
    case "meps_2033_gap":
      return "energy_intensity − meps_threshold";
    case "crrem_stranding_year":
      return "min year där ghg_intensity > interpolerad CRREM-target";
  }
}

function resultForField(
  field: FormulaField,
  row: BuildingPerformanceRow
): string {
  switch (field) {
    case "energy_intensity":
      return `= ${formatIntensity(row.energy_intensity)}`;
    case "primary_energy_intensity":
      return `= ${formatIntensity(row.primary_energy_intensity)}`;
    case "ghg_intensity":
      return `= ${formatNumber(row.ghg_intensity, 3)} kgCO₂e/m²`;
    case "meps_2030_gap":
      return `= ${formatNumber(row.meps_2030_gap, 1)} kWh/m²`;
    case "meps_2033_gap":
      return `= ${formatNumber(row.meps_2033_gap, 1)} kWh/m²`;
    case "crrem_stranding_year":
      return `= ${row.crrem_stranding_year ?? "—"} (${row.crrem_version_used ?? "—"})`;
  }
}
