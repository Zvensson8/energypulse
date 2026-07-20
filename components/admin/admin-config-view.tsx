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
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-5">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-terminal-accent" />
            <h1 className="text-lg font-semibold">Admin · Inställningar</h1>
          </div>
          <p className="mt-1 text-xs text-terminal-muted">
            Datakvalitetspolicy, prioriteringsvikter och systemkonfiguration.
            Endast administratör kan spara ändringar.
          </p>
        </div>

        {msg && (
          <div className="rounded-md border border-gap-complete/30 bg-gap-complete/10 px-3 py-2 text-xs text-gap-complete">
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {err}
          </div>
        )}

        {/* Priority weights */}
        <section className="panel space-y-3 rounded-md p-4">
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-4 w-4 text-terminal-accent" />
            <h2 className="text-sm font-semibold">Prioriteringsvikter</h2>
            <HelpTip text="Används när du klickar «Räkna om prioritet» under Åtgärder. Vikterna normaliseras automatiskt till 100 %." />
          </div>
          <div className="grid grid-cols-3 gap-3">
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
        <section className="panel space-y-3 rounded-md p-4">
          <div className="flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-terminal-accent" />
            <h2 className="text-sm font-semibold">Datakvalitetspolicy</h2>
            <HelpTip text="Max antal saknade månader innan året markeras som ofullständigt (blockerar MEPS/CRREM utan override)." />
          </div>
          {gapQ.isLoading && (
            <p className="text-xs text-muted-foreground">Laddar…</p>
          )}
          {gapQ.error && (
            <p className="text-xs text-destructive">
              {(gapQ.error as Error).message}
            </p>
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
        <section className="panel space-y-3 rounded-md p-4">
          <h2 className="text-sm font-semibold">Systemkonfiguration</h2>
          {sysQ.isLoading && (
            <p className="text-xs text-muted-foreground">Laddar…</p>
          )}
          <div className="space-y-2">
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
    <div className="space-y-1">
      <label className="flex items-center gap-1 text-xs text-terminal-muted">
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
        className="h-9"
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
    <div className="rounded-md border border-terminal-border bg-terminal-row/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium">{cfg.name}</span>
        {cfg.is_default && <Badge variant="success">Standard</Badge>}
        {!cfg.is_active && <Badge variant="outline">Inaktiv</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <label className="text-2xs text-terminal-muted">
            Max saknade mån
          </label>
          <Input
            type="number"
            min={0}
            max={12}
            value={maxMissing}
            onChange={(e) => setMaxMissing(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <label className="text-2xs text-terminal-muted">
            Varning från mån
          </label>
          <Input
            type="number"
            min={0}
            max={12}
            value={warning}
            onChange={(e) => setWarning(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="flex items-end gap-2 pb-1">
          <label className="flex items-center gap-1.5 text-xs text-terminal-muted">
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
            variant="terminal"
            className="h-8"
            disabled={pending}
            onClick={() => void save()}
          >
            {pending ? "…" : "Spara"}
          </Button>
        </div>
      </div>
      <p className="mt-2 text-2xs text-terminal-muted">
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
    <div className="rounded-md border border-terminal-border p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <code className="text-xs text-terminal-accent">{row.key}</code>
        <Button
          size="sm"
          variant="terminal"
          className="h-7"
          disabled={pending}
          onClick={() => void save()}
        >
          {pending ? "…" : "Spara"}
        </Button>
      </div>
      {row.description && (
        <p className="mb-1.5 text-2xs text-terminal-muted">{row.description}</p>
      )}
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="h-8 font-mono text-2xs"
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
    <div className="rounded-md border border-terminal-border p-3">
      <div className="mb-1 flex items-center justify-between">
        <code className="text-xs text-terminal-accent">
          override_enabled_per_role
        </code>
        <Button
          size="sm"
          variant="terminal"
          className="h-7"
          disabled={pending}
          onClick={() => void save()}
        >
          {pending ? "…" : "Spara"}
        </Button>
      </div>
      {description && (
        <p className="mb-2 text-2xs text-terminal-muted">{description}</p>
      )}
      <div className="flex flex-wrap gap-3">
        {roles.map((r) => (
          <label
            key={r}
            className="flex items-center gap-1.5 text-xs text-terminal-muted"
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
