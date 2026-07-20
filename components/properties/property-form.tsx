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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, MapPinned } from "lucide-react";

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

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

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
              Fält markerade * krävs. Byggnader läggs till i nästa steg.
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

              <Field label="Adress" className="sm:col-span-2">
                <Input
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                />
              </Field>

              <Field label="Kommun">
                <Input
                  value={form.municipality}
                  onChange={(e) => set("municipality", e.target.value)}
                  placeholder="Stockholm"
                />
              </Field>

              <Field label="Klimatzon (Boverket)">
                <Select
                  value={form.climate_zone || "none"}
                  onValueChange={(v) =>
                    set("climate_zone", v === "none" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {["I", "II", "III", "IV"].map((z) => (
                      <SelectItem key={z} value={z}>
                        Zon {z}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="text-sm font-semibold">Plats & status</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Latitud">
                <Input
                  value={form.latitude}
                  onChange={(e) => set("latitude", e.target.value)}
                  placeholder="59.33"
                />
              </Field>
              <Field label="Longitud">
                <Input
                  value={form.longitude}
                  onChange={(e) => set("longitude", e.target.value)}
                  placeholder="18.06"
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

          {error && (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
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
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
