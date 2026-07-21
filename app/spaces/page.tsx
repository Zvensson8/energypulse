import { redirect } from "next/navigation";

export const metadata = {
  title: "Lokaler · EnergyPulse",
  description: "Lokaler finns under respektive fastighet",
};

/** Lokaler nås via Fastigheter → [fastighet] → fliken Lokaler */
export default function SpacesPage() {
  redirect("/properties");
}
