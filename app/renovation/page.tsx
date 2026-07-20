import { RenovationPlansView } from "@/components/renovation/renovation-plans-view";

export const metadata = {
  title: "Renovationsplaner · EnergyPulse",
  description: "Åtgärdsplaner mot MEPS och CRREM misalignment",
};

export default function RenovationPage() {
  return <RenovationPlansView />;
}
