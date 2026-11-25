import { z } from "zod";

export const faceImageTypeSchema = z.enum([
  "FRONT",
  "LEFT",
  "RIGHT",
  "UP",
  "DOWN",
  "ADDITIONAL",
]);

export const uploadFaceImageSchema = z.object({
  image_type: faceImageTypeSchema,
  replace_image_id: z.number().int().positive().optional(),
});

export type UploadFaceImageInput = z.infer<typeof uploadFaceImageSchema>;
