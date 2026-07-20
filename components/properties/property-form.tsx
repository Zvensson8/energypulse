"use client";

import { useState } from "react";
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
    <form
      className="mx-auto max-w-2xl space-y-3 p-3 sm:p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        mutation.mutate();
      }}
    >
      <div className="panel rounded-md">
        <div className="panel-header !normal-case !tracking-normal">
          <span>
            {mode === "create" ? "Ny fastighet" : "Redigera fastighet"}
          </span>
          <span className="font-normal text-terminal-muted">
            Fält markerade * krävs
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4">
          <Field label="Namn *" className="col-span-2">
            <Input
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="t.ex. Klaraberg Kontor"
              className="h-9 text-sm"
            />
          </Field>

          <Field label="Fastighetsbeteckning">
            <Input
              value={form.external_id}
              onChange={(e) => set("external_id", e.target.value)}
              placeholder="t.ex. STOCKHOLM 1:12"
              className="h-7 font-mono"
            />
          </Field>

          <Field label="Portfölj">
            <Select
              value={form.portfolio_id || "auto"}
              onValueChange={(v) => set("portfolio_id", v === "auto" ? "" : v)}
            >
              <SelectTrigger className="h-7">
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

          <Field label="Adress" className="col-span-2">
            <Input
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              className="h-7"
            />
          </Field>

          <Field label="Kommun">
            <Input
              value={form.municipality}
              onChange={(e) => set("municipality", e.target.value)}
              placeholder="Stockholm"
              className="h-7"
            />
          </Field>

          <Field label="Klimatzon (Boverket)">
            <Select
              value={form.climate_zone || "none"}
              onValueChange={(v) =>
                set("climate_zone", v === "none" ? "" : v)
              }
            >
              <SelectTrigger className="h-7">
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

          <Field label="Latitud">
            <Input
              value={form.latitude}
              onChange={(e) => set("latitude", e.target.value)}
              placeholder="59.33"
              className="h-7 font-mono"
            />
          </Field>
          <Field label="Longitud">
            <Input
              value={form.longitude}
              onChange={(e) => set("longitude", e.target.value)}
              placeholder="18.06"
              className="h-7 font-mono"
            />
          </Field>

          <Field label="Ägande">
            <Select
              value={form.ownership_type}
              onValueChange={(v) =>
                set("ownership_type", v as FormState["ownership_type"])
              }
            >
              <SelectTrigger className="h-7">
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
              <SelectTrigger className="h-7">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktiv</SelectItem>
                <SelectItem value="under_development">Under utveckling</SelectItem>
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
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="terminal"
          onClick={() => router.back()}
        >
          Avbryt
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Sparar…" : "Spara fastighet"}
        </Button>
      </div>
    </form>
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
      <label className="mb-1 block text-xs font-medium text-terminal-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
