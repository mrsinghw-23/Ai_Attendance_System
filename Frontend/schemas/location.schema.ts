import { z } from "zod";

export const createLocationSchema = z.object({
  location_name: z
    .string()
    .min(2, "Location name is required")
    .max(150),
  city: z
    .string()
    .max(100)
    .optional()
    .or(z.literal("")),
  state: z
    .string()
    .max(100)
    .optional()
    .or(z.literal("")),
});

export const updateLocationSchema =
  createLocationSchema.partial();

export type CreateLocationInput = z.infer<
  typeof createLocationSchema
>;

export type UpdateLocationInput = z.infer<
  typeof updateLocationSchema
>;
