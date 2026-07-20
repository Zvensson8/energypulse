import { CrremView } from "@/components/crrem/crrem-view";

export default async function CrremPage({
  searchParams,
}: {
  searchParams: Promise<{ building?: string; year?: string }>;
}) {
  const sp = await searchParams;
  return (
    <CrremView
      initialBuildingId={sp.building}
      initialYear={sp.year ? Number(sp.year) : undefined}
    />
  );
}
