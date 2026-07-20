"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listPortfolioSpaces,
  decryptTenantName,
  createSpace,
} from "@/app/actions/spaces-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { HelpTip } from "@/components/ui/help-tip";
import { formatNumber } from "@/lib/utils";
import {
  DoorOpen,
  Eye,
  EyeOff,
  Plus,
  Search,
  Shield,
} from "lucide-react";

const SPACE_TYPE_SV: Record<string, string> = {
  office: "Kontor",
  retail: "Butik",
  warehouse: "Lager",
  industrial: "Industri",
  hotel: "Hotell",
  education: "Utbildning",
  healthcare: "Vård",
  mixed: "Blandat",
  other: "Övrigt",
};

export function SpacesView() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [reveal, setReveal] = useState<{
    spaceId: string;
    name: string | null;
  } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["portfolio-spaces", q],
    queryFn: async () => {
      const res = await listPortfolioSpaces({ search: q || undefined });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  return (
    <div className="flex h-full flex-col gap-1.5 p-2">
      <div className="panel flex flex-wrap items-center gap-2 rounded-md px-3 py-2">
        <div className="flex items-center gap-1.5">
          <DoorOpen className="h-4 w-4 text-terminal-accent" />
          <h1 className="text-sm font-semibold">Lokaler</h1>
          <HelpTip text="Hyresgästnamn visas maskerade av GDPR-skäl. Visa original kräver motivering och loggas." />
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-terminal-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setQ(search);
            }}
            placeholder="Sök lokal, byggnad…"
            className="h-8 w-52 pl-7 text-xs"
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
          <span className="hidden items-center gap-1 text-2xs text-terminal-muted sm:inline-flex">
            <Shield className="h-3 w-3 text-terminal-green" />
            Hyresgäst maskerad
          </span>
          <Button
            size="sm"
            className="h-8 gap-1"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Ny lokal
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="panel min-h-0 flex-1 overflow-auto rounded-md">
        {isLoading && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Laddar lokaler…
          </div>
        )}
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-terminal-row text-2xs text-terminal-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Lokal</th>
              <th className="px-3 py-2 text-left font-medium">Byggnad</th>
              <th className="px-3 py-2 text-left font-medium">Typ</th>
              <th className="px-3 py-2 text-left font-medium">Hyresgäst</th>
              <th className="px-3 py-2 text-right font-medium">LOA</th>
              <th className="px-3 py-2 text-right font-medium">BOA</th>
              <th className="px-3 py-2 text-center font-medium">Uppvärmd</th>
              <th className="px-3 py-2 text-left font-medium">Kontrakt</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((s) => (
              <tr
                key={s.id}
                className="border-t border-terminal-border/50 hover:bg-terminal-row/50"
              >
                <td className="px-3 py-1.5 font-medium">{s.name ?? "—"}</td>
                <td className="px-3 py-1.5">
                  <Link
                    href={`/buildings?building=${s.building_id}`}
                    className="text-terminal-accent hover:underline"
                  >
                    {s.building_name}
                  </Link>
                  <div className="text-2xs text-terminal-muted">
                    {s.property_name}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-terminal-muted">
                  {SPACE_TYPE_SV[s.space_type] ?? s.space_type}
                </td>
                <td className="px-3 py-1.5">
                  {s.has_tenant ? (
                    <Badge variant="outline">{s.tenant_name ?? "***"}</Badge>
                  ) : (
                    <span className="text-terminal-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular">
                  {s.loa != null ? formatNumber(s.loa, 0) : "—"}
                </td>
                <td className="px-3 py-1.5 text-right tabular">
                  {s.boa != null ? formatNumber(s.boa, 0) : "—"}
                </td>
                <td className="px-3 py-1.5 text-center">
                  {s.is_heated ? "Ja" : "Nej"}
                </td>
                <td className="px-3 py-1.5 text-2xs text-terminal-muted">
                  {s.contract_start ?? "—"}
                  {s.contract_end ? ` → ${s.contract_end}` : ""}
                </td>
                <td className="px-3 py-1.5">
                  {s.has_tenant && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-2xs"
                      onClick={() =>
                        setReveal({ spaceId: s.id, name: s.name })
                      }
                      title="Visa hyresgäst (kräver motivering)"
                    >
                      <Eye className="h-3 w-3" />
                      Visa
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  Inga lokaler hittades. Skapa en eller kör pilot-seed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <RevealTenantDialog
        open={Boolean(reveal)}
        spaceId={reveal?.spaceId ?? null}
        spaceLabel={reveal?.name}
        onClose={() => setReveal(null)}
      />

      <CreateSpaceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          void qc.invalidateQueries({ queryKey: ["portfolio-spaces"] });
          setCreateOpen(false);
        }}
      />
    </div>
  );
}

function RevealTenantDialog({
  open,
  spaceId,
  spaceLabel,
  onClose,
}: {
  open: boolean;
  spaceId: string | null;
  spaceLabel?: string | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [plain, setPlain] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      if (!spaceId) throw new Error("Saknar lokal");
      const res = await decryptTenantName({
        space_id: spaceId,
        reason: reason.trim(),
      });
      if (!res.success) throw new Error(res.error);
      return res.data.tenant_name;
    },
    onSuccess: (name) => {
      setPlain(name);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason("");
          setPlain(null);
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Visa hyresgäst
          </DialogTitle>
          <DialogDescription>
            GDPR: du måste ange en motivering. Åtgärden loggas. Lokal:{" "}
            {spaceLabel ?? spaceId}
          </DialogDescription>
        </DialogHeader>
        {plain ? (
          <div className="space-y-3">
            <div className="rounded-md border border-gap-complete/30 bg-gap-complete/10 px-3 py-3">
              <div className="text-2xs text-terminal-muted">Hyresgäst</div>
              <div className="text-sm font-semibold">{plain}</div>
            </div>
            <Button
              variant="terminal"
              className="w-full gap-1"
              onClick={() => {
                setPlain(null);
                setReason("");
                onClose();
              }}
            >
              <EyeOff className="h-3.5 w-3.5" />
              Stäng och dölj
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-terminal-muted">
                Motivering (minst 5 tecken) *
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="t.ex. Hyresgästkontakt i ärende #123"
                className="min-h-[72px]"
              />
            </div>
            {error && (
              <div className="text-xs text-destructive">{error}</div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="terminal" onClick={onClose}>
                Avbryt
              </Button>
              <Button
                disabled={reason.trim().length < 5 || mut.isPending}
                onClick={() => void mut.mutateAsync()}
              >
                {mut.isPending ? "Hämtar…" : "Visa namn"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateSpaceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [buildingId, setBuildingId] = useState("");
  const [name, setName] = useState("");
  const [spaceType, setSpaceType] = useState("office");
  const [tenant, setTenant] = useState("");
  const [loa, setLoa] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const buildingsQ = useQuery({
    queryKey: ["buildings-for-spaces"],
    enabled: open,
    queryFn: async () => {
      const { getBrowserClient } = await import("@/lib/supabase/client");
      const sb = getBrowserClient();
      const { data, error: err } = await sb
        .from("buildings")
        .select("id, name, properties(name)")
        .order("name")
        .limit(200);
      if (err) throw new Error(err.message);
      return data ?? [];
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await createSpace({
        building_id: buildingId,
        name: name.trim() || null,
        space_type: spaceType,
        tenant_name: tenant.trim() || null,
        loa: loa ? Number(loa) : null,
        is_heated: true,
      });
      if (!res.success) throw new Error(res.error);
      setName("");
      setTenant("");
      setLoa("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fel");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ny lokal</DialogTitle>
          <DialogDescription>
            Hyresgästnamn krypteras automatiskt. Du ser det maskerat i listan.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-terminal-muted">Byggnad *</label>
            <Select value={buildingId} onValueChange={setBuildingId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Välj byggnad" />
              </SelectTrigger>
              <SelectContent>
                {(buildingsQ.data ?? []).map((b) => {
                  const prop = b.properties as
                    | { name: string }
                    | { name: string }[]
                    | null;
                  const pname = Array.isArray(prop)
                    ? prop[0]?.name
                    : prop?.name;
                  return (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                      {pname ? ` · ${pname}` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-terminal-muted">Lokalnamn</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="t.ex. Plan 3 vänster"
              className="h-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-terminal-muted">Typ</label>
              <Select value={spaceType} onValueChange={setSpaceType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SPACE_TYPE_SV).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-terminal-muted">LOA m²</label>
              <Input
                type="number"
                min={0}
                value={loa}
                onChange={(e) => setLoa(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-terminal-muted">
              Hyresgäst (valfritt, krypteras)
            </label>
            <Input
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              placeholder="Företagsnamn"
              className="h-9"
            />
          </div>
          {error && <div className="text-xs text-destructive">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="terminal"
              onClick={() => onOpenChange(false)}
            >
              Avbryt
            </Button>
            <Button type="submit" disabled={pending || !buildingId}>
              {pending ? "Sparar…" : "Spara"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
