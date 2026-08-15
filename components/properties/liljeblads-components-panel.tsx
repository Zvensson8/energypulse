"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchLinkedLiljebladsComponents,
  fetchLiljebladsPropertyOptions,
  getLiljebladsBridgeStatus,
  linkLiljebladsProperty,
} from "@/app/actions/liljeblads-bridge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wrench, Link2, Loader2, Unlink } from "lucide-react";
import { HelpTip } from "@/components/ui/help-tip";
import type { LiljebladsComponent } from "@/lib/integrations/liljeblads";

const STATUS_SV: Record<string, string> = {
  active: "Aktiv",
  maintenance: "Underhåll",
  inactive: "Inaktiv",
  decommissioned: "Avställd",
};

const RISK_SV: Record<string, string> = {
  critical: "Kritisk",
  high: "Hög",
  medium: "Medel",
  low: "Låg",
};

const CONFIDENCE_SV: Record<string, string> = {
  high: "hög",
  medium: "medel",
  low: "låg",
};

function formatYears(value: number): string {
  return value.toLocaleString("sv-SE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** Same type defaults as Liljeblads when no purchased lifespan exists. */
const TYPE_DEFAULT_LIFESPAN: Record<string, number> = {
  SC1: 20,
  "SC2.1.1": 18,
  "SC2.3": 15,
  "SC2.3.1": 15,
  "SC2.3.3": 12,
  "SC2.3.4": 15,
  "SC2.3.7": 12,
  "SC2.6.2": 15,
  "SC4.1.2.5.1": 20,
  "SC4.1.2.5.3": 18,
  "SC4.1.6.9": 15,
  "SC4.2.4.6": 12,
  "SC4.2.4.7": 12,
  "SC4.5.1": 15,
  "SC4.6.2.6": 15,
  "SC4.6.2.6.1": 15,
  "SC4.7": 20,
  "SC5.5": 15,
  "SC7.1": 12,
  "SC7.2": 12,
};

function riskVariant(
  level: string | null,
): "danger" | "warning" | "outline" | "success" {
  if (level === "critical" || level === "high") return "danger";
  if (level === "medium") return "warning";
  if (level === "low") return "success";
  return "outline";
}

export function LiljebladsComponentsPanel({
  propertyId,
  propertyNumber,
}: {
  propertyId: string;
  propertyNumber?: string | null;
}) {
  const qc = useQueryClient();
  const [picker, setPicker] = useState<string>("");

  const statusQ = useQuery({
    queryKey: ["liljeblads-bridge-status"],
    queryFn: async () => {
      const res = await getLiljebladsBridgeStatus();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const compsQ = useQuery({
    queryKey: ["liljeblads-components", propertyId],
    queryFn: async () => {
      const res = await fetchLinkedLiljebladsComponents(propertyId);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    enabled: Boolean(statusQ.data?.configured),
  });

  const optionsQ = useQuery({
    queryKey: ["liljeblads-property-options"],
    queryFn: async () => {
      const res = await fetchLiljebladsPropertyOptions();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    enabled: Boolean(statusQ.data?.configured) && compsQ.data?.linked === false,
  });

  const suggested = useMemo(() => {
    const needle = (propertyNumber ?? "").trim().toLowerCase();
    if (!needle) return null;
    return (
      optionsQ.data?.find(
        (p) => (p.property_number ?? "").trim().toLowerCase() === needle,
      ) ?? null
    );
  }, [optionsQ.data, propertyNumber]);

  const linkMut = useMutation({
    mutationFn: async (liljebladsPropertyId: string | null) => {
      const res = await linkLiljebladsProperty({
        propertyId,
        liljebladsPropertyId,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["liljeblads-components", propertyId] });
      void qc.invalidateQueries({ queryKey: ["property", propertyId] });
    },
  });

  if (statusQ.isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Kollar Liljeblads…
      </div>
    );
  }

  if (!statusQ.data?.configured) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Wrench className="h-4 w-4 text-primary" />
          Komponenter (Liljeblads)
        </div>
        <p className="mt-2">
          Sätt <code className="text-xs">LILJEBLADS_WEBHOOK_URL</code> och{" "}
          <code className="text-xs">LILJEBLADS_API_KEY</code> för att visa tekniska
          komponenter här.
        </p>
      </div>
    );
  }

  if (compsQ.isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Hämtar komponenter från Liljeblads…
      </div>
    );
  }

  if (compsQ.error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {(compsQ.error as Error).message}
      </div>
    );
  }

  const data = compsQ.data;
  if (!data?.linked) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Link2 className="h-4 w-4 text-primary" />
          Koppla till Liljeblads
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Då visas värmepumpar, ventilation och annan teknik som ägs i
          Liljeblads.
        </p>
        {suggested && (
          <p className="mt-2 text-xs text-muted-foreground">
            Förslag från beteckning: {suggested.name}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select
            value={picker || suggested?.id || ""}
            onValueChange={setPicker}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Välj fastighet i Liljeblads" />
            </SelectTrigger>
            <SelectContent>
              {(optionsQ.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.property_number ? ` · ${p.property_number}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={linkMut.isPending || !(picker || suggested?.id)}
            onClick={() =>
              linkMut.mutate(picker || suggested?.id || null)
            }
          >
            {linkMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Koppla"
            )}
          </Button>
        </div>
        {linkMut.error && (
          <p className="mt-2 text-xs text-destructive">
            {(linkMut.error as Error).message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Wrench className="h-4 w-4 text-primary" />
            Komponenter
            <HelpTip
              label="Så räknas risk och B10"
              text="Siffrorna räknas i Liljeblads, inte i EnergyPulse. Weibull använder installationsår, typens normala livslängd och akuta fel. Risk 0–100 är felsannolikhet nu (0–29 låg, 30–54 medel, 55–74 hög, 75+ kritisk). B10 är år tills ca 10 % av liknande enheter förväntas ha fått ett första fel — inte hur länge aggregatet ska leva."
            />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.components.length} st från Liljeblads
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={linkMut.isPending}
          onClick={() => linkMut.mutate(null)}
        >
          <Unlink className="h-4 w-4" />
          Ta bort länk
        </Button>
      </div>

      <div className="mt-3 space-y-1 rounded-xl bg-muted/50 px-3 py-2 text-xs leading-snug text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Källa:</span> Liljeblads
          Weibull-modell (installationsår, typens livslängd, akuta fel).
        </p>
        <p>
          <span className="font-medium text-foreground">Risk 0–100:</span> hur
          troligt ett fel är nu. 0–29 låg · 30–54 medel · 55–74 hög · 75+ kritisk.
        </p>
        <p>
          <span className="font-medium text-foreground">B10:</span> år tills ca 10 %
          av liknande enheter förväntas ha fått ett första fel. Inte återstående
          livslängd.
        </p>
      </div>

      {data.components.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Inga aktiva komponenter på den kopplade fastigheten.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {data.components.map((c) => (
            <ComponentRiskRow key={c.id} component={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ComponentRiskRow({ component: c }: { component: LiljebladsComponent }) {
  const assumedLife =
    c.expected_lifespan_years ??
    (c.type ? TYPE_DEFAULT_LIFESPAN[c.type] ?? null : null);
  const facts = [
    c.age_years != null ? `Ålder ${formatYears(c.age_years)} år` : null,
    assumedLife != null ? `typantagande ${formatYears(assumedLife)} år` : null,
    c.median_life_years != null
      ? `medianliv ${formatYears(c.median_life_years)} år`
      : null,
    c.acute_count != null ? `${c.acute_count} akuta fel` : null,
    c.confidence
      ? `konfidens ${CONFIDENCE_SV[c.confidence] ?? c.confidence}`
      : null,
  ].filter(Boolean);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{c.name}</div>
          <div className="text-xs text-muted-foreground">
            {[c.type, c.manufacturer, c.model, c.room_zone]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {c.status && (
            <Badge variant="outline">{STATUS_SV[c.status] ?? c.status}</Badge>
          )}
          {c.next_service_date && (
            <span className="text-xs text-muted-foreground">
              Service {c.next_service_date}
            </span>
          )}
        </div>
      </div>

      {(c.risk_score != null || c.remaining_b10_years != null) && (
        <div className="mt-2 space-y-1">
          {c.risk_score != null && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={riskVariant(c.risk_level)}>
                Risk {Math.round(c.risk_score)} av 100
                {c.risk_level ? ` · ${RISK_SV[c.risk_level] ?? c.risk_level}` : ""}
              </Badge>
              <span className="text-xs text-muted-foreground">
                felsannolikhet nu, från Liljeblads
              </span>
            </div>
          )}
          {c.remaining_b10_years != null && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                B10 {formatYears(c.remaining_b10_years)} år
              </span>{" "}
              till 10 % risk för första fel — inte hur länge aggregatet ska leva
            </p>
          )}
          {facts.length > 0 && (
            <p className="text-xs text-muted-foreground">{facts.join(" · ")}</p>
          )}
          {c.recommendation && (
            <p className="text-xs text-muted-foreground">{c.recommendation}</p>
          )}
        </div>
      )}
    </li>
  );
}
