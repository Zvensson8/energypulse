/**
 * Feature flags for external integrations.
 * Defaults: all off (safe for production until configured).
 */

function flag(name: string, defaultValue = false): boolean {
  const v = process.env[name];
  if (v == null || v === "") return defaultValue;
  return v === "1" || v.toLowerCase() === "true" || v === "yes";
}

/**
 * SMHI Open Data requires no key – default ON unless explicitly disabled.
 * Boverket/GSI default OFF until configured.
 */
function smhiEnabled(): boolean {
  const v = process.env.EXTERNAL_DATA_SMHI_ENABLED;
  if (v == null || v === "") return true;
  return !(
    v === "0" ||
    v.toLowerCase() === "false" ||
    v.toLowerCase() === "no" ||
    v.toLowerCase() === "off"
  );
}

export function getExternalIntegrationConfig() {
  return {
    smhi: {
      enabled: smhiEnabled(),
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
