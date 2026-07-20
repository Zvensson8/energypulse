"use client";

/**
 * GDPR: all space reads go through spaces_safe (masked tenant_name).
 * Never select from public.spaces in client hooks.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "./query-keys";
import type { Views } from "@/lib/supabase/database.types";
import {
  decryptTenantName,
  createSpace,
} from "@/app/actions/spaces";

export type SpaceSafe = Views<"spaces_safe">;

export function useSpacesSafe(buildingId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.spaces.byBuilding(buildingId ?? ""),
    enabled: Boolean(buildingId),
    queryFn: async (): Promise<SpaceSafe[]> => {
      const supabase = getBrowserClient();
      const { data, error } = await supabase
        .from("spaces_safe")
        .select("*")
        .eq("building_id", buildingId!)
        .order("name", { ascending: true });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useSpaceSafe(spaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.spaces.byId(spaceId ?? ""),
    enabled: Boolean(spaceId),
    queryFn: async (): Promise<SpaceSafe | null> => {
      const supabase = getBrowserClient();
      const { data, error } = await supabase
        .from("spaces_safe")
        .select("*")
        .eq("id", spaceId!)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data;
    },
  });
}

/** Explicit reveal – server action audits DECRYPT. */
export function useDecryptTenantName() {
  return useMutation({
    mutationFn: async (input: { space_id: string; reason: string }) => {
      const result = await decryptTenantName(input);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useCreateSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: unknown) => {
      const result = await createSpace(input);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.spaces.byBuilding(data.building_id),
      });
    },
  });
}
