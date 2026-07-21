/**
 * Feature flags for external integrations.
 * Defaults: all off (safe for production until configured).
 */

function flag(name: string, defaultValue = false): boolean {
  const v = process.env[name];
  if (v == null || v === "") return defaultValue;
  return v === "1" || v.toLowerCase() === "true" || v === "yes";
}

export function getExternalIntegrationConfig() {
  return {
    smhi: {
      enabled: flag("EXTERNAL_DATA_SMHI_ENABLED"),
      apiKey: process.env.SMHI_API_KEY ?? null,
    },
    boverket: {
      enabled: flag("EXTERNAL_DATA_BOVERKET_ENABLED"),
      apiKey: process.env.BOVERKET_API_KEY ?? null,
    },
    gsi: {
      enabled: flag("EXTERNAL_DATA_GSI_ENABLED"),
      apiUrl: process.env.GSI_API_URL ?? null,
      apiKey: process.env.GSI_API_KEY ?? null,
    },
  };
}

export function isAnyExternalSourceEnabled(): boolean {
  const c = getExternalIntegrationConfig();
  return c.smhi.enabled || c.boverket.enabled || c.gsi.enabled;
}
