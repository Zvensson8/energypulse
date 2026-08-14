import { redirect } from "next/navigation";

export const metadata = {
  title: "Planerade åtgärder · EnergyPulse",
};

export default async function RenovationPage({
  searchParams,
}: {
  searchParams: Promise<{ building?: string }>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams({ del: "paket" });
  if (sp.building) q.set("building", sp.building);
  redirect(`/actions?${q.toString()}`);
}
