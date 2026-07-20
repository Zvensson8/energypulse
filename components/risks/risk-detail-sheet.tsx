"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getRiskDetail,
  saveRiskNotes,
  generateRiskMitigationPlan,
} from "@/app/actions/risk-response";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { HelpTip } from "@/components/ui/help-tip";
import { formatNumber, cn } from "@/lib/utils";
import {
  Building2,
  Loader2,
  MapPin,
  Sparkles,
  Save,
  GitCompare,
  ListTodo,
  ExternalLink,
  FileText,
} from "lucide-react";

const LEVEL_SV: Record<string, string> = {
  low: "Låg",
  medium: "Medel",
  high: "Hög",
  very_high: "Mycket hög",
};

const STATUS_SV: Record<string, string> = {
  open: "Öppen",
  monitoring: "Bevakning",
  resolved: "Åtgärdad",
  dismissed: "Avskriven",
};

export function RiskDetailSheet({
  open,
  onOpenChange,
  kind,
  riskId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: "physical" | "compliance" | null;
  riskId: string | null;
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const detailQ = useQuery({
    queryKey: ["risk-detail", kind, riskId],
    enabled: open && Boolean(kind && riskId),
    queryFn: async () => {
      const res = await getRiskDetail({
        kind: kind!,
        risk_id: riskId!,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  useEffect(() => {
    if (detailQ.data) {
      setNotes(detailQ.data.notes ?? "");
      setMsg(null);
    }
  }, [detailQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!kind || !riskId) throw new Error("Saknar risk");
      const res = await saveRiskNotes({
        kind,
        risk_id: riskId,
        notes,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      setMsg("Anteckning/plan sparad.");
      void qc.invalidateQueries({ queryKey: ["risk-detail"] });
      void qc.invalidateQueries({ queryKey: ["physical-risks"] });
      void qc.invalidateQueries({ queryKey: ["compliance-risks"] });
    },
  });

  const genMut = useMutation({
    mutationFn: async () => {
      if (!kind || !riskId) throw new Error("Saknar risk");
      const res = await generateRiskMitigationPlan({
        kind,
        risk_id: riskId,
        create_actions: true,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (d) => {
      setNotes((n) => {
        // reload from server on next fetch; show msg
        return n;
      });
      setMsg(
        `Plan genererad: ${d.created_action_ids.length} åtgärder skapades på ${d.building_ids.length} byggnad(er). Granska under Åtgärder eller jämför renovationsscenarier.`
      );
      void qc.invalidateQueries({ queryKey: ["risk-detail"] });
      void qc.invalidateQueries({ queryKey: ["physical-risks"] });
      void qc.invalidateQueries({ queryKey: ["compliance-risks"] });
      void qc.invalidateQueries({ queryKey: ["portfolio-actions"] });
      void detailQ.refetch().then((r) => {
        if (r.data) setNotes(r.data.notes ?? "");
      });
    },
  });

  const d = detailQ.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader className="border-b border-border px-5 py-4 text-left">
          <SheetTitle className="pr-8">
            {d?.title ?? "Riskdetalj"}
          </SheetTitle>
          <SheetDescription>
            Se underlag, skriv egen plan eller generera föreslagna åtgärder
            för den här fastigheten.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {detailQ.isLoading && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Laddar risk…
            </div>
          )}
          {detailQ.error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {(detailQ.error as Error).message}
            </div>
          )}

          {d && (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {STATUS_SV[d.workflow_status] ?? d.workflow_status}
                </Badge>
                {d.score != null && (
                  <Badge
                    variant={
                      d.score >= 9
                        ? "danger"
                        : d.score >= 5
                          ? "warning"
                          : "success"
                    }
                  >
                    {d.kind === "physical" ? "Poäng" : "Allvar"}{" "}
                    {formatNumber(d.score, 0)}
                  </Badge>
                )}
                {d.kind === "compliance" && (
                  <Badge variant="secondary">MEPS / CRREM</Badge>
                )}
                {d.kind === "physical" && (
                  <Badge variant="secondary">Fysisk risk</Badge>
                )}
              </div>

              <section className="space-y-2 rounded-2xl border border-border bg-secondary/30 p-4 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <div className="font-medium">{d.property_name}</div>
                    {d.municipality && (
                      <div className="text-xs text-muted-foreground">
                        {d.municipality}
                      </div>
                    )}
                    {d.property_id && (
                      <Link
                        href={`/properties/${d.property_id}`}
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Öppna fastighet <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>

                {d.building_name && d.building_id && (
                  <div className="flex items-start gap-2 border-t border-border/60 pt-2">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div>
                      <div className="font-medium">{d.building_name}</div>
                      <Link
                        href={`/buildings/${d.building_id}`}
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Se betyg (scorecard){" "}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                )}

                {d.kind === "physical" && d.probability && d.consequence && (
                  <p className="text-muted-foreground">
                    Sannolikhet:{" "}
                    <span className="font-medium text-foreground">
                      {LEVEL_SV[d.probability] ?? d.probability}
                    </span>
                    {" × "}
                    Konsekvens:{" "}
                    <span className="font-medium text-foreground">
                      {LEVEL_SV[d.consequence] ?? d.consequence}
                    </span>
                  </p>
                )}

                {d.kind === "compliance" && (
                  <p className="text-muted-foreground">
                    År {d.year}
                    {d.metric_value != null
                      ? ` · Mätvärde ${formatNumber(d.metric_value, 1)}`
                      : ""}
                  </p>
                )}

                {d.source && (
                  <p className="text-xs text-muted-foreground">
                    Källa: {d.source}
                    {d.assessed_at ? ` · Bedömd ${d.assessed_at}` : ""}
                  </p>
                )}

                {d.grades_hint && (
                  <p className="rounded-xl bg-card px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                    {d.grades_hint}
                  </p>
                )}

                {d.buildings.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">
                      Byggnader under fastigheten ({d.buildings.length})
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {d.buildings.map((b) => (
                        <li key={b.id}>
                          <Link
                            href={`/buildings/${b.id}`}
                            className="text-primary hover:underline"
                          >
                            {b.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              {d.status_reason && (
                <div className="rounded-xl border border-border px-3 py-2 text-sm">
                  <div className="text-xs font-medium text-muted-foreground">
                    Senaste statusmotivering
                  </div>
                  <p className="mt-0.5">{d.status_reason}</p>
                </div>
              )}

              <section className="space-y-2">
                <div className="flex items-center gap-1 text-sm font-semibold">
                  <FileText className="h-4 w-4 text-primary" />
                  Egen plan / anteckning
                  <HelpTip text="Skriv fritt hur ni tänker hantera risken. Sparat på risken och syns i listan." />
                </div>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="t.ex. Prioritera trösklar i källare Q3. Budget 250 tkr. Ansvarig: …"
                  className="min-h-[120px]"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saveMut.isPending}
                  onClick={() => void saveMut.mutateAsync()}
                >
                  {saveMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Spara plantext
                </Button>
              </section>

              <section className="space-y-2 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center gap-1 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Generera åtgärdsplan
                  <HelpTip text="Regelbaserade förslag utifrån risktyp + fastighetens hus. Skapar proposed åtgärder som du kan simulera. Ingen extern AI-nyckel krävs – valfri AI kan kopplas senare." />
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Skapar föreslagna åtgärder på{" "}
                  <strong>
                    {d.buildings.length > 0
                      ? `${d.buildings.length} byggnad(er)`
                      : "fastighetens hus"}
                  </strong>{" "}
                  och sparar en plantext här. Du kan sedan simulera, jämföra
                  renovationsscenarier och exportera beslutsunderlag.
                </p>
                <Button
                  disabled={genMut.isPending || d.buildings.length === 0}
                  onClick={() => void genMut.mutateAsync()}
                  className="w-full"
                >
                  {genMut.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Genererar…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Generera plan för
                      risken
                    </>
                  )}
                </Button>
                {d.buildings.length === 0 && (
                  <p className="text-xs text-amber-700">
                    Inga byggnader under fastigheten – lägg till byggnader först.
                  </p>
                )}
              </section>

              {(msg || saveMut.isError || genMut.isError) && (
                <div
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm",
                    saveMut.isError || genMut.isError
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800"
                  )}
                >
                  {saveMut.isError
                    ? (saveMut.error as Error).message
                    : genMut.isError
                      ? (genMut.error as Error).message
                      : msg}
                </div>
              )}

              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <Button variant="outline" asChild>
                  <Link href="/actions">
                    <ListTodo className="h-4 w-4" />
                    Öppna åtgärder
                  </Link>
                </Button>
                {d.building_id ? (
                  <Button variant="outline" asChild>
                    <Link href={`/renovation?building=${d.building_id}`}>
                      <GitCompare className="h-4 w-4" />
                      Jämför renovationsscenarier
                    </Link>
                  </Button>
                ) : d.buildings[0] ? (
                  <Button variant="outline" asChild>
                    <Link
                      href={`/renovation?building=${d.buildings[0].id}`}
                    >
                      <GitCompare className="h-4 w-4" />
                      Jämför renovationsscenarier
                    </Link>
                  </Button>
                ) : null}
                {d.building_id && (
                  <Button variant="ghost" asChild>
                    <Link href={`/buildings/${d.building_id}`}>
                      Byggnadens betyg
                    </Link>
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
