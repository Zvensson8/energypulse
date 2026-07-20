"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "./query-keys";
import type { Tables } from "@/lib/supabase/database.types";
import {
  createAction,
  updateAction,
} from "@/app/actions/actions-crud";

export type Action = Tables<"actions">;

export function useActions(buildingId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.actions.byBuilding(buildingId ?? ""),
    enabled: Boolean(buildingId),
    queryFn: async (): Promise<Action[]> => {
      const supabase = getBrowserClient();
      const { data, error } = await supabase
        .from("actions")
        .select("*")
        .eq("building_id", buildingId!)
        .order("priority_score", { ascending: false, nullsFirst: false });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useCreateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: unknown) => {
      const result = await createAction(input);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.actions.byBuilding(data.building_id),
      });
    },
  });
}

export function useUpdateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: unknown) => {
      const result = await updateAction(input);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.actions.byBuilding(data.building_id),
      });
    },
  });
}
