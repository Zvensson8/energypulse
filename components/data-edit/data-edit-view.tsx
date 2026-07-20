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
    <div className="page-shell">
      <div className="page-inner max-w-4xl">
        <div>
          <div className="flex items-center gap-2">
            <Pencil className="h-6 w-6 text-primary" />
            <h1 className="page-title">Manuell dataredigering</h1>
            <HelpTip text="Endast admin och portföljförvaltare. All redigering kräver motivering, loggas och kan rullas tillbaka." />
          </div>
          <p className="page-subtitle flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-emerald-600" />
            Kontrollerad redigering av månadsdata och area-versioner
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

        <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm text-muted-foreground">Byggnad</label>
              <Select value={buildingId} onValueChange={setBuildingId}>
                <SelectTrigger>
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
              <label className="text-sm text-muted-foreground">År</label>
              <Select
                value={String(year)}
                onValueChange={(v) => setYear(Number(v))}
              >
                <SelectTrigger>
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
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">
              Motivering (gäller nästa sparning) *
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="t.ex. Korrigering efter leverantörsfaktura Q1"
              className="min-h-[72px]"
            />
          </div>
        </section>

        {buildingId && (
          <>
            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold">
                  Månadsförbrukning {year}
                </h2>
              </div>
              {consQ.isLoading && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Laddar förbrukning…
                </div>
              )}
              {consQ.error && (
                <div className="px-5 py-3 text-sm text-red-700">
                  {(consQ.error as Error).message}
                </div>
              )}
              {!consQ.isLoading && (
                <div className="max-h-64 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-secondary/80 text-xs font-medium text-muted-foreground backdrop-blur">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Mån</th>
                        <th className="px-4 py-2.5 text-left">Källa</th>
                        <th className="px-4 py-2.5 text-right">kWh</th>
                        <th className="px-4 py-2.5" />
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
                      {(consQ.data?.length ?? 0) === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-8 text-center text-muted-foreground"
                          >
                            Ingen månadsdata för valt år.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold">Area-versioner</h2>
              </div>
              {areasQ.isLoading && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Laddar area…
                </div>
              )}
              {areasQ.error && (
                <div className="px-5 py-3 text-sm text-red-700">
                  {(areasQ.error as Error).message}
                </div>
              )}
              {!areasQ.isLoading && (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/80 text-xs font-medium text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Giltig från</th>
                        <th className="px-4 py-2.5 text-right">Atemp</th>
                        <th className="px-4 py-2.5 text-left">Källa</th>
                        <th className="px-4 py-2.5" />
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
                      {(areasQ.data?.length ?? 0) === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-8 text-center text-muted-foreground"
                          >
                            Inga area-versioner.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {!buildingId && (
          <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
            <Pencil className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <h3 className="mt-3 text-lg font-semibold">Välj en byggnad</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Välj byggnad och år ovan för att redigera månadsförbrukning och
              area. Ange alltid en motivering innan du sparar.
            </p>
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">
              Senaste redigeringar / rollback
            </h2>
          </div>
          {sessionsQ.isLoading && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Laddar sessioner…
            </div>
          )}
          {!sessionsQ.isLoading && (
            <div className="max-h-56 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-secondary/80 text-xs font-medium text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Tid</th>
                    <th className="px-4 py-2.5 text-left">Typ</th>
                    <th className="px-4 py-2.5 text-left">Motivering</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {(sessionsQ.data ?? []).map((s) => (
                    <tr
                      key={s.id}
                      className="border-t border-border/60 hover:bg-secondary/40"
                    >
                      <td className="px-4 py-2 tabular text-muted-foreground">
                        {s.created_at?.slice(0, 16)?.replace("T", " ")}
                      </td>
                      <td className="px-4 py-2">{s.entity_type}</td>
                      <td className="max-w-[12rem] truncate px-4 py-2">
                        {s.reason}
                        {s.rolled_back_at && (
                          <span className="ml-1 text-amber-600">
                            (återställd)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {!s.rolled_back_at && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 gap-1"
                            disabled={rollback.isPending}
                            onClick={() => void rollback.mutateAsync(s.id)}
                          >
                            <Undo2 className="h-3.5 w-3.5" />
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
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        Inga sessioner ännu.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
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
    <tr className="border-t border-border/60 hover:bg-secondary/40">
      <td className="px-4 py-2 tabular">{row.month}</td>
      <td className="px-4 py-2">
        {row.energy_source_name ?? "—"}
        {row.is_estimated && (
          <span className="ml-1 text-xs text-amber-600">est.</span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        <Input
          type="number"
          min={0}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="ml-auto h-9 w-28 text-right"
        />
      </td>
      <td className="px-4 py-2 text-right">
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={busy}
          onClick={() => onSave(Number(val))}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Spara"}
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
    <tr className="border-t border-border/60 hover:bg-secondary/40">
      <td className="px-4 py-2 tabular">
        {row.valid_from}
        {row.valid_to ? ` → ${row.valid_to}` : " →"}
      </td>
      <td className="px-4 py-2 text-right">
        <Input
          type="number"
          min={1}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="ml-auto h-9 w-28 text-right"
        />
      </td>
      <td className="px-4 py-2 text-muted-foreground">{row.source ?? "—"}</td>
      <td className="px-4 py-2 text-right">
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={busy}
          onClick={() => onSave(Number(val))}
        >
          Spara
        </Button>
      </td>
    </tr>
  );
}
