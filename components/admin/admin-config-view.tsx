"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getPriorityWeights,
  listDataGapConfigs,
  listSystemConfig,
  savePriorityWeights,
  updateDataGapConfig,
  updateSystemConfigValue,
} from "@/app/actions/config-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpTip } from "@/components/ui/help-tip";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Save,
  Settings2,
  Shield,
  SlidersHorizontal,
} from "lucide-react";

export function AdminConfigView() {
  const qc = useQueryClient();

  const gapQ = useQuery({
    queryKey: ["admin-data-gap-config"],
    queryFn: async () => {
      const res = await listDataGapConfigs();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const sysQ = useQuery({
    queryKey: ["admin-system-config"],
    queryFn: async () => {
      const res = await listSystemConfig();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const weightsQ = useQuery({
    queryKey: ["admin-priority-weights"],
    queryFn: async () => {
      const res = await getPriorityWeights();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const [meps, setMeps] = useState<string | null>(null);
  const [crrem, setCrrem] = useState<string | null>(null);
  const [payback, setPayback] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const saveWeights = useMutation({
    mutationFn: async () => {
      const w = weightsQ.data;
      const res = await savePriorityWeights({
        meps: Number(meps ?? w?.meps ?? 0.4),
        crrem: Number(crrem ?? w?.crrem ?? 0.35),
        payback: Number(payback ?? w?.payback ?? 0.25),
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      setMsg("Prioriteringsvikter sparade.");
      setErr(null);
      void qc.invalidateQueries({ queryKey: ["admin-priority-weights"] });
      void qc.invalidateQueries({ queryKey: ["admin-system-config"] });
    },
    onError: (e: Error) => {
      setErr(e.message);
      setMsg(null);
    },
  });

  const w = weightsQ.data;
  const mepsVal = meps ?? String(w?.meps ?? 0.4);
  const crremVal = crrem ?? String(w?.crrem ?? 0.35);
  const paybackVal = payback ?? String(w?.payback ?? 0.25);

  return (
    <div className="page-shell">
      <div className="page-inner max-w-3xl">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-primary" />
            <h1 className="page-title">Admin · Inställningar</h1>
          </div>
          <p className="page-subtitle">
            Datakvalitetspolicy, prioriteringsvikter och systemkonfiguration.
            Endast administratör kan spara ändringar.
          </p>
        </div>

        {msg && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        )}

        {/* Priority weights */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Prioriteringsvikter</h2>
            <HelpTip text="Används när du klickar «Räkna om prioritet» under Åtgärder. Vikterna normaliseras automatiskt till 100 %." />
          </div>
          {weightsQ.isLoading && (
            <p className="text-sm text-muted-foreground">Laddar vikter…</p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <WeightField
              label="Kravgap (MEPS)"
              value={mepsVal}
              onChange={setMeps}
              help="Högre = prioritera byggnader med stort gap mot 2030-krav"
            />
            <WeightField
              label="Klimatrisk (CRREM)"
              value={crremVal}
              onChange={setCrrem}
              help="Högre = prioritera tidigt riskår"
            />
            <WeightField
              label="Payback"
              value={paybackVal}
              onChange={setPayback}
              help="Högre = prioritera snabb återbetalning"
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={saveWeights.isPending}
              onClick={() => void saveWeights.mutateAsync()}
            >
              {saveWeights.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Spara vikter
            </Button>
          </div>
        </section>

        {/* Data gap config */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Datakvalitetspolicy</h2>
            <HelpTip text="Max antal saknade månader innan året markeras som ofullständigt (blockerar MEPS/CRREM utan override)." />
          </div>
          {gapQ.isLoading && (
            <div className="rounded-xl bg-secondary/50 p-6 text-center text-sm text-muted-foreground">
              Laddar…
            </div>
          )}
          {gapQ.error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {(gapQ.error as Error).message}
            </div>
          )}
          {!gapQ.isLoading && (gapQ.data?.length ?? 0) === 0 && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Inga datakvalitetspolicys konfigurerade.
            </div>
          )}
          <div className="space-y-3">
            {(gapQ.data ?? []).map((cfg) => (
              <DataGapRow
                key={cfg.id}
                cfg={cfg}
                onSaved={() => {
                  setMsg("Datapolicy uppdaterad.");
                  void qc.invalidateQueries({
                    queryKey: ["admin-data-gap-config"],
                  });
                }}
                onError={(m) => setErr(m)}
              />
            ))}
          </div>
        </section>

        {/* System config read/edit key values */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Systemkonfiguration</h2>
          {sysQ.isLoading && (
            <div className="rounded-xl bg-secondary/50 p-6 text-center text-sm text-muted-foreground">
              Laddar…
            </div>
          )}
          {sysQ.error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {(sysQ.error as Error).message}
            </div>
          )}
          <div className="space-y-3">
            {(sysQ.data ?? []).map((row) => (
              <SystemConfigRow
                key={row.id}
                row={row}
                onSaved={() => {
                  setMsg(`Sparade ${row.key}.`);
                  void qc.invalidateQueries({
                    queryKey: ["admin-system-config"],
                  });
                }}
                onError={(m) => setErr(m)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function WeightField({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-sm text-muted-foreground">
        {label}
        <HelpTip text={help} />
      </label>
      <Input
        type="number"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function DataGapRow({
  cfg,
  onSaved,
  onError,
}: {
  cfg: {
    id: string;
    name: string;
    max_missing_months_before_incomplete: number;
    warning_threshold_months: number;
    interpolation_method: string;
    is_default: boolean;
    is_active: boolean;
    notes: string | null;
  };
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [maxMissing, setMaxMissing] = useState(
    String(cfg.max_missing_months_before_incomplete)
  );
  const [warning, setWarning] = useState(String(cfg.warning_threshold_months));
  const [active, setActive] = useState(cfg.is_active);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      const res = await updateDataGapConfig({
        id: cfg.id,
        max_missing_months_before_incomplete: Number(maxMissing),
        warning_threshold_months: Number(warning),
        is_active: active,
      });
      if (!res.success) throw new Error(res.error);
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Fel");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{cfg.name}</span>
        {cfg.is_default && <Badge variant="success">Standard</Badge>}
        {!cfg.is_active && <Badge variant="outline">Inaktiv</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">
            Max saknade mån
          </label>
          <Input
            type="number"
            min={0}
            max={12}
            value={maxMissing}
            onChange={(e) => setMaxMissing(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">
            Varning från mån
          </label>
          <Input
            type="number"
            min={0}
            max={12}
            value={warning}
            onChange={(e) => setWarning(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="flex items-end gap-2 pb-1">
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Checkbox
              checked={active}
              onCheckedChange={(v) => setActive(v === true)}
            />
            Aktiv
          </label>
        </div>
        <div className="flex items-end justify-end">
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            disabled={pending}
            onClick={() => void save()}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Spara"
            )}
          </Button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Metod: {cfg.interpolation_method}
        {cfg.notes ? ` · ${cfg.notes}` : ""}
      </p>
    </div>
  );
}

function SystemConfigRow({
  row,
  onSaved,
  onError,
}: {
  row: {
    id: string;
    key: string;
    value: unknown;
    description: string | null;
  };
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [text, setText] = useState(JSON.stringify(row.value, null, 0));
  const [pending, setPending] = useState(false);

  // Special UI for override_enabled_per_role
  if (row.key === "override_enabled_per_role" && isRoleMap(row.value)) {
    return (
      <OverrideRolesEditor
        value={row.value as Record<string, boolean>}
        description={row.description}
        onSaved={onSaved}
        onError={onError}
      />
    );
  }

  // Skip priority_weights – edited above
  if (row.key === "priority_weights") return null;

  async function save() {
    setPending(true);
    try {
      const parsed = JSON.parse(text) as unknown;
      const res = await updateSystemConfigValue({ key: row.key, value: parsed });
      if (!res.success) throw new Error(res.error);
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Ogiltig JSON");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <code className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {row.key}
        </code>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={pending}
          onClick={() => void save()}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Spara"
          )}
        </Button>
      </div>
      {row.description && (
        <p className="mb-2 text-xs text-muted-foreground">{row.description}</p>
      )}
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="h-9 font-mono text-xs"
      />
    </div>
  );
}

function isRoleMap(v: unknown): v is Record<string, boolean> {
  return (
    typeof v === "object" &&
    v !== null &&
    ("admin" in v || "viewer" in v || "portfolio_manager" in v)
  );
}

function OverrideRolesEditor({
  value,
  description,
  onSaved,
  onError,
}: {
  value: Record<string, boolean>;
  description: string | null;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const roles = [
    "admin",
    "portfolio_manager",
    "property_manager",
    "viewer",
  ] as const;
  const labels: Record<string, string> = {
    admin: "Admin",
    portfolio_manager: "Portföljförvaltare",
    property_manager: "Teknisk förvaltare",
    viewer: "Läsare",
  };
  const [map, setMap] = useState({ ...value });
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      const res = await updateSystemConfigValue({
        key: "override_enabled_per_role",
        value: map,
      });
      if (!res.success) throw new Error(res.error);
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Fel");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-1.5 flex items-center justify-between">
        <code className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          override_enabled_per_role
        </code>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={pending}
          onClick={() => void save()}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Spara"
          )}
        </Button>
      </div>
      {description && (
        <p className="mb-3 text-xs text-muted-foreground">{description}</p>
      )}
      <div className="flex flex-wrap gap-4">
        {roles.map((r) => (
          <label
            key={r}
            className="flex items-center gap-1.5 text-sm text-muted-foreground"
          >
            <Checkbox
              checked={map[r] === true}
              onCheckedChange={(v) =>
                setMap((m) => ({ ...m, [r]: v === true }))
              }
            />
            {labels[r]}
          </label>
        ))}
      </div>
    </div>
  );
}
