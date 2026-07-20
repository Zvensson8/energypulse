"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listProperties } from "@/app/actions/properties-crud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HelpTip } from "@/components/ui/help-tip";
import { OWNERSHIP_SV, STATUS_SV, TERMS } from "@/lib/labels";
import { Plus, Search, Building2, MapPin, BookOpen } from "lucide-react";

export function PropertiesList() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["properties-list", q],
    queryFn: async () => {
      const res = await listProperties(q || undefined);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  return (
    <div className="flex h-full flex-col gap-1.5 p-2">
      <div className="panel flex flex-wrap items-center gap-2 rounded-md px-3 py-2">
        <div className="flex items-center gap-1.5">
          <h1 className="text-sm font-semibold text-foreground">
            {TERMS.properties.label}
          </h1>
          <HelpTip text={TERMS.properties.help} />
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-terminal-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setQ(search);
            }}
            placeholder="Sök namn, beteckning, kommun…"
            className="h-8 w-56 pl-7 text-xs sm:w-64"
          />
        </div>
        <Button
          size="sm"
          variant="terminal"
          className="h-8"
          onClick={() => setQ(search)}
        >
          Sök
        </Button>
        <span className="text-2xs tabular text-terminal-muted">
          {data?.length ?? 0} st{isFetching ? " · …" : ""}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="terminal" className="h-8 gap-1" asChild>
            <Link href="/guide">
              <BookOpen className="h-3 w-3" />
              <span className="hidden sm:inline">Guide</span>
            </Link>
          </Button>
          <Button size="sm" className="h-8 gap-1" asChild>
            <Link href="/properties/new">
              <Plus className="h-3.5 w-3.5" />
              Ny fastighet
            </Link>
          </Button>
        </div>
      </div>

      <div className="panel min-h-0 flex-1 overflow-auto rounded-md">
        {isLoading && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Laddar fastigheter…
          </div>
        )}
        {error && (
          <div className="p-4 text-xs text-destructive">
            {(error as Error).message}
          </div>
        )}
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-terminal-row text-2xs text-terminal-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Namn</th>
              <th className="px-3 py-2 text-left font-medium">
                Fastighetsbeteckning
              </th>
              <th className="px-3 py-2 text-left font-medium">Kommun</th>
              <th className="px-3 py-2 text-left font-medium">Klimatzon</th>
              <th className="px-3 py-2 text-center font-medium">Byggnader</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Ägande</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr
                key={p.id}
                className="border-t border-terminal-border/50 transition hover:bg-terminal-row/60"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/properties/${p.id}`}
                    className="inline-flex items-center gap-1.5 font-medium text-terminal-accent hover:underline"
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    {p.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-terminal-muted">
                  {p.external_id ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-terminal-muted" />
                    {p.municipality ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2 tabular">{p.climate_zone ?? "—"}</td>
                <td className="px-3 py-2 text-center tabular">
                  {p.building_count}
                </td>
                <td className="px-3 py-2">
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
                </td>
                <td className="px-3 py-2 text-terminal-muted">
                  {OWNERSHIP_SV[p.ownership_type] ?? p.ownership_type}
                </td>
              </tr>
            ))}
            {data?.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  <p className="mb-2">Inga fastigheter ännu.</p>
                  <Link
                    href="/properties/new"
                    className="text-terminal-accent hover:underline"
                  >
                    Skapa din första fastighet
                  </Link>
                  {" · "}
                  <Link
                    href="/guide"
                    className="text-terminal-muted hover:text-terminal-accent"
                  >
                    Läs guiden
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
