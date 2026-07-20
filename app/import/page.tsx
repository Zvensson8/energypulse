import { ImportView } from "@/components/import/import-view";

export const metadata = {
  title: "Importera data · EnergyPulse",
  description: "Importera månadsvis energiförbrukning från CSV eller Excel",
};

export default function ImportPage() {
  return <ImportView />;
}
