import { z } from "zod";

export const aiRecognitionSettingsSchema = z.object({
  confidenceThreshold: z.number().min(0.1).max(1).optional(),
  motionSensitivity: z.number().min(1).max(100).optional(),
  frameSamplingIntervalMs: z.number().int().min(100).max(10000).optional(),
  embeddingModel: z.string().optional(),
  embeddingSyncIntervalMinutes: z.number().int().min(5).max(1440).optional(),
  unknownFaceCooldownSeconds: z.number().int().min(10).max(600).optional(),
  recognitionCooldownSeconds: z.number().int().min(5).max(600).optional(),
  continuousScanning: z.boolean().optional(),
  storeUnknownFaces: z.boolean().optional(),
});
