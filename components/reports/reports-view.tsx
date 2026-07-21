"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  exportLeadershipClimateReport,
  exportCsrdReport,
  exportPropertyFullReport,
  exportRenovationPlansReport,
  type ReportKind,
} from "@/app/actions/export-reports";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PropertyFilter } from "@/components/filters/property-filter";
import {
  FileText,
  Download,
  Loader2,
  Briefcase,
  Scale,
  Building2,
  Hammer,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const REPORTS: {
  id: ReportKind;
  title: string;
  desc: string;
  audience: string;
  includes: string[];
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  requiresProperty?: boolean;
}[] = [
  {
    id: "leadership_climate",
    title: "Förslag till ledningen – klimatrisk",
    desc: "Beslutsunderlag med identifierade klimatrisker, föreslagna åtgärder, förklaringar och uppskattad kostnad.",
    audience: "Ledning / styrelse",
    includes: [
      "Sammanfattning för beslut",
      "Fysiska klimatrisker",
      "Byggnader med hög risk / finansiell risk",
      "Åtgärder med kostnad & payback",
      "Rekommendation + signaturfält",
    ],
    icon: Briefcase,
    color: "from-indigo-500 to-violet-500",
  },
  {
    id: "csrd",
    title: "CSRD / ESRS E1 – underlag",
    desc: "Vad som ska ingå i en CSRD-klimatrapport, plus data från EnergyPulse (metriker, risker, omställningsplan).",
    audience: "Hållbarhet / ekonomi / revisor",
    includes: [
      "Checklista ESRS E1 (styrning, strategi, risk, metriker, mål)",
      "Nuläge: riskscore, MEPS, klimatriskår",
      "Fysiska risker & renovationsplaner",
      "Gap-checklista (GHG, CapEx, scenarier…)",
    ],
    icon: Scale,
    color: "from-emerald-500 to-teal-500",
  },
  {
    id: "property_full",
    title: "Samlad fastighetsrapport",
    desc: "Allt om en fastighet: energi, betyg, klimatrisker, renoveringsplaner med före/efter, kostnader och payback.",
    audience: "Förvaltare / ledning",
    includes: [
      "Översikt & snittbetyg",
      "Energi per byggnad",
      "Klimatrisker på fastigheten",
      "Planer: före/efter score, kostnad",
      "Öppna åtgärder",
    ],
    icon: Building2,
    color: "from-sky-500 to-cyan-500",
    requiresProperty: true,
  },
  {
    id: "renovation",
    title: "Renovationsplaner",
    desc: "Endast planer – före/efter riskscore, kostnader, åtgärder, uppskattad payback och mål.",
    audience: "Förvaltare / projekt",
    includes: [
      "Översikt alla planer",
      "Score före → efter",
      "Kostnad & payback per plan",
      "Åtgärder i varje plan",
    ],
    icon: Hammer,
    color: "from-amber-500 to-orange-500",
  },
];

function downloadBase64Pdf(fileBase64: string, fileName: string) {
  const bin = atob(fileBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportsView() {
  const [selected, setSelected] = useState<ReportKind>("leadership_climate");
  const [propertyId, setPropertyId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const current = REPORTS.find((r) => r.id === selected)!;

  const generate = useMutation({
    mutationFn: async () => {
      if (current.requiresProperty && !propertyId) {
        throw new Error("Välj en fastighet för den här rapporten.");
      }
      const opts = {
        propertyId: propertyId || undefined,
        year,
      };
      if (selected === "leadership_climate") {
        return exportLeadershipClimateReport(opts);
      }
      if (selected === "csrd") {
        return exportCsrdReport(opts);
      }
      if (selected === "property_full") {
        return exportPropertyFullReport({
          propertyId,
          year,
        });
      }
      return exportRenovationPlansReport(opts);
    },
    onSuccess: (res) => {
      if (!res.success) {
        setErr(res.error);
        setMsg(null);
        return;
      }
      downloadBase64Pdf(res.data.fileBase64, res.data.fileName);
      setMsg(`Nedladdad: ${res.data.fileName}`);
      setErr(null);
    },
    onError: (e: Error) => {
      setErr(e.message);
      setMsg(null);
    },
  });

  return (
    <div className="page-shell">
      <div className="page-inner max-w-4xl space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            <h1 className="page-title">Rapporter</h1>
          </div>
          <p className="page-subtitle">
            Ta ut PDF till ledning, CSRD, fastighet eller renovering – med risk,
            förklaringar, kostnader och före/efter.
          </p>
        </div>

        {msg && (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        )}

        {/* Report cards */}
        <div className="grid gap-3 sm:grid-cols-2">
          {REPORTS.map((r) => {
            const Icon = r.icon;
            const active = selected === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r.id)}
                className={cn(
                  "rounded-2xl border p-4 text-left shadow-sm transition",
                  active
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border hover:border-primary/25 hover:shadow-md"
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${r.color} text-white shadow-sm`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">
                      {r.title}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {r.desc}
                    </span>
                    <span className="mt-2 inline-block rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {r.audience}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected detail + generate */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold">{current.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{current.desc}</p>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Innehåller
            </div>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {current.includes.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-sm text-foreground"
                >
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">
                {current.requiresProperty
                  ? "Fastighet (obligatoriskt)"
                  : "Fastighet (valfritt filter)"}
              </label>
              <PropertyFilter
                value={propertyId}
                onChange={setPropertyId}
                includeAllLabel={
                  current.requiresProperty
                    ? "Välj fastighet…"
                    : "Hela portföljen"
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">
                Referensår
              </label>
              <Select
                value={String(year)}
                onValueChange={(v) => setYear(Number(v))}
              >
                <SelectTrigger className="h-9 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4].map((o) => {
                    const y = new Date().getFullYear() - 1 - o;
                    return (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="ml-auto gap-1.5"
              disabled={
                generate.isPending ||
                (current.requiresProperty && !propertyId)
              }
              onClick={() => void generate.mutateAsync()}
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Skapar PDF…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Ladda ner PDF
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>

          {current.requiresProperty && !propertyId && (
            <p className="text-xs text-amber-700">
              Välj en fastighet för att kunna skapa den samlade rapporten.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-dashed border-border bg-secondary/20 px-4 py-4 text-sm text-muted-foreground">
          <strong className="text-foreground">Tips:</strong> Samma underlag
          finns delvis på husets betygssida (besluts-PDF). Här tar du ut{" "}
          <em>portfölj- eller fastighetsnivå</em> till ledning och CSRD. PDF:en
          använder enkel textlayout (inga bilder) för snabb export.
        </section>
      </div>
    </div>
  );
}
