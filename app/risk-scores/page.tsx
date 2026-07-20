import { RiskScoresView } from "@/components/risk/risk-scores-view";

export const metadata = {
  title: "Kombinerad risk · EnergyPulse",
  description: "EPBD/MEPS + CRREM + fysisk risk + datakvalitet (CSRD/ESRS E1)",
};

export default function RiskScoresPage() {
  return <RiskScoresView />;
}
