/**
 * Orchestrate external data refresh for a property.
 */

import type {
  ExternalRefreshReport,
  PropertyGeoContext,
} from "./types";
import { boverketProvider } from "./boverket";
import { msbProvider } from "./msb";
import { sgiProvider } from "./sgi";
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
  const [boverket, msb, sgi] = await Promise.all([
    boverketProvider.fetchNorms(ctx),
    msbProvider.fetchHazards(ctx),
    sgiProvider.fetchHazards(ctx),
  ]);

  return {
    propertyId: ctx.propertyId,
    boverket,
    msb,
    sgi,
  };
}

export function describeIntegrationStatus() {
  const c = getExternalIntegrationConfig();
  return [
    {
      id: "boverket" as const,
      label: "Boverket",
      purpose: "Klimatzon + DVUT (öppen data, utan avtal)",
      enabled: c.boverket.enabled,
    },
    {
      id: "msb" as const,
      label: "MSB",
      purpose: "Översvämning vattendrag/kust (öppen kartering)",
      enabled: c.msb.enabled,
    },
    {
      id: "sgi" as const,
      label: "SGI",
      purpose: "Skred-aktsamhet via SGU WMS (samordnat underlag)",
      enabled: c.sgi.enabled,
    },
  ];
}
