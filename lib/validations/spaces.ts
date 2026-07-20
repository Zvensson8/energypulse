import { z } from "zod";
import { spaceTypeSchema, uuidSchema } from "./enums";
import { nonNegativeNumber } from "./common";

/**
 * GDPR: Klienter får ENDAST se spaces via spaces_safe (maskerad tenant_name).
 * Aldrig returnera spaces.tenant_name_encrypted till UI.
 */
export const spaceSafeRowSchema = z.object({
  id: uuidSchema,
  building_id: uuidSchema,
  name: z.string().nullable(),
  space_type: spaceTypeSchema,
  tenant_name: z.string().nullable(), // alltid '***MASKERAD***' eller null
  has_tenant: z.boolean(),
  contract_start: z.string().nullable(),
  contract_end: z.string().nullable(),
  loa: z.number().finite().nullable(),
  boa: z.number().finite().nullable(),
  is_heated: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const decryptTenantRequestSchema = z.object({
  space_id: uuidSchema,
  reason: z
    .string()
    .trim()
    .min(5, "GDPR audit requires a reason of at least 5 characters")
    .max(500),
});

export const spaceInsertSchema = z.object({
  building_id: uuidSchema,
  name: z.string().nullable().optional(),
  space_type: spaceTypeSchema.optional().default("office"),
  /** Klartext – krypteras server-side via set_space_tenant_name / encrypt. */
  tenant_name: z.string().min(1).max(200).nullable().optional(),
  contract_start: z.string().nullable().optional(),
  contract_end: z.string().nullable().optional(),
  loa: nonNegativeNumber.nullable().optional(),
  boa: nonNegativeNumber.nullable().optional(),
  is_heated: z.boolean().optional().default(true),
});

export type SpaceSafeRow = z.infer<typeof spaceSafeRowSchema>;
export type DecryptTenantRequest = z.infer<typeof decryptTenantRequestSchema>;
