"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProperty,
  updateProperty,
  listPortfolios,
} from "@/app/actions/properties-crud";
import { geocodeAddress } from "@/app/actions/geocode";
import { suggestClimateZone, CLIMATE_ZONE_HELP } from "@/lib/geo/climate-zones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpTip } from "@/components/ui/help-tip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Loader2,
  MapPinned,
  Map,
  Sparkles,
} from "lucide-react";

type FormState = {
  portfolio_id: string;
  name: string;
  external_id: string;
  address: string;
  municipality: string;
  climate_zone: string;
  latitude: string;
  longitude: string;
  ownership_type: "owned" | "leased" | "joint_venture" | "other";
  status: "active" | "disposed" | "under_development" | "inactive";
};

const empty: FormState = {
  portfolio_id: "",
  name: "",
  external_id: "",
  address: "",
  municipality: "",
  climate_zone: "",
  latitude: "",
  longitude: "",
  ownership_type: "owned",
  status: "active",
};

export function PropertyForm({
  mode,
  initial,
  propertyId,
}: {
  mode: "create" | "edit";
  propertyId?: string;
  initial?: Partial<FormState>;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>({ ...empty, ...initial });
  const [error, setError] = useState<string | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  const portfolios = useQuery({
    queryKey: ["portfolios"],
    queryFn: async () => {
      const res = await listPortfolios();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        portfolio_id: form.portfolio_id || undefined,
        name: form.name.trim(),
        external_id: form.external_id.trim() || null,
        address: form.address.trim() || null,
        municipality: form.municipality.trim() || null,
        climate_zone: form.climate_zone.trim() || null,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        ownership_type: form.ownership_type,
        status: form.status,
      };

      if (mode === "create") {
        const res = await createProperty(payload);
        if (!res.success) throw new Error(res.error);
        return res.data;
      }
      const res = await updateProperty({ id: propertyId!, ...payload });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["properties-list"] });
      router.push(`/properties/${data.id}`);
      router.refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const geoMut = useMutation({
    mutationFn: async () => {
      const q =
        form.address.trim() ||
        [form.name, form.municipality].filter(Boolean).join(", ");
      if (q.length < 3) {
        throw new Error("Ange minst adress eller ort först.");
      }
      const res = await geocodeAddress({ query: q });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (g) => {
      setForm((f) => ({
        ...f,
        latitude: String(g.latitude),
        longitude: String(g.longitude),
        municipality: g.municipality ?? f.municipality,
        climate_zone: g.climate_zone ?? f.climate_zone,
      }));
      const parts = [
        g.display_name,
        g.climate_zone
          ? `Klimatzon ${g.climate_zone} föreslagen från ${g.climate_zone_source ?? "plats"}`
          : null,
        "SMHI hämtas automatiskt när du sparar fastigheten (kräver koordinater).",
      ].filter(Boolean);
      setGeoMsg(parts.join(" · "));
      setError(null);
    },
    onError: (e: Error) => {
      setGeoMsg(null);
      setError(e.message);
    },
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Föreslå klimatzon när kommun ändras – skriv inte över manuell zon
      if (key === "municipality" && typeof value === "string" && !f.climate_zone) {
        const sug = suggestClimateZone({ municipality: value });
        if (sug.zone) next.climate_zone = sug.zone;
      }
      return next;
    });
  }

  function applyZoneFromMunicipality() {
    const sug = suggestClimateZone({ municipality: form.municipality });
    if (sug.zone) {
      set("climate_zone", sug.zone);
      setGeoMsg(
        `Klimatzon ${sug.zone} satt från kommun «${form.municipality}». ${CLIMATE_ZONE_HELP[sug.zone]}`
      );
    } else {
      setError(
        "Kunde inte matcha kommun till klimatzon. Välj zon manuellt (I–IV)."
      );
    }
  }

  const zoneHint = form.climate_zone
    ? CLIMATE_ZONE_HELP[
        form.climate_zone as keyof typeof CLIMATE_ZONE_HELP
      ]
    : null;

  return (
    <div className="page-shell">
      <div className="page-inner max-w-3xl">
        <Link
          href={propertyId ? `/properties/${propertyId}` : "/properties"}
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          {propertyId ? "Tillbaka till fastighet" : "Fastigheter"}
        </Link>

        <div className="mb-6 flex items-center gap-2">
          <MapPinned className="h-6 w-6 text-primary" />
          <div>
            <h1 className="page-title">
              {mode === "create" ? "Ny fastighet" : "Redigera fastighet"}
            </h1>
            <p className="page-subtitle">
              Fyll i adress – hämta automatiskt lat/long, kommun och klimatzon.
              Byggnader läggs till i nästa steg.
            </p>
          </div>
        </div>

        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            mutation.mutate();
          }}
        >
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="text-sm font-semibold">Grunduppgifter</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Namn *" className="sm:col-span-2">
                <Input
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="t.ex. Klaraberg Kontor"
                />
              </Field>

              <Field label="Fastighetsbeteckning">
                <Input
                  value={form.external_id}
                  onChange={(e) => set("external_id", e.target.value)}
                  placeholder="t.ex. STOCKHOLM 1:12"
                />
              </Field>

              <Field label="Portfölj">
                <Select
                  value={form.portfolio_id || "auto"}
                  onValueChange={(v) =>
                    set("portfolio_id", v === "auto" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Auto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Standardportfölj</SelectItem>
                    {(portfolios.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label="Adress"
                className="sm:col-span-2"
                hint="Gata, postnummer och ort räcker – klicka «Hämta från adress»."
              >
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    className="flex-1"
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                    placeholder="t.ex. Klarabergsgatan 12, 111 21 Stockholm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    disabled={geoMut.isPending}
                    onClick={() => void geoMut.mutateAsync()}
                  >
                    {geoMut.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Hämtar…
                      </>
                    ) : (
                      <>
                        <Map className="h-4 w-4" /> Hämta från adress
                      </>
                    )}
                  </Button>
                </div>
              </Field>

              <Field
                label="Kommun"
                hint="Fylls ofta i automatiskt. Används till klimatzon och graddagar."
              >
                <div className="flex gap-2">
                  <Input
                    value={form.municipality}
                    onChange={(e) => set("municipality", e.target.value)}
                    onBlur={() => {
                      if (form.municipality && !form.climate_zone) {
                        const sug = suggestClimateZone({
                          municipality: form.municipality,
                        });
                        if (sug.zone) set("climate_zone", sug.zone);
                      }
                    }}
                    placeholder="Stockholm"
                  />
                </div>
              </Field>

              <Field
                label={
                  <span className="inline-flex items-center gap-1">
                    Klimatzon (Boverket)
                    <HelpTip text="Boverkets klimatzoner I–IV styr energiberäkning. Zon I är kallast (norr), zon IV mildast (söder). Föreslås från kommun/adress – du kan ändra." />
                  </span>
                }
              >
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Select
                      value={form.climate_zone || "none"}
                      onValueChange={(v) =>
                        set("climate_zone", v === "none" ? "" : v)
                      }
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {(
                          [
                            ["I", "I – Norrland (kallast)"],
                            ["II", "II – Södra Norrland / norra Svealand"],
                            ["III", "III – Mellansverige"],
                            ["IV", "IV – Södra Sverige (mildast)"],
                          ] as const
                        ).map(([z, label]) => (
                          <SelectItem key={z} value={z}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={!form.municipality.trim()}
                      title="Matcha zon från kommunnamn"
                      onClick={applyZoneFromMunicipality}
                    >
                      <Sparkles className="h-4 w-4" />
                      Från kommun
                    </Button>
                  </div>
                  {zoneHint && (
                    <p className="text-xs text-muted-foreground">{zoneHint}</p>
                  )}
                </div>
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Plats & status</h2>
              <p className="text-xs text-muted-foreground">
                Lat/long fylls i med «Hämta från adress» (OpenStreetMap).
              </p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Latitud">
                <Input
                  value={form.latitude}
                  onChange={(e) => set("latitude", e.target.value)}
                  placeholder="59.33"
                  inputMode="decimal"
                />
              </Field>
              <Field label="Longitud">
                <Input
                  value={form.longitude}
                  onChange={(e) => set("longitude", e.target.value)}
                  placeholder="18.06"
                  inputMode="decimal"
                />
              </Field>

              <Field label="Ägande">
                <Select
                  value={form.ownership_type}
                  onValueChange={(v) =>
                    set("ownership_type", v as FormState["ownership_type"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owned">Ägd</SelectItem>
                    <SelectItem value="leased">Hyrd</SelectItem>
                    <SelectItem value="joint_venture">JV</SelectItem>
                    <SelectItem value="other">Övrigt</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Status">
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    set("status", v as FormState["status"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Aktiv</SelectItem>
                    <SelectItem value="under_development">
                      Under utveckling
                    </SelectItem>
                    <SelectItem value="inactive">Inaktiv</SelectItem>
                    <SelectItem value="disposed">Avyttrad</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>

          {geoMsg && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {geoMsg}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Avbryt
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Sparar…
                </>
              ) : (
                "Spara fastighet"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
  hint,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
