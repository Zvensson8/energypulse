/**
 * Orchestrate external data refresh for a property.
 */

import type {
  ExternalRefreshReport,
  PropertyGeoContext,
} from "./types";
import { smhiProvider } from "./smhi";
import { boverketProvider } from "./boverket";
import { gsiProvider } from "./gsi";
import { getExternalIntegrationConfig } from "./config";

export {
  getExternalIntegrationConfig,
  isAnyExternalSourceEnabled,
} from "./config";
export type * from "./types";

export async function fetchAllExternalForProperty(
  ctx: PropertyGeoContext
): Promise<
  Omit<ExternalRefreshReport, "appliedRiskIds" | "snapshotIds">
> {
  const [smhi, boverket, gsi] = await Promise.all([
    smhiProvider.fetchHazards(ctx),
    boverketProvider.fetchNorms(ctx),
    gsiProvider.fetchHazards(ctx),
  ]);

  return {
    propertyId: ctx.propertyId,
    smhi,
    boverket,
    gsi,
  };
}

export function describeIntegrationStatus() {
  const c = getExternalIntegrationConfig();
  return [
    {
      id: "smhi" as const,
      label: "SMHI",
      purpose: "Klimat/väder → värme, nederbörd, storm",
      enabled: c.smhi.enabled,
    },
    {
      id: "boverket" as const,
      label: "Boverket",
      purpose: "Klimatzon och energinorm-kontext",
      enabled: c.boverket.enabled,
    },
    {
      id: "gsi" as const,
      label: "GSI",
      purpose: "Mark/skred/sättning (geodata)",
      enabled: c.gsi.enabled,
    },
  ];
}
