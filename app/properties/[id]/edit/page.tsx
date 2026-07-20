import { createClient } from "@/lib/supabase/server";
import { PropertyForm } from "@/components/properties/property-form";
import { redirect } from "next/navigation";

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!data) redirect("/properties");

  return (
    <div className="h-full overflow-auto p-1">
      <PropertyForm
        mode="edit"
        propertyId={id}
        initial={{
          portfolio_id: data.portfolio_id,
          name: data.name,
          external_id: data.external_id ?? "",
          address: data.address ?? "",
          municipality: data.municipality ?? "",
          climate_zone: data.climate_zone ?? "",
          latitude: data.latitude != null ? String(data.latitude) : "",
          longitude: data.longitude != null ? String(data.longitude) : "",
          ownership_type: data.ownership_type,
          status: data.status,
        }}
      />
    </div>
  );
}
