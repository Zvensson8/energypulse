import { PhysicalRisksView } from "@/components/risks/physical-risks-view";

export const metadata = {
  title: "Fysiska klimatrisker · EnergyPulse",
  description: "Fysiska klimatrisker per fastighet",
};

export default function RisksPage() {
  return <PhysicalRisksView />;
}
