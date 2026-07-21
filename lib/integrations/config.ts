/**
 * Feature flags for external integrations (open data, no contract keys).
 * Default ON unless explicitly disabled – all sources below are free/open.
 */

function flag(name: string, defaultValue = false): boolean {
  const v = process.env[name];
  if (v == null || v === "") return defaultValue;
  return v === "1" || v.toLowerCase() === "true" || v === "yes";
}

/** Default true; set EXTERNAL_DATA_*_ENABLED=false to disable. */
function openSourceEnabled(envName: string): boolean {
  const v = process.env[envName];
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
    boverket: {
      /** DVUT CSV + klimatzon – ingen API-nyckel */
      enabled: openSourceEnabled("EXTERNAL_DATA_BOVERKET_ENABLED"),
    },
    msb: {
      /** Översvämningskartering ArcGIS REST – ingen nyckel */
      enabled: openSourceEnabled("EXTERNAL_DATA_MSB_ENABLED"),
    },
    sgi: {
      /** Skred-aktsamhet via SGU WMS (SGI/SGU samordnat underlag) */
      enabled: openSourceEnabled("EXTERNAL_DATA_SGI_ENABLED"),
    },
  };
}

export function isAnyExternalSourceEnabled(): boolean {
  const c = getExternalIntegrationConfig();
  return c.boverket.enabled || c.msb.enabled || c.sgi.enabled;
}
