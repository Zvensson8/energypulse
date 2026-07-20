"use client";

import { useMutation } from "@tanstack/react-query";
import {
  previewEnergyConsumptionImport,
  commitEnergyConsumptionImport,
  retryIngestionDeadLetters,
  suggestImportColumnMapping,
} from "@/app/actions/ingestion";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export function useSuggestColumnMapping() {
  return useMutation({
    mutationFn: async (input: { fileBase64: string; fileName: string }) => {
      const result = await suggestImportColumnMapping(input);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
}

export function usePreviewEnergyImport() {
  return useMutation({
    mutationFn: async (input: unknown) => {
      const result = await previewEnergyConsumptionImport(input);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useCommitEnergyImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: unknown) => {
      const result = await commitEnergyConsumptionImport(input);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.performanceIndicators.all,
      });
      void qc.invalidateQueries({ queryKey: queryKeys.dataGap.statusSummary });
      void qc.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-heatmap"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-top"] });
      void qc.invalidateQueries({ queryKey: ["buildings-table"] });
      for (const p of data.performanceRecalculated) {
        void qc.invalidateQueries({
          queryKey: queryKeys.performanceIndicators.byBuilding(p.building_id),
        });
      }
    },
  });
}

export function useRetryDeadLetters() {
  return useMutation({
    mutationFn: async (input: unknown) => {
      const result = await retryIngestionDeadLetters(input);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
}
