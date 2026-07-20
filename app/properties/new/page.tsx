import { PropertyForm } from "@/components/properties/property-form";

export default function NewPropertyPage() {
  return (
    <div className="h-full overflow-auto p-1">
      <PropertyForm mode="create" />
    </div>
  );
}
