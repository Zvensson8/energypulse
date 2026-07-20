import { BuildingsTable } from "@/components/buildings/buildings-table";
import type { DataGapStatus } from "@/lib/supabase/database.types";

const GAP_VALUES = new Set<DataGapStatus>([
  "COMPLETE",
  "EXTRAPOLATED_WARNING",
  "INCOMPLETE_DATA",
]);

export default async function BuildingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    building?: string;
    search?: string;
    gap?: string;
  }>;
}) {
  const sp = await searchParams;
  const gap =
    sp.gap && GAP_VALUES.has(sp.gap as DataGapStatus)
      ? (sp.gap as DataGapStatus)
      : undefined;

  return (
    <BuildingsTable
      initialBuildingId={sp.building}
      initialSearch={sp.search}
      initialGap={gap}
    />
  );
}
