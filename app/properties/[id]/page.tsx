import { Suspense } from "react";
import { PropertyDetail } from "@/components/properties/property-detail";

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <div className="page-shell">
          <div className="page-inner">
            <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Laddar fastighet…
            </div>
          </div>
        </div>
      }
    >
      <PropertyDetail propertyId={id} />
    </Suspense>
  );
}
