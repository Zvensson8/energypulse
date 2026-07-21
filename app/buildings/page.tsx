import { redirect } from "next/navigation";

export const metadata = {
  title: "Byggnader · EnergyPulse",
  description: "Byggnader finns under respektive fastighet",
};

/** Globala byggnadslistan borttagen – scorecard lever kvar på /buildings/[id] */
export default function BuildingsPage() {
  redirect("/properties");
}
