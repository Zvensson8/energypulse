import { redirect } from "next/navigation";

export const metadata = {
  title: "Risk · EnergyPulse",
};

export default function RisksPage() {
  redirect("/risk-scores?del=ytter");
}
