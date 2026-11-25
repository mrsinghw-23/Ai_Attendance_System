import { z } from "zod";

export const processEngineSchema = z.object({
  limit: z.number().int().positive().max(5000).default(500),
  date: z.string().optional(),
  finalizeAbsent: z.boolean().default(true),
});

export type ProcessEngineInput = z.infer<typeof processEngineSchema>;
