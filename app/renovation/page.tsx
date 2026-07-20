import { RenovationPlansView } from "@/components/renovation/renovation-plans-view";

export const metadata = {
  title: "Renovationsplaner · EnergyPulse",
  description: "Åtgärdsplaner mot MEPS och CRREM misalignment",
};

export default async function RenovationPage({
  searchParams,
}: {
  searchParams: Promise<{ building?: string }>;
}) {
  const sp = await searchParams;
  return <RenovationPlansView initialBuildingId={sp.building} />;
}
