import { RiskHubView } from "@/components/risk/risk-hub-view";

export const metadata = {
  title: "Risk · EnergyPulse",
  description: "Riskscore på fastighet och yttre risker",
};

export default async function RiskScoresPage({
  searchParams,
}: {
  searchParams: Promise<{ del?: string }>;
}) {
  const sp = await searchParams;
  return (
    <RiskHubView initialDel={sp.del === "ytter" ? "ytter" : "fastighet"} />
  );
}
