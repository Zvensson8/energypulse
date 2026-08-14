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

const STATUS_SV: Record<string, string> = {
  active: "Aktiv",
  maintenance: "Underhåll",
  inactive: "Inaktiv",
  decommissioned: "Avställd",
};

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
            Komponenter från Liljeblads
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.components.length} st · teknik ägs i Liljeblads
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

      {data.components.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Inga aktiva komponenter på den kopplade fastigheten.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {data.components.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {[c.type, c.manufacturer, c.model, c.room_zone]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.status && (
                  <Badge variant="outline">
                    {STATUS_SV[c.status] ?? c.status}
                  </Badge>
                )}
                {c.next_service_date && (
                  <span className="text-xs text-muted-foreground">
                    Service {c.next_service_date}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
