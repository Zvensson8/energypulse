"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listProperties } from "@/app/actions/properties-crud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HelpTip } from "@/components/ui/help-tip";
import { OWNERSHIP_SV, STATUS_SV, TERMS } from "@/lib/labels";
import {
  Plus,
  Search,
  Building2,
  MapPin,
  MapPinned,
  ArrowRight,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function PropertiesList() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["properties-list", q],
    queryFn: async () => {
      const res = await listProperties(q || undefined);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    if (statusFilter === "all") return list;
    return list.filter((p) => p.status === statusFilter);
  }, [data, statusFilter]);

  const stats = useMemo(() => {
    const list = data ?? [];
    return {
      total: list.length,
      active: list.filter((p) => p.status === "active").length,
      buildings: list.reduce((s, p) => s + (p.building_count ?? 0), 0),
    };
  }, [data]);

  return (
    <div className="page-shell">
      <div className="page-inner">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <MapPinned className="h-6 w-6 text-primary" />
              <h1 className="page-title">{TERMS.properties.label}</h1>
              <HelpTip text={TERMS.properties.help} />
            </div>
            <p className="page-subtitle">
              Hitta en fastighet, öppna detalj, eller skapa en ny. Nästa steg:
              byggnader och energidata.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/import">
                <Upload className="h-4 w-4" />
                Importera energi
              </Link>
            </Button>
            <Button asChild>
              <Link href="/properties/new">
                <Plus className="h-4 w-4" />
                Ny fastighet
              </Link>
            </Button>
          </div>
        </div>

        {/* How-to */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Step
            n="1"
            title="Välj eller skapa"
            body="Sök i listan eller lägg till en ny fastighet."
          />
          <Step
            n="2"
            title="Lägg till byggnader"
            body="Öppna detaljsidan och registrera byggnader under fastigheten."
          />
          <Step
            n="3"
            title="Importera data"
            body="Ladda upp månadsförbrukning – prestanda räknas om automatiskt."
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Stat
            label="Fastigheter"
            value={String(stats.total)}
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
          <Stat
            label="Aktiva"
            value={String(stats.active)}
            tone="text-emerald-600"
            active={statusFilter === "active"}
            onClick={() => setStatusFilter("active")}
          />
          <Stat
            label="Byggnader"
            value={String(stats.buildings)}
            tone="text-indigo-600"
          />
        </div>

        {/* Search */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setQ(search);
              }}
              placeholder="Sök namn, beteckning, kommun…"
              className="pl-9"
            />
          </div>
          <Button variant="outline" onClick={() => setQ(search)}>
            Sök
          </Button>
          <span className="text-sm tabular text-muted-foreground">
            {rows.length} st{isFetching ? " · …" : ""}
          </span>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {(error as Error).message}
          </div>
        )}

        {isLoading && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Laddar fastigheter…
          </div>
        )}

        {!isLoading && rows.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
            <MapPinned className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <h3 className="mt-3 text-lg font-semibold">Inga fastigheter</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Skapa din första fastighet för att börja bygga beståndet.
            </p>
            <Button className="mt-5" asChild>
              <Link href="/properties/new">
                <Plus className="h-4 w-4" /> Skapa fastighet
              </Link>
            </Button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <Link
              key={p.id}
              href={`/properties/${p.id}`}
              className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </span>
                <Badge
                  variant={
                    p.status === "active"
                      ? "success"
                      : p.status === "inactive"
                        ? "outline"
                        : "warning"
                  }
                >
                  {STATUS_SV[p.status] ?? p.status}
                </Badge>
              </div>
              <h3 className="mt-3 text-base font-semibold text-foreground group-hover:text-primary">
                {p.name}
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {p.external_id ?? "Ingen beteckning"}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {p.municipality ?? "—"}
                </span>
                <span>Zon {p.climate_zone ?? "—"}</span>
                <span className="tabular">
                  {p.building_count} byggnad
                  {p.building_count === 1 ? "" : "er"}
                </span>
                <span>
                  {OWNERSHIP_SV[p.ownership_type] ?? p.ownership_type}
                </span>
              </div>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Öppna
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
        {n}
      </div>
      <div className="mt-2 text-sm font-semibold">{title}</div>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: string;
  tone?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-2xl border bg-card p-4 text-left shadow-sm transition",
        onClick && "hover:-translate-y-0.5 hover:shadow-md",
        active ? "border-primary ring-2 ring-primary/20" : "border-border"
      )}
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular", tone)}>
        {value}
      </div>
    </Comp>
  );
}
