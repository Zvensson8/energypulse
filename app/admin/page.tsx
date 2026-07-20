import { AdminConfigView } from "@/components/admin/admin-config-view";

export const metadata = {
  title: "Admin · EnergyPulse",
  description: "Systeminställningar och datakvalitetspolicy",
};

export default function AdminPage() {
  return <AdminConfigView />;
}
