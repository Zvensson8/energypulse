import { PlannedActionsView } from "@/components/plan/planned-actions-view";

export const metadata = {
  title: "Planerade åtgärder · EnergyPulse",
  description: "Åtgärder och paket mot 2030",
};

export default async function ActionsPage({
  searchParams,
}: {
  searchParams: Promise<{ del?: string; building?: string }>;
}) {
  const sp = await searchParams;
  return (
    <PlannedActionsView
      initialDel={sp.del === "paket" ? "paket" : "atgarder"}
      initialBuildingId={sp.building}
    />
  );
}
