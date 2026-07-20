"use client";

import { useMemo, useState } from "react";
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
import { formatNumber, cn } from "@/lib/utils";
import {
  Building2,
  DoorOpen,
  Eye,
  EyeOff,
  Flame,
  Plus,
  Search,
  Shield,
  Thermometer,
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

  const stats = useMemo(() => {
    const list = data ?? [];
    return {
      total: list.length,
      withTenant: list.filter((s) => s.has_tenant).length,
      heated: list.filter((s) => s.is_heated).length,
      loa: list.reduce((sum, s) => sum + (s.loa ?? 0), 0),
    };
  }, [data]);

  return (
    <div className="page-shell">
      <div className="page-inner">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <DoorOpen className="h-6 w-6 text-primary" />
              <h1 className="page-title">Lokaler</h1>
              <HelpTip text="Hyresgästnamn visas maskerade av GDPR-skäl. Visa original kräver motivering och loggas." />
            </div>
            <p className="page-subtitle">
              Översikt över lokaler i portföljen. Hyresgästuppgifter är
              skyddade och kräver motivering för att visas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              <Shield className="h-3.5 w-3.5" />
              Hyresgäst maskerad
            </span>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Ny lokal
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Step
            n="1"
            title="Hitta lokal"
            body="Sök på lokalnamn, byggnad eller typ i listan nedan."
          />
          <Step
            n="2"
            title="Lägg till"
            body="Skapa lokal kopplad till byggnad. Hyresgäst krypteras automatiskt."
          />
          <Step
            n="3"
            title="Visa hyresgäst"
            body="GDPR-skydd: motivering krävs och varje visning loggas."
          />
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Lokaler" value={String(stats.total)} />
          <Stat
            label="Med hyresgäst"
            value={String(stats.withTenant)}
            tone="text-indigo-600"
          />
          <Stat
            label="Uppvärmda"
            value={String(stats.heated)}
            tone="text-amber-600"
          />
          <Stat
            label="Summa LOA"
            value={
              stats.loa > 0 ? `${formatNumber(stats.loa, 0)} m²` : "—"
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setQ(search);
              }}
              placeholder="Sök lokal, byggnad…"
              className="pl-9"
            />
          </div>
          <Button variant="outline" onClick={() => setQ(search)}>
            Sök
          </Button>
          <span className="text-sm tabular text-muted-foreground">
            {data?.length ?? 0} st{isFetching ? " · …" : ""}
          </span>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {(error as Error).message}
          </div>
        )}

        {isLoading && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Laddar lokaler…
          </div>
        )}

        {!isLoading && (data?.length ?? 0) === 0 && (
          <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
            <DoorOpen className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <h3 className="mt-3 text-lg font-semibold">Inga lokaler hittades</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Skapa din första lokal eller justera sökningen. Du kan också köra
              pilot-seed.
            </p>
            <Button className="mt-5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Skapa lokal
            </Button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(data ?? []).map((s) => (
            <article
              key={s.id}
              className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <DoorOpen className="h-5 w-5" />
                </span>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <Badge variant="outline">
                    {SPACE_TYPE_SV[s.space_type] ?? s.space_type}
                  </Badge>
                  {s.is_heated ? (
                    <Badge variant="warning">
                      <Flame className="mr-1 h-3 w-3" />
                      Uppvärmd
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      <Thermometer className="mr-1 h-3 w-3" />
                      Ouppvärmd
                    </Badge>
                  )}
                </div>
              </div>

              <h3 className="mt-3 text-base font-semibold text-foreground">
                {s.name ?? "Namnlös lokal"}
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                <Link
                  href={`/buildings?building=${s.building_id}`}
                  className="inline-flex items-center gap-1 hover:text-primary"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  {s.building_name}
                </Link>
                <span className="text-muted-foreground/70">
                  {" "}
                  · {s.property_name}
                </span>
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <MiniStat
                  label="LOA"
                  value={s.loa != null ? `${formatNumber(s.loa, 0)} m²` : "—"}
                />
                <MiniStat
                  label="BOA"
                  value={s.boa != null ? `${formatNumber(s.boa, 0)} m²` : "—"}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {s.has_tenant ? (
                  <Badge variant="outline">{s.tenant_name ?? "***"}</Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Ingen hyresgäst
                  </span>
                )}
              </div>

              {(s.contract_start || s.contract_end) && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Kontrakt: {s.contract_start ?? "—"}
                  {s.contract_end ? ` → ${s.contract_end}` : ""}
                </p>
              )}

              {s.has_tenant && (
                <div className="mt-4 border-t border-border pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1.5"
                    onClick={() =>
                      setReveal({ spaceId: s.id, name: s.name })
                    }
                    title="Visa hyresgäst (kräver motivering)"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Visa hyresgäst
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
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
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular", tone)}>
        {value}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular">{value}</div>
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
            <Eye className="h-4 w-4 text-primary" />
            Visa hyresgäst
          </DialogTitle>
          <DialogDescription>
            GDPR: du måste ange en motivering. Åtgärden loggas. Lokal:{" "}
            {spaceLabel ?? spaceId}
          </DialogDescription>
        </DialogHeader>
        {plain ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="text-sm text-muted-foreground">Hyresgäst</div>
              <div className="text-base font-semibold text-emerald-800">
                {plain}
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full gap-1.5"
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
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
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
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
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
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Byggnad *</label>
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
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Lokalnamn</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="t.ex. Plan 3 vänster"
              className="h-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Typ</label>
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
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">LOA m²</label>
              <Input
                type="number"
                min={0}
                value={loa}
                onChange={(e) => setLoa(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">
              Hyresgäst (valfritt, krypteras)
            </label>
            <Input
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              placeholder="Företagsnamn"
              className="h-9"
            />
          </div>
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
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
