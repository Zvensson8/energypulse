"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getProperty,
  createBuilding,
  deleteProperty,
  recalculateBuildingYears,
} from "@/app/actions/properties-crud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DataGapBadge } from "@/components/energy/data-gap-badge";
import { EnergyClassBadge } from "@/components/energy/energy-class-badge";
import {
  Pencil,
  Plus,
  RefreshCw,
  MapPin,
  Building2,
  AlertTriangle,
} from "lucide-react";
import type { DataGapStatus, EnergyClass } from "@/lib/supabase/database.types";
import { OWNERSHIP_SV, STATUS_SV } from "@/lib/labels";
import { formatNumber } from "@/lib/utils";

export function PropertyDetail({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  // qc used by child RecalcButton via invalidation on parent keys

  const { data, isLoading, error } = useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => {
      const res = await getProperty(propertyId);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const deactivate = useMutation({
    mutationFn: async () => {
      const res = await deleteProperty(propertyId);
      if (!res.success) throw new Error(res.error);
    },
    onSuccess: () => {
      router.push("/properties");
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 text-table text-muted-foreground">Laddar…</div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-4 text-table text-destructive">
        {(error as Error)?.message ?? "Fel"}
      </div>
    );
  }

  const p = data.property as {
    id: string;
    name: string;
    external_id: string | null;
    address: string | null;
    municipality: string | null;
    climate_zone: string | null;
    ownership_type: string;
    status: string;
    latitude: number | null;
    longitude: number | null;
    portfolios?: { name: string } | null;
  };

  const piByBuilding = new Map(
    (data.performance as Array<{ building_id: string }>).map((x) => [
      x.building_id,
      x,
    ])
  );

  return (
    <div className="flex h-full flex-col gap-1.5 overflow-auto p-2">
      {/* Header */}
      <div className="panel rounded-md px-3 py-3">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight">
                {p.name}
              </h1>
              <Badge
                variant={p.status === "active" ? "success" : "outline"}
              >
                {STATUS_SV[p.status] ?? p.status}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-terminal-muted">
              <span>Beteckning: {p.external_id ?? "—"}</span>
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="h-3 w-3" />
                {p.address ?? p.municipality ?? "—"}
              </span>
              <span>Kommun: {p.municipality ?? "—"}</span>
              <span>Klimatzon: {p.climate_zone ?? "—"}</span>
              <span>
                Ägande: {OWNERSHIP_SV[p.ownership_type] ?? p.ownership_type}
              </span>
              {p.portfolios?.name && (
                <span>Portfölj: {p.portfolios.name}</span>
              )}
            </div>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="terminal" className="h-8 gap-1" asChild>
              <Link href={`/properties/${propertyId}/edit`}>
                <Pencil className="h-3.5 w-3.5" /> Redigera
              </Link>
            </Button>
            <Button
              size="sm"
              variant="terminal"
              className="h-8 gap-1"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Lägg till byggnad
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-destructive"
              disabled={deactivate.isPending}
              onClick={() => {
                if (
                  confirm(
                    "Vill du inaktivera fastigheten? Den döljs från aktiva listor."
                  )
                )
                  deactivate.mutate();
              }}
            >
              Inaktivera
            </Button>
          </div>
        </div>
      </div>

      {/* Buildings */}
      <div className="panel min-h-0 flex-1 rounded-md">
        <div className="panel-header !normal-case !tracking-normal">
          <span>Byggnader ({data.buildings.length})</span>
          <span className="font-normal text-terminal-muted">
            Yta och prestanda (senaste år)
          </span>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-terminal-row text-2xs text-terminal-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Byggnad</th>
                <th className="px-3 py-2 text-right font-medium">Byggår</th>
                <th className="px-3 py-2 text-left font-medium">Användning</th>
                <th className="px-3 py-2 text-right font-medium">Atemp</th>
                <th className="px-3 py-2 text-center font-medium">Klass</th>
                <th className="px-3 py-2 text-right font-medium">kWh/m²</th>
                <th className="px-3 py-2 text-left font-medium">Datakvalitet</th>
                <th className="px-3 py-2 text-right font-medium">Gap 2030</th>
                <th className="px-3 py-2 text-right font-medium">Riskår</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(data.buildings as Array<{
                id: string;
                name: string;
                construction_year: number | null;
                primary_use: string | null;
                protected_status: boolean;
              }>).map((b) => {
                const pi = piByBuilding.get(b.id) as
                  | {
                      energy_intensity: number | null;
                      data_gap_status: string;
                      data_completeness_percent: number;
                      meps_2030_gap: number | null;
                      crrem_stranding_year: number | null;
                      energy_class: string | null;
                    }
                  | undefined;
                const area = (
                  data.areas as Array<{
                    building_id: string;
                    a_temp: number;
                    valid_to: string | null;
                  }>
                ).find((a) => a.building_id === b.id && a.valid_to == null)
                  ?? (data.areas as Array<{ building_id: string; a_temp: number }>).find(
                    (a) => a.building_id === b.id
                  );

                return (
                  <tr
                    key={b.id}
                    className="border-t border-terminal-border/50 hover:bg-terminal-row/50"
                  >
                    <td className="px-2 py-1">
                      <Link
                        href={`/buildings?building=${b.id}`}
                        className="inline-flex items-center gap-1 hover:text-terminal-accent"
                      >
                        <Building2 className="h-3 w-3" />
                        {b.name}
                        {b.protected_status && (
                          <span title="K-märkt" className="text-gap-extrapolated">
                            ★
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-2 py-1 text-right tabular">
                      {b.construction_year ?? "—"}
                    </td>
                    <td className="px-2 py-1 text-terminal-muted">
                      {b.primary_use ?? "—"}
                    </td>
                    <td className="px-2 py-1 text-right tabular">
                      {area ? formatNumber(Number(area.a_temp), 0) : "—"}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <EnergyClassBadge
                        value={pi?.energy_class as EnergyClass | null}
                      />
                    </td>
                    <td className="px-2 py-1 text-right tabular">
                      {formatNumber(pi?.energy_intensity, 1)}
                    </td>
                    <td className="px-2 py-1">
                      {pi ? (
                        <DataGapBadge
                          status={pi.data_gap_status as DataGapStatus}
                          completeness={pi.data_completeness_percent}
                        />
                      ) : (
                        <span className="text-2xs text-terminal-muted">
                          ej beräknad
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right tabular">
                      {formatNumber(pi?.meps_2030_gap, 1)}
                    </td>
                    <td className="px-2 py-1 text-right tabular text-gap-extrapolated">
                      {pi?.crrem_stranding_year ?? "—"}
                    </td>
                    <td className="px-2 py-1">
                      <RecalcButton buildingId={b.id} />
                    </td>
                  </tr>
                );
              })}
              {data.buildings.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-2 py-6 text-center text-muted-foreground"
                  >
                    Inga byggnader – lägg till en för att börja spåra energi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Physical risks */}
      <div className="panel rounded-md">
        <div className="panel-header !normal-case !tracking-normal">
          <span>Fysiska klimatrisker</span>
          <Link
            href="/risks"
            className="font-normal text-terminal-accent hover:underline"
          >
            Hantera alla →
          </Link>
        </div>
        <div className="flex flex-wrap gap-1.5 p-3">
          {(
            data.physical_risks as Array<{
              id: string;
              risk_type: string;
              probability: string;
              consequence: string;
              risk_score: number | null;
              notes: string | null;
            }>
          ).map((r) => (
            <div
              key={r.id}
              className="rounded-md border border-terminal-border bg-terminal-bg px-2.5 py-1.5 text-xs"
            >
              <AlertTriangle className="mr-1 inline h-3 w-3 text-gap-extrapolated" />
              {r.risk_type} · {r.probability}/{r.consequence} · poäng{" "}
              {formatNumber(r.risk_score, 0)}
              {r.notes ? ` – ${r.notes}` : ""}
            </div>
          ))}
          {(data.physical_risks as unknown[]).length === 0 && (
            <p className="text-xs text-terminal-muted">
              Inga risker registrerade.{" "}
              <Link href="/risks" className="text-terminal-accent hover:underline">
                Lägg till
              </Link>
            </p>
          )}
        </div>
      </div>

      <AddBuildingDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        propertyId={propertyId}
        onCreated={() => {
          void qc.invalidateQueries({ queryKey: ["property", propertyId] });
        }}
      />
    </div>
  );
}

function RecalcButton({ buildingId }: { buildingId: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async () => {
      const res = await recalculateBuildingYears(buildingId);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["property"] });
      void qc.invalidateQueries({ queryKey: ["buildings-table"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-kpis"] });
    },
  });
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      title="Beräkna prestanda"
      disabled={m.isPending}
      onClick={() => m.mutate()}
    >
      <RefreshCw
        className={`h-3 w-3 ${m.isPending ? "animate-spin" : ""}`}
      />
    </Button>
  );
}

function AddBuildingDialog({
  open,
  onOpenChange,
  propertyId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  propertyId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [use, setUse] = useState("office");
  const [atemp, setAtemp] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: async () => {
      const res = await createBuilding({
        property_id: propertyId,
        name: name.trim(),
        construction_year: year ? Number(year) : null,
        primary_use: use as "office",
        a_temp: atemp ? Number(atemp) : undefined,
        area_source: "manuell inmatning",
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      setName("");
      setYear("");
      setAtemp("");
      onOpenChange(false);
      onCreated();
    },
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <div className="border-b border-terminal-border px-3 py-2 pr-10">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">
              Lägg till byggnad
            </DialogTitle>
            <DialogDescription>
              Skapar byggnad och valfri Atemp-version
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-2 p-3">
          <div>
            <label className="text-2xs uppercase text-terminal-muted">
              Namn *
            </label>
            <Input
              className="h-7"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-2xs uppercase text-terminal-muted">
                Byggår
              </label>
              <Input
                className="h-7 font-mono"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>
            <div>
              <label className="text-2xs uppercase text-terminal-muted">
                Atemp (m²)
              </label>
              <Input
                className="h-7 font-mono"
                value={atemp}
                onChange={(e) => setAtemp(e.target.value)}
                placeholder="t.ex. 5000"
              />
            </div>
          </div>
          <div>
            <label className="text-2xs uppercase text-terminal-muted">
              Primär användning
            </label>
            <Select value={use} onValueChange={setUse}>
              <SelectTrigger className="h-7">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="office">Kontor</SelectItem>
                <SelectItem value="retail">Handel</SelectItem>
                <SelectItem value="warehouse">Lager</SelectItem>
                <SelectItem value="industrial">Industri</SelectItem>
                <SelectItem value="mixed">Blandat</SelectItem>
                <SelectItem value="other">Övrigt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {err && <div className="text-table text-destructive">{err}</div>}
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="terminal"
              onClick={() => onOpenChange(false)}
            >
              Avbryt
            </Button>
            <Button
              size="sm"
              disabled={!name.trim() || m.isPending}
              onClick={() => m.mutate()}
            >
              {m.isPending ? "Sparar…" : "Spara byggnad"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
