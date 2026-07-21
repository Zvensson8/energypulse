import { AdminConfigView } from "@/components/admin/admin-config-view";

export const metadata = {
  title: "Admin · EnergyPulse",
  description: "Inställningar för risk, datakvalitet och behörigheter",
};

export default function AdminPage() {
  return <AdminConfigView />;
}
