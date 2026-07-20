import { BuildingScorecardView } from "@/components/buildings/building-scorecard";

export default async function BuildingScorecardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const yearNum = sp.year ? Number(sp.year) : undefined;

  return (
    <BuildingScorecardView
      buildingId={id}
      initialYear={
        yearNum != null && Number.isFinite(yearNum) ? yearNum : undefined
      }
    />
  );
}
