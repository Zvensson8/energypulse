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
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="absolute left-1/2 top-[12%] w-full max-w-xl -translate-x-1/2 px-3">
        <Command
          className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
          shouldFilter={false}
          label="Global sök"
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Sök fastighet, byggnad, åtgärd…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            {pending && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <kbd className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-80 overflow-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              {query ? "Inga träffar" : "Skriv för att söka…"}
            </Command.Empty>

            {!query && (
              <Command.Group
                heading="Gå till"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                <Command.Item
                  onSelect={() => go("/")}
                  className={itemClass}
                >
                  Hem – vad vill du göra?
                </Command.Item>
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
                  onSelect={() => go("/properties")}
                  className={itemClass}
                >
                  Hitta byggnader & lokaler via fastighet
                </Command.Item>
                <Command.Item
                  onSelect={() => go("/risk-scores")}
                  className={itemClass}
                >
                  Byggnader med hög risk (riskscore)
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
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
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
                      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{hit.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {hit.subtitle}
                        </div>
                      </div>
                      <span className="text-[11px] uppercase text-muted-foreground">
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
  "flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm",
  "aria-selected:bg-secondary aria-selected:text-foreground",
  "data-[selected=true]:bg-secondary"
);
