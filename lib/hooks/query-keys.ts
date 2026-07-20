export const queryKeys = {
  performanceIndicators: {
    all: ["performance_indicators"] as const,
    byBuilding: (buildingId: string) =>
      ["performance_indicators", "building", buildingId] as const,
    byBuildingYear: (buildingId: string, year: number) =>
      ["performance_indicators", "building", buildingId, year] as const,
    byDataGapStatus: (status: string) =>
      ["performance_indicators", "data_gap_status", status] as const,
  },
  actions: {
    all: ["actions"] as const,
    byBuilding: (buildingId: string) =>
      ["actions", "building", buildingId] as const,
  },
  spaces: {
    all: ["spaces_safe"] as const,
    byBuilding: (buildingId: string) =>
      ["spaces_safe", "building", buildingId] as const,
    byId: (spaceId: string) => ["spaces_safe", spaceId] as const,
  },
  dataGap: {
    config: ["data_gap_config"] as const,
    statusSummary: ["data_gap_status_summary"] as const,
  },
};
