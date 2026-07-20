import { DataEditView } from "@/components/data-edit/data-edit-view";

export const metadata = {
  title: "Dataredigering · EnergyPulse",
  description: "Kontrollerad manuell redigering med audit och rollback",
};

export default async function DataEditPage({
  searchParams,
}: {
  searchParams: Promise<{ building?: string; year?: string }>;
}) {
  const sp = await searchParams;
  const yearNum = sp.year ? Number(sp.year) : undefined;
  return (
    <DataEditView
      initialBuildingId={sp.building}
      initialYear={
        yearNum != null && Number.isFinite(yearNum) ? yearNum : undefined
      }
    />
  );
}
