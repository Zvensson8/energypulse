"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Building2,
  Home,
  ListTodo,
  Loader2,
  Search,
} from "lucide-react";
import { globalSearch, type SearchHit } from "@/app/actions/search";
import { cn } from "@/lib/utils";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      startTransition(async () => {
        const res = await globalSearch({ query, limit: 12 });
        if (res.success) setHits(res.data);
        else setHits([]);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  if (!open) return null;

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const icon = (type: SearchHit["type"]) => {
    if (type === "property") return Home;
    if (type === "building") return Building2;
    return ListTodo;
  };

  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-black/70"
        onClick={() => onOpenChange(false)}
      />
      <div className="absolute left-1/2 top-[15%] w-full max-w-xl -translate-x-1/2">
        <Command
          className="overflow-hidden rounded-md border border-terminal-border bg-terminal-panel shadow-2xl"
          shouldFilter={false}
          label="Global sök"
        >
          <div className="flex items-center gap-2 border-b border-terminal-border px-2">
            <Search className="h-3.5 w-3.5 text-terminal-muted" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Sök fastighet, byggnad, åtgärd…"
              className="h-9 w-full bg-transparent text-table outline-none placeholder:text-terminal-muted"
              autoFocus
            />
            {pending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-terminal-muted" />
            )}
            <kbd className="rounded border border-terminal-border px-1 text-2xs text-terminal-muted">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-80 overflow-auto p-1">
            <Command.Empty className="py-6 text-center text-table text-terminal-muted">
              {query ? "Inga träffar" : "Skriv för att söka…"}
            </Command.Empty>

            {!query && (
              <Command.Group
                heading="Gå till"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-terminal-muted"
              >
                <Command.Item
                  onSelect={() => go("/dashboard")}
                  className={itemClass}
                >
                  Översikt – portföljens läge
                </Command.Item>
                <Command.Item
                  onSelect={() => go("/properties")}
                  className={itemClass}
                >
                  Fastigheter
                </Command.Item>
                <Command.Item
                  onSelect={() => go("/properties/new")}
                  className={itemClass}
                >
                  Ny fastighet
                </Command.Item>
                <Command.Item
                  onSelect={() => go("/buildings")}
                  className={itemClass}
                >
                  Byggnader – prestanda & krav
                </Command.Item>
                <Command.Item
                  onSelect={() => go("/buildings?gap=INCOMPLETE_DATA")}
                  className={itemClass}
                >
                  Byggnader med saknad data
                </Command.Item>
                <Command.Item
                  onSelect={() => go("/spaces")}
                  className={itemClass}
                >
                  Lokaler (GDPR-maskerade)
                </Command.Item>
                <Command.Item
                  onSelect={() => go("/import")}
                  className={itemClass}
                >
                  Importera energidata (CSV/Excel)
                </Command.Item>
                <Command.Item
                  onSelect={() => go("/actions")}
                  className={itemClass}
                >
                  Åtgärder – prioritering
                </Command.Item>
                <Command.Item
                  onSelect={() => go("/risks")}
                  className={itemClass}
                >
                  Fysiska klimatrisker
                </Command.Item>
                <Command.Item
                  onSelect={() => go("/risk-scores")}
                  className={itemClass}
                >
                  Kombinerad risk (EPBD/MEPS/CRREM)
                </Command.Item>
                <Command.Item
                  onSelect={() => go("/renovation")}
                  className={itemClass}
                >
                  Renovationsplaner
                </Command.Item>
                <Command.Item
                  onSelect={() => go("/crrem")}
                  className={itemClass}
                >
                  Klimatrisk (CRREM)
                </Command.Item>
                <Command.Item
                  onSelect={() => go("/data-edit")}
                  className={itemClass}
                >
                  Manuell dataredigering
                </Command.Item>
                <Command.Item
                  onSelect={() => go("/admin")}
                  className={itemClass}
                >
                  Admin – inställningar
                </Command.Item>
                <Command.Item
                  onSelect={() => go("/guide")}
                  className={itemClass}
                >
                  Guide för förvaltare
                </Command.Item>
              </Command.Group>
            )}

            {hits.length > 0 && (
              <Command.Group
                heading="Träffar"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-terminal-muted"
              >
                {hits.map((hit) => {
                  const Icon = icon(hit.type);
                  return (
                    <Command.Item
                      key={`${hit.type}-${hit.id}`}
                      value={`${hit.type}-${hit.id}-${hit.title}`}
                      onSelect={() => go(hit.href)}
                      className={itemClass}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-terminal-accent" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{hit.title}</div>
                        <div className="truncate text-2xs text-terminal-muted">
                          {hit.subtitle}
                        </div>
                      </div>
                      <span className="text-2xs uppercase text-terminal-muted">
                        {hit.meta}
                      </span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

const itemClass = cn(
  "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-table",
  "aria-selected:bg-terminal-row aria-selected:text-foreground",
  "data-[selected=true]:bg-terminal-row"
);
