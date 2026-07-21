"use client";

import Link from "next/link";
import type { CsrdMetrics } from "@/app/actions/csrd-metrics";
import { formatKwh, formatNumber, formatIntensity } from "@/lib/utils";
import { Scale, ArrowRight } from "lucide-react";

export function CsrdMetricsPanel({
  data,
  propertyId,
}: {
  data: CsrdMetrics;
  propertyId?: string;
}) {
  const reportHref = propertyId
    ? `/reports?type=csrd&property=${propertyId}`
    : "/reports?type=csrd";

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">
              CSRD / ESRS E1 – nyckeltal
            </h2>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {data.scopeLabel} · år {data.year} · underlag till hållbarhetsrapport
          </p>
        </div>
        <Link
          href={reportHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Exportera CSRD-PDF
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric
          label="Energi totalt"
          value={formatKwh(data.totalEnergyKwh)}
        />
        <Metric
          label="Snitt intensitet"
          value={formatIntensity(data.avgEnergyIntensity)}
        />
        <Metric
          label="GHG (uppsk.)"
          value={
            data.estimatedGhgTco2e != null
              ? `${formatNumber(data.estimatedGhgTco2e, 1)} tCO₂e`
              : "—"
          }
          sub={
            data.buildingsWithGhg > 0
              ? `${data.buildingsWithGhg} hus med GHG`
              : "Saknar GHG-data"
          }
        />
        <Metric
          label="Omställning CapEx"
          value={`${formatNumber(data.totalTransitionCapexSek / 1e6, 2)} Mkr`}
          sub={`${data.draftPlanCount} utkast · ${data.approvedPlanCount} aktiva planer`}
        />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs">
          <div className="font-medium text-foreground">Lagkrav 2030 (MEPS)</div>
          <p className="mt-1 text-muted-foreground">
            Uppfyller {data.mepsCompliant} · Risk {data.mepsAtRisk} · Ej
            uppfyllt {data.mepsNonCompliant}
            {data.mepsUnknown > 0 ? ` · Okänt ${data.mepsUnknown}` : ""}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs">
          <div className="font-medium text-foreground">Övergångsrisk</div>
          <p className="mt-1 text-muted-foreground">
            Finansiell risk &lt;2035: {data.financialRiskCount} · Klimatriskår
            före 2035: {data.climateYearBefore2035}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs">
          <div className="font-medium text-foreground">
            Fysiska risker & data
          </div>
          <p className="mt-1 text-muted-foreground">
            Öppna/bevakning: {data.openPhysicalRisks} · Data OK{" "}
            {data.dataComplete} / uppsk. {data.dataExtrapolated} / saknas{" "}
            {data.dataIncomplete}
          </p>
        </div>
      </div>

      {data.capexByYear.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[20rem] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">År</th>
                <th className="py-1.5 pr-3 font-medium">Planer</th>
                <th className="py-1.5 pr-3 font-medium">Åtgärder</th>
                <th className="py-1.5 font-medium">Summa</th>
              </tr>
            </thead>
            <tbody>
              {data.capexByYear.map((r) => (
                <tr key={r.year} className="border-b border-border/60">
                  <td className="py-1.5 pr-3 tabular">{r.year}</td>
                  <td className="py-1.5 pr-3 tabular">
                    {formatNumber(r.planCostSek / 1000, 0)} tkr
                  </td>
                  <td className="py-1.5 pr-3 tabular">
                    {formatNumber(r.actionCostSek / 1000, 0)} tkr
                  </td>
                  <td className="py-1.5 font-medium tabular">
                    {formatNumber(r.totalSek / 1000, 0)} tkr
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {data.coverageNote} Detta är underlag – inte fullständig
        CSRD-deklaration.
      </p>
    </section>
  );
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-secondary/20 px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular">{value}</div>
      {sub && (
        <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}
