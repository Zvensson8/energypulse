"use client";

import { useEffect, useMemo, useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Save,
  Settings2,
  Shield,
  SlidersHorizontal,
  Activity,
  LineChart,
  Users,
  Sparkles,
  Database,
  Workflow,
  Info,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SysRow = {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administratör",
  portfolio_manager: "Portföljförvaltare",
  property_manager: "Teknisk förvaltare",
  viewer: "Läsare",
};

const ROLE_ORDER = [
  "admin",
  "portfolio_manager",
  "property_manager",
  "viewer",
] as const;

/** Keys we render with dedicated Swedish forms (not raw JSON). */
const KNOWN_KEYS = new Set([
  "priority_weights",
  "combined_risk_weights",
  "crrem_defaults",
  "data_retention_years",
  "default_data_gap_policy_id",
  "fas7_workflow",
  "improvement_detection",
  "override_enabled_per_role",
  "tenant_masking_enabled",
]);

export function AdminConfigView() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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

  const byKey = useMemo(() => {
    const m = new Map<string, SysRow>();
    for (const row of sysQ.data ?? []) m.set(row.key, row as SysRow);
    return m;
  }, [sysQ.data]);

  const unknownRows = useMemo(
    () => (sysQ.data ?? []).filter((r) => !KNOWN_KEYS.has(r.key)),
    [sysQ.data]
  );

  function saved(label: string) {
    setMsg(`${label} sparad.`);
    setErr(null);
    void qc.invalidateQueries({ queryKey: ["admin-system-config"] });
    void qc.invalidateQueries({ queryKey: ["admin-priority-weights"] });
    void qc.invalidateQueries({ queryKey: ["admin-data-gap-config"] });
  }

  function failed(e: unknown) {
    setErr(e instanceof Error ? e.message : "Kunde inte spara");
    setMsg(null);
  }

  return (
    <div className="page-shell">
      <div className="page-inner max-w-3xl space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-primary" />
            <h1 className="page-title">Admin</h1>
          </div>
          <p className="page-subtitle">
            Styr hur EnergyPulse räknar risk, prioriterar åtgärder och skyddar
            data. Endast administratör kan spara.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Ändra en sektion i taget och klicka <strong>Spara</strong>. Vikter
            anges som andelar (t.ex. 0,4 = 40 %). De normaliseras automatiskt där
            det behövs.
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

        {(sysQ.isLoading || weightsQ.isLoading || gapQ.isLoading) && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            Laddar inställningar…
          </div>
        )}

        {(sysQ.error || weightsQ.error || gapQ.error) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {(sysQ.error as Error)?.message ||
              (weightsQ.error as Error)?.message ||
              (gapQ.error as Error)?.message}
          </div>
        )}

        {/* 1. Action priority */}
        <Section
          icon={SlidersHorizontal}
          title="Prioritering av åtgärder"
          body="Hur systemet rankar åtgärder under menyn Åtgärder när du klickar «Räkna om prioritet»."
        >
          <PriorityWeightsEditor
            data={weightsQ.data}
            onSaved={() => saved("Prioriteringsvikter")}
            onError={failed}
          />
        </Section>

        {/* 2. Combined risk */}
        <Section
          icon={Activity}
          title="Riskscore – viktning"
          body="Hur den kombinerade riskpoängen (0–100) byggs upp under Riskscore. Påverkar vilka hus som hamnar högt i listan."
        >
          <CombinedRiskEditor
            row={byKey.get("combined_risk_weights")}
            onSaved={() => saved("Riskscore-vikter")}
            onError={failed}
          />
        </Section>

        {/* 3. CRREM */}
        <Section
          icon={LineChart}
          title="Klimatrisk (CRREM)"
          body="Standardland och CRREM-version som används när prestanda och klimatriskår beräknas."
        >
          <CrremDefaultsEditor
            row={byKey.get("crrem_defaults")}
            onSaved={() => saved("CRREM-standard")}
            onError={failed}
          />
        </Section>

        {/* 4. Data quality */}
        <Section
          icon={Shield}
          title="Datakvalitet"
          body="När saknad energidata gör att ett år räknas som ofullständigt (röd datakvalitet). Styr också varningströskel."
        >
          <div className="space-y-4">
            <DefaultGapPolicyEditor
              row={byKey.get("default_data_gap_policy_id")}
              policies={gapQ.data ?? []}
              onSaved={() => saved("Standardpolicy för datakvalitet")}
              onError={failed}
            />
            {(gapQ.data ?? []).map((cfg) => (
              <DataGapRow
                key={cfg.id}
                cfg={cfg}
                onSaved={() => saved("Datakvalitetspolicy")}
                onError={failed}
              />
            ))}
            {!gapQ.isLoading && (gapQ.data?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">
                Inga datakvalitetspolicys finns i databasen ännu.
              </p>
            )}
          </div>
        </Section>

        {/* 5. Permissions & GDPR */}
        <Section
          icon={Lock}
          title="Behörigheter & personuppgifter"
          body="Vem får godkänna ofullständig data, om hyresgästnamn ska maskeras, och hur länge data sparas."
        >
          <div className="space-y-4">
            <OverrideRolesEditor
              row={byKey.get("override_enabled_per_role")}
              onSaved={() => saved("Behörighet för data-override")}
              onError={failed}
            />
            <TenantMaskingEditor
              row={byKey.get("tenant_masking_enabled")}
              onSaved={() => saved("Hyresgästmaskering")}
              onError={failed}
            />
            <RetentionEditor
              row={byKey.get("data_retention_years")}
              onSaved={() => saved("Datalagring")}
              onError={failed}
            />
          </div>
        </Section>

        {/* 6. Improvement detection */}
        <Section
          icon={Sparkles}
          title="Förslag om ny energideklaration"
          body="När systemet automatiskt föreslår att en ny deklaration kan behövas (under Åtgärder → Hitta deklarationsförslag)."
        >
          <ImprovementEditor
            row={byKey.get("improvement_detection")}
            onSaved={() => saved("Deklarationsförslag")}
            onError={failed}
          />
        </Section>

        {/* 7. Workflow */}
        <Section
          icon={Workflow}
          title="När åtgärd markeras klar"
          body="Vad som händer när du markerar en åtgärd som klar (tillämpning av modeled spar)."
        >
          <WorkflowEditor
            row={byKey.get("fas7_workflow")}
            onSaved={() => saved("Arbetsflöde")}
            onError={failed}
          />
        </Section>

        {/* Unknown / advanced */}
        {unknownRows.length > 0 && (
          <Section
            icon={Database}
            title="Övriga tekniska nycklar"
            body="Inställningar utan färdig formulärvy. Ändra bara om du vet vad nyckeln gör."
          >
            <div className="space-y-3">
              {unknownRows.map((row) => (
                <RawJsonEditor
                  key={row.id}
                  row={row as SysRow}
                  onSaved={() => saved(row.key)}
                  onError={failed}
                />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

/* ─── layout ─────────────────────────────────────────────── */

function Section({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>
      {children}
    </section>
  );
}

function FieldLabel({
  children,
  help,
}: {
  children: React.ReactNode;
  help?: string;
}) {
  return (
    <label className="flex items-center gap-1 text-sm text-muted-foreground">
      {children}
      {help && <HelpTip text={help} />}
    </label>
  );
}

function SaveBar({
  pending,
  onSave,
  label = "Spara",
}: {
  pending: boolean;
  onSave: () => void;
  label?: string;
}) {
  return (
    <div className="flex justify-end pt-1">
      <Button
        size="sm"
        className="gap-1.5"
        disabled={pending}
        onClick={onSave}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Save className="h-3.5 w-3.5" />
        )}
        {label}
      </Button>
    </div>
  );
}

function MissingConfig() {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
      Inställningen saknas i databasen. Kontakta teknisk support om den behövs.
    </p>
  );
}

/* ─── editors ────────────────────────────────────────────── */

function PriorityWeightsEditor({
  data,
  onSaved,
  onError,
}: {
  data: { meps: number; crrem: number; payback: number } | undefined;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const [meps, setMeps] = useState("");
  const [crrem, setCrrem] = useState("");
  const [payback, setPayback] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!data) return;
    setMeps(String(data.meps));
    setCrrem(String(data.crrem));
    setPayback(String(data.payback));
  }, [data]);

  async function save() {
    setPending(true);
    try {
      const res = await savePriorityWeights({
        meps: Number(meps),
        crrem: Number(crrem),
        payback: Number(payback),
      });
      if (!res.success) throw new Error(res.error);
      onSaved();
    } catch (e) {
      onError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <FieldLabel help="Högre = prioritera hus med stort gap mot lagkrav 2030">
            Kravgap (MEPS)
          </FieldLabel>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={meps}
            onChange={(e) => setMeps(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel help="Högre = prioritera hus med tidigt klimatriskår">
            Klimatrisk (CRREM)
          </FieldLabel>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={crrem}
            onChange={(e) => setCrrem(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel help="Högre = prioritera åtgärder med snabb återbetalning">
            Payback
          </FieldLabel>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={payback}
            onChange={(e) => setPayback(e.target.value)}
            className="h-9"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Tips: 0,4 + 0,35 + 0,25 = 1,0 (100 %). Om summan inte är 1 justeras det
        automatiskt.
      </p>
      <SaveBar pending={pending} onSave={() => void save()} />
    </div>
  );
}

function CombinedRiskEditor({
  row,
  onSaved,
  onError,
}: {
  row?: SysRow;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const v = asObj(row?.value);
  const [meps, setMeps] = useState(String(num(v.meps, 0.4)));
  const [crrem, setCrrem] = useState(String(num(v.crrem, 0.35)));
  const [physical, setPhysical] = useState(String(num(v.physical, 0.15)));
  const [dataQuality, setDataQuality] = useState(
    String(num(v.data_quality, 0.1))
  );
  const [finYear, setFinYear] = useState(
    String(num(v.financial_risk_year, 2035))
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!row) return;
    const o = asObj(row.value);
    setMeps(String(num(o.meps, 0.4)));
    setCrrem(String(num(o.crrem, 0.35)));
    setPhysical(String(num(o.physical, 0.15)));
    setDataQuality(String(num(o.data_quality, 0.1)));
    setFinYear(String(num(o.financial_risk_year, 2035)));
  }, [row]);

  if (!row) return <MissingConfig />;

  async function save() {
    setPending(true);
    try {
      const res = await updateSystemConfigValue({
        key: "combined_risk_weights",
        value: {
          meps: Number(meps),
          crrem: Number(crrem),
          physical: Number(physical),
          data_quality: Number(dataQuality),
          financial_risk_year: Number(finYear),
        },
      });
      if (!res.success) throw new Error(res.error);
      onSaved();
    } catch (e) {
      onError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <FieldLabel help="Andel av riskscore som kommer från lagkravsgap (MEPS)">
            Lagkrav 2030 (MEPS)
          </FieldLabel>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={meps}
            onChange={(e) => setMeps(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel help="Andel från CRREM-misalignment / klimatriskår">
            Klimatrisk (CRREM)
          </FieldLabel>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={crrem}
            onChange={(e) => setCrrem(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel help="Andel från registrerade fysiska klimatrisker">
            Fysisk klimatrisk
          </FieldLabel>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={physical}
            onChange={(e) => setPhysical(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel help="Andel från ofullständig eller osäker energidata">
            Datakvalitet
          </FieldLabel>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={dataQuality}
            onChange={(e) => setDataQuality(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <FieldLabel help="Om klimatriskår (misalignment) är före detta år flaggas huset som finansiell risk (CSRD/ESRS E1)">
            Finansiell risk om riskår före
          </FieldLabel>
          <Input
            type="number"
            min={2020}
            max={2100}
            value={finYear}
            onChange={(e) => setFinYear(e.target.value)}
            className="h-9 max-w-[12rem]"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Standard: 40 % MEPS · 35 % CRREM · 15 % fysisk · 10 % data. Summan bör
        vara 1,0.
      </p>
      <SaveBar pending={pending} onSave={() => void save()} />
    </div>
  );
}

function CrremDefaultsEditor({
  row,
  onSaved,
  onError,
}: {
  row?: SysRow;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const v = asObj(row?.value);
  const [country, setCountry] = useState(str(v.country_code, "SE"));
  const [version, setVersion] = useState(
    str(v.default_crrem_version, "v2.0-1.5C")
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!row) return;
    const o = asObj(row.value);
    setCountry(str(o.country_code, "SE"));
    setVersion(str(o.default_crrem_version, "v2.0-1.5C"));
  }, [row]);

  if (!row) return <MissingConfig />;

  async function save() {
    setPending(true);
    try {
      const res = await updateSystemConfigValue({
        key: "crrem_defaults",
        value: {
          country_code: country.trim().toUpperCase(),
          default_crrem_version: version.trim(),
        },
      });
      if (!res.success) throw new Error(res.error);
      onSaved();
    } catch (e) {
      onError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <FieldLabel help="Landskod för CRREM-banor, t.ex. SE för Sverige">
            Land
          </FieldLabel>
          <Input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="h-9"
            placeholder="SE"
            maxLength={3}
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel help="Vilken CRREM-kurva som används för klimatriskår">
            CRREM-version
          </FieldLabel>
          <Select value={version} onValueChange={setVersion}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="v2.0-1.5C">v2.0 · 1,5 °C</SelectItem>
              <SelectItem value="v2.0-2C">v2.0 · 2 °C</SelectItem>
              <SelectItem value="v1.0-1.5C">v1.0 · 1,5 °C</SelectItem>
              <SelectItem value="v1.0-2C">v1.0 · 2 °C</SelectItem>
            </SelectContent>
          </Select>
          {!["v2.0-1.5C", "v2.0-2C", "v1.0-1.5C", "v1.0-2C"].includes(
            version
          ) && (
            <Input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="mt-2 h-9 font-mono text-xs"
              placeholder="Egen version"
            />
          )}
        </div>
      </div>
      <SaveBar pending={pending} onSave={() => void save()} />
    </div>
  );
}

function DefaultGapPolicyEditor({
  row,
  policies,
  onSaved,
  onError,
}: {
  row?: SysRow;
  policies: Array<{ id: string; name: string; is_default: boolean }>;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const current =
    typeof row?.value === "string"
      ? row.value
      : row?.value != null
        ? String(row.value)
        : "";
  const [policyId, setPolicyId] = useState(current);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (row?.value != null) setPolicyId(String(row.value));
  }, [row]);

  if (!row) return null;

  async function save() {
    setPending(true);
    try {
      const res = await updateSystemConfigValue({
        key: "default_data_gap_policy_id",
        value: policyId,
      });
      if (!res.success) throw new Error(res.error);
      onSaved();
    } catch (e) {
      onError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <div className="mb-2 text-sm font-medium">Standardpolicy för nya beräkningar</div>
      <p className="mb-3 text-xs text-muted-foreground">
        Vilken datakvalitetsregel som gäller om ingen annan anges.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1 space-y-1.5">
          <FieldLabel>Policy</FieldLabel>
          <Select value={policyId} onValueChange={setPolicyId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Välj policy" />
            </SelectTrigger>
            <SelectContent>
              {policies.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.is_default ? " (standard i listan)" : ""}
                </SelectItem>
              ))}
              {policies.length === 0 && policyId && (
                <SelectItem value={policyId}>Nuvarande policy</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-9"
          disabled={pending || !policyId}
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
  onError: (e: unknown) => void;
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
      onError(e);
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
          <FieldLabel help="Om fler månader saknas än detta markeras året som ofullständigt (rött)">
            Max saknade månader
          </FieldLabel>
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
          <FieldLabel help="Från denna nivå visas gul varning (uppskattad data)">
            Varning från (månader)
          </FieldLabel>
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
        Fyllnad av saknade månader:{" "}
        <span className="font-medium">
          {METHOD_SV[cfg.interpolation_method] ?? cfg.interpolation_method}
        </span>
        {cfg.notes ? ` · ${cfg.notes}` : ""}
      </p>
    </div>
  );
}

const METHOD_SV: Record<string, string> = {
  linear: "Linjär interpolering",
  average: "Medelvärde",
  none: "Ingen fyllnad",
  seasonal: "Säsongsjusterad",
};

function OverrideRolesEditor({
  row,
  onSaved,
  onError,
}: {
  row?: SysRow;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const initial = isRoleMap(row?.value) ? { ...row!.value } : {};
  const [map, setMap] = useState<Record<string, boolean>>(initial);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (isRoleMap(row?.value)) setMap({ ...row!.value });
  }, [row]);

  if (!row) return <MissingConfig />;

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
      onError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <div className="mb-1 text-sm font-medium">
        Vem får godkänna ofullständig data?
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Krävs när ett år saknar för mycket energidata men någon ändå vill räkna
        MEPS/CRREM. Motivering loggas alltid.
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {ROLE_ORDER.map((r) => (
          <label
            key={r}
            className="flex items-center gap-2 text-sm text-foreground"
          >
            <Checkbox
              checked={map[r] === true}
              onCheckedChange={(v) =>
                setMap((m) => ({ ...m, [r]: v === true }))
              }
            />
            {ROLE_LABELS[r] ?? r}
          </label>
        ))}
      </div>
      <SaveBar pending={pending} onSave={() => void save()} />
    </div>
  );
}

function TenantMaskingEditor({
  row,
  onSaved,
  onError,
}: {
  row?: SysRow;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const [enabled, setEnabled] = useState(row?.value === true || row?.value === "true");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (row) setEnabled(row.value === true || row.value === "true");
  }, [row]);

  if (!row) return <MissingConfig />;

  async function save() {
    setPending(true);
    try {
      const res = await updateSystemConfigValue({
        key: "tenant_masking_enabled",
        value: enabled,
      });
      if (!res.success) throw new Error(res.error);
      onSaved();
    } catch (e) {
      onError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <div className="mb-1 text-sm font-medium">Skydda hyresgästnamn (GDPR)</div>
      <p className="mb-3 text-xs text-muted-foreground">
        När detta är på visas hyresgäster som maskerade i listor. Riktiga namn
        kräver motivering och loggas.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={enabled}
          onCheckedChange={(v) => setEnabled(v === true)}
        />
        Maskera hyresgästnamn
      </label>
      <SaveBar pending={pending} onSave={() => void save()} />
    </div>
  );
}

function RetentionEditor({
  row,
  onSaved,
  onError,
}: {
  row?: SysRow;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const v = asObj(row?.value);
  const [energyYears, setEnergyYears] = useState(
    String(num(v.energy_consumption, 7))
  );
  const [perfYears, setPerfYears] = useState(
    String(num(v.performance_indicators, 10))
  );
  const [minimalPii, setMinimalPii] = useState(
    v.tenant_pii_minimal !== false
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!row) return;
    const o = asObj(row.value);
    setEnergyYears(String(num(o.energy_consumption, 7)));
    setPerfYears(String(num(o.performance_indicators, 10)));
    setMinimalPii(o.tenant_pii_minimal !== false);
  }, [row]);

  if (!row) return <MissingConfig />;

  async function save() {
    setPending(true);
    try {
      const res = await updateSystemConfigValue({
        key: "data_retention_years",
        value: {
          energy_consumption: Number(energyYears),
          performance_indicators: Number(perfYears),
          tenant_pii_minimal: minimalPii,
        },
      });
      if (!res.success) throw new Error(res.error);
      onSaved();
    } catch (e) {
      onError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <div className="mb-1 text-sm font-medium">Hur länge sparas data?</div>
      <p className="mb-3 text-xs text-muted-foreground">
        Riktlinjer för lagring (GDPR). Automatisk rensning kan kopplas på
        senare.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <FieldLabel help="Månadsförbrukning (kWh) – hur många år tillbaka">
            Energiförbrukning (år)
          </FieldLabel>
          <Input
            type="number"
            min={1}
            max={50}
            value={energyYears}
            onChange={(e) => setEnergyYears(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel help="Beräknade nyckeltal (prestanda, riskscore)">
            Prestanda & risk (år)
          </FieldLabel>
          <Input
            type="number"
            min={1}
            max={50}
            value={perfYears}
            onChange={(e) => setPerfYears(e.target.value)}
            className="h-9"
          />
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <Checkbox
          checked={minimalPii}
          onCheckedChange={(v) => setMinimalPii(v === true)}
        />
        Minimera personuppgifter om hyresgäster
      </label>
      <SaveBar pending={pending} onSave={() => void save()} />
    </div>
  );
}

function ImprovementEditor({
  row,
  onSaved,
  onError,
}: {
  row?: SysRow;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const v = asObj(row?.value);
  const [minYears, setMinYears] = useState(String(num(v.min_years, 3)));
  const [minPct, setMinPct] = useState(String(num(v.min_improvement_pct, 10)));
  const [minIntensity, setMinIntensity] = useState(
    String(num(v.min_primary_energy_intensity, 170))
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!row) return;
    const o = asObj(row.value);
    setMinYears(String(num(o.min_years, 3)));
    setMinPct(String(num(o.min_improvement_pct, 10)));
    setMinIntensity(String(num(o.min_primary_energy_intensity, 170)));
  }, [row]);

  if (!row) return <MissingConfig />;

  async function save() {
    setPending(true);
    try {
      const res = await updateSystemConfigValue({
        key: "improvement_detection",
        value: {
          min_years: Number(minYears),
          min_improvement_pct: Number(minPct),
          min_primary_energy_intensity: Number(minIntensity),
        },
      });
      if (!res.success) throw new Error(res.error);
      onSaved();
    } catch (e) {
      onError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <FieldLabel help="Minst så många år med data innan förslag skapas">
            Minst antal år
          </FieldLabel>
          <Input
            type="number"
            min={1}
            max={20}
            value={minYears}
            onChange={(e) => setMinYears(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel help="Minst så stor förbättring i % jämfört med tidigare">
            Minsta förbättring (%)
          </FieldLabel>
          <Input
            type="number"
            min={0}
            max={100}
            value={minPct}
            onChange={(e) => setMinPct(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel help="Endast hus med högre energiintensitet än detta (kWh/m²)">
            Min. intensitet (kWh/m²)
          </FieldLabel>
          <Input
            type="number"
            min={0}
            value={minIntensity}
            onChange={(e) => setMinIntensity(e.target.value)}
            className="h-9"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Exempel: minst 3 år data, minst 10 % förbättring, och hus över 170
        kWh/m².
      </p>
      <SaveBar pending={pending} onSave={() => void save()} />
    </div>
  );
}

function WorkflowEditor({
  row,
  onSaved,
  onError,
}: {
  row?: SysRow;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const v = asObj(row?.value);
  const [method, setMethod] = useState(
    str(v.adjustment_method, "modeled_saving_v1")
  );
  const [applyOnCompleted, setApplyOnCompleted] = useState(
    v.apply_on_completed !== false
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!row) return;
    const o = asObj(row.value);
    setMethod(str(o.adjustment_method, "modeled_saving_v1"));
    setApplyOnCompleted(o.apply_on_completed !== false);
  }, [row]);

  if (!row) return <MissingConfig />;

  async function save() {
    setPending(true);
    try {
      const res = await updateSystemConfigValue({
        key: "fas7_workflow",
        value: {
          adjustment_method: method,
          apply_on_completed: applyOnCompleted,
        },
      });
      if (!res.success) throw new Error(res.error);
      onSaved();
    } catch (e) {
      onError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          className="mt-0.5"
          checked={applyOnCompleted}
          onCheckedChange={(v) => setApplyOnCompleted(v === true)}
        />
        <span>
          <span className="font-medium">
            Tillämpa spar automatiskt när åtgärd markeras klar
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Uppdaterar prestanda (MEPS/CRREM) med modeled spar. Stäng av om ni
            bara vill logga status utan att räkna om.
          </span>
        </span>
      </label>
      <div className="space-y-1.5">
        <FieldLabel help="Beräkningsmetod för hur spar räknas in i prestanda">
          Beräkningsmetod
        </FieldLabel>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="h-9 max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="modeled_saving_v1">
              Modeled spar (rekommenderad)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <SaveBar pending={pending} onSave={() => void save()} />
    </div>
  );
}

function RawJsonEditor({
  row,
  onSaved,
  onError,
}: {
  row: SysRow;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const [text, setText] = useState(JSON.stringify(row.value, null, 2));
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setText(JSON.stringify(row.value, null, 2));
  }, [row]);

  async function save() {
    setPending(true);
    try {
      const parsed = JSON.parse(text) as unknown;
      const res = await updateSystemConfigValue({
        key: row.key,
        value: parsed,
      });
      if (!res.success) throw new Error(res.error);
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e : new Error("Ogiltig JSON"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <code
          className={cn(
            "rounded-md bg-secondary px-2 py-0.5 text-xs font-medium"
          )}
        >
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
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-[80px] w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs"
        spellCheck={false}
      />
    </div>
  );
}

/* ─── helpers ────────────────────────────────────────────── */

function asObj(v: unknown): Record<string, unknown> {
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

function num(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return fallback;
}

function str(v: unknown, fallback: string): string {
  if (typeof v === "string" && v.length > 0) return v;
  return fallback;
}

function isRoleMap(v: unknown): v is Record<string, boolean> {
  return (
    typeof v === "object" &&
    v !== null &&
    ("admin" in v || "viewer" in v || "portfolio_manager" in v)
  );
}
