"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  editArea,
  editEnergyConsumption,
  listAreasForBuilding,
  listConsumptionForBuildingYear,
  listDataEditSessions,
  rollbackDataEdit,
} from "@/app/actions/data-edit";
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
import { HelpTip } from "@/components/ui/help-tip";
import { formatNumber } from "@/lib/utils";
import { Loader2, Pencil, Undo2, Shield } from "lucide-react";

export function DataEditView() {
  const qc = useQueryClient();
  const [buildingId, setBuildingId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const buildingsQ = useQuery({
    queryKey: ["buildings-for-data-edit"],
    queryFn: async () => {
      const { getBrowserClient } = await import("@/lib/supabase/client");
      const sb = getBrowserClient();
      const { data, error } = await sb
        .from("buildings")
        .select("id, name, properties(name)")
        .order("name")
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const consQ = useQuery({
    queryKey: ["edit-consumption", buildingId, year],
    enabled: Boolean(buildingId),
    queryFn: async () => {
      const res = await listConsumptionForBuildingYear({
        building_id: buildingId,
        year,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const areasQ = useQuery({
    queryKey: ["edit-areas", buildingId],
    enabled: Boolean(buildingId),
    queryFn: async () => {
      const res = await listAreasForBuilding(buildingId);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const sessionsQ = useQuery({
    queryKey: ["edit-sessions"],
    queryFn: async () => {
      const res = await listDataEditSessions(30);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const editCons = useMutation({
    mutationFn: async (input: {
      id: string;
      kwh: number;
    }) => {
      if (reason.trim().length < 5) {
        throw new Error("Motivering krävs (minst 5 tecken)");
      }
      const res = await editEnergyConsumption({
        consumption_id: input.id,
        consumption_kwh: input.kwh,
        reason: reason.trim(),
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      setMsg("Förbrukning uppdaterad – prestanda omräknad.");
      setErr(null);
      void qc.invalidateQueries({ queryKey: ["edit-consumption"] });
      void qc.invalidateQueries({ queryKey: ["edit-sessions"] });
      void qc.invalidateQueries({ queryKey: ["buildings-table"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const editAreaMut = useMutation({
    mutationFn: async (input: { id: string; a_temp: number }) => {
      if (reason.trim().length < 5) {
        throw new Error("Motivering krävs (minst 5 tecken)");
      }
      const res = await editArea({
        area_id: input.id,
        a_temp: input.a_temp,
        reason: reason.trim(),
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      setMsg("Area uppdaterad – prestanda omräknad.");
      setErr(null);
      void qc.invalidateQueries({ queryKey: ["edit-areas"] });
      void qc.invalidateQueries({ queryKey: ["edit-sessions"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const rollback = useMutation({
    mutationFn: async (sessionId: string) => {
      const r =
        window.prompt("Motivering för rollback (minst 5 tecken):") ?? "";
      if (r.trim().length < 5) throw new Error("Motivering krävs");
      const res = await rollbackDataEdit({
        session_id: sessionId,
        reason: r.trim(),
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      setMsg("Rollback genomförd.");
      void qc.invalidateQueries({ queryKey: ["edit-sessions"] });
      void qc.invalidateQueries({ queryKey: ["edit-consumption"] });
      void qc.invalidateQueries({ queryKey: ["edit-areas"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-4xl space-y-4 p-3 sm:p-5">
        <div>
          <div className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-terminal-accent" />
            <h1 className="text-lg font-semibold">Manuell dataredigering</h1>
            <HelpTip text="Endast admin och portföljförvaltare. All redigering kräver motivering, loggas och kan rullas tillbaka." />
          </div>
          <p className="mt-1 flex items-center gap-1 text-xs text-terminal-muted">
            <Shield className="h-3 w-3 text-terminal-green" />
            Kontrollerad redigering av månadsdata och area-versioner
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

        <section className="panel space-y-3 rounded-md p-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-terminal-muted">Byggnad</label>
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
              <label className="text-xs text-terminal-muted">År</label>
              <Select
                value={String(year)}
                onValueChange={(v) => setYear(Number(v))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4].map((o) => {
                    const y = new Date().getFullYear() - 1 - o;
                    return (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-terminal-muted">
              Motivering (gäller nästa sparning) *
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="t.ex. Korrigering efter leverantörsfaktura Q1"
              className="min-h-[60px]"
            />
          </div>
        </section>

        {buildingId && (
          <>
            <section className="panel rounded-md">
              <div className="panel-header !normal-case">
                Månadsförbrukning {year}
              </div>
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-terminal-row text-2xs text-terminal-muted">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Mån</th>
                      <th className="px-2 py-1.5 text-left">Källa</th>
                      <th className="px-2 py-1.5 text-right">kWh</th>
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {(consQ.data ?? []).map((c) => (
                      <ConsRow
                        key={c.id}
                        row={c}
                        busy={editCons.isPending}
                        onSave={(kwh) =>
                          void editCons.mutateAsync({ id: c.id, kwh })
                        }
                      />
                    ))}
                    {!consQ.isLoading && (consQ.data?.length ?? 0) === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-2 py-6 text-center text-muted-foreground"
                        >
                          Ingen månadsdata för valt år.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel rounded-md">
              <div className="panel-header !normal-case">Area-versioner</div>
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-terminal-row text-2xs text-terminal-muted">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Giltig från</th>
                      <th className="px-2 py-1.5 text-right">Atemp</th>
                      <th className="px-2 py-1.5 text-left">Källa</th>
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {(areasQ.data ?? []).map((a) => (
                      <AreaRow
                        key={a.id}
                        row={a}
                        busy={editAreaMut.isPending}
                        onSave={(a_temp) =>
                          void editAreaMut.mutateAsync({ id: a.id, a_temp })
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        <section className="panel rounded-md">
          <div className="panel-header !normal-case">
            Senaste redigeringar / rollback
          </div>
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-terminal-row text-2xs text-terminal-muted">
                <tr>
                  <th className="px-2 py-1.5 text-left">Tid</th>
                  <th className="px-2 py-1.5 text-left">Typ</th>
                  <th className="px-2 py-1.5 text-left">Motivering</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {(sessionsQ.data ?? []).map((s) => (
                  <tr
                    key={s.id}
                    className="border-t border-terminal-border/40"
                  >
                    <td className="px-2 py-1 tabular text-terminal-muted">
                      {s.created_at?.slice(0, 16)?.replace("T", " ")}
                    </td>
                    <td className="px-2 py-1">{s.entity_type}</td>
                    <td className="max-w-[12rem] truncate px-2 py-1">
                      {s.reason}
                      {s.rolled_back_at && (
                        <span className="ml-1 text-gap-extrapolated">
                          (återställd)
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {!s.rolled_back_at && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 text-2xs"
                          disabled={rollback.isPending}
                          onClick={() => void rollback.mutateAsync(s.id)}
                        >
                          <Undo2 className="h-3 w-3" />
                          Rollback
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {(sessionsQ.data?.length ?? 0) === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-2 py-6 text-center text-muted-foreground"
                    >
                      Inga sessioner ännu.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function ConsRow({
  row,
  busy,
  onSave,
}: {
  row: {
    id: string;
    month: number;
    consumption_kwh: number;
    energy_source_name: string | null;
    is_estimated: boolean;
  };
  busy: boolean;
  onSave: (kwh: number) => void;
}) {
  const [val, setVal] = useState(String(row.consumption_kwh));
  return (
    <tr className="border-t border-terminal-border/40">
      <td className="px-2 py-1 tabular">{row.month}</td>
      <td className="px-2 py-1">
        {row.energy_source_name ?? "—"}
        {row.is_estimated && (
          <span className="ml-1 text-2xs text-gap-extrapolated">est.</span>
        )}
      </td>
      <td className="px-2 py-1 text-right">
        <Input
          type="number"
          min={0}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="ml-auto h-7 w-28 text-right"
        />
      </td>
      <td className="px-2 py-1 text-right">
        <Button
          size="sm"
          variant="terminal"
          className="h-7"
          disabled={busy}
          onClick={() => onSave(Number(val))}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Spara"}
        </Button>
      </td>
    </tr>
  );
}

function AreaRow({
  row,
  busy,
  onSave,
}: {
  row: {
    id: string;
    a_temp: number;
    valid_from: string;
    valid_to: string | null;
    source: string | null;
  };
  busy: boolean;
  onSave: (a: number) => void;
}) {
  const [val, setVal] = useState(String(row.a_temp));
  return (
    <tr className="border-t border-terminal-border/40">
      <td className="px-2 py-1 tabular">
        {row.valid_from}
        {row.valid_to ? ` → ${row.valid_to}` : " →"}
      </td>
      <td className="px-2 py-1 text-right">
        <Input
          type="number"
          min={1}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="ml-auto h-7 w-28 text-right"
        />
      </td>
      <td className="px-2 py-1 text-terminal-muted">{row.source ?? "—"}</td>
      <td className="px-2 py-1 text-right">
        <Button
          size="sm"
          variant="terminal"
          className="h-7"
          disabled={busy}
          onClick={() => onSave(Number(val))}
        >
          Spara
        </Button>
      </td>
    </tr>
  );
}
