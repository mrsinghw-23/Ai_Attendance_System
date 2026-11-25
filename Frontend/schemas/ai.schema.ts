import { z } from "zod";

export const faceProfileSchema = z.object({
  employee_id: z.number().int().positive(),
  profile_status: z
    .enum(["PENDING", "READY", "FAILED"])
    .default("PENDING"),
  image_count: z.number().int().min(0).default(0),
  embedding_model: z.string().optional().or(z.literal("")),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const faceEventSchema = z.object({
  camera_id: z.number().int().positive().nullable().optional(),
  employee_id: z.number().int().positive().nullable().optional(),
  location_id: z.number().int().positive().nullable().optional(),
  event_time: z.string(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  event_type: z
    .enum(["FACE_DETECTED", "FACE_RECOGNIZED", "CHECK_IN", "CHECK_OUT"])
    .default("FACE_DETECTED"),
  image_ref: z.string().optional().or(z.literal("")),
  embedding_ref: z.string().optional().or(z.literal("")),
  metadata: z.record(z.string(), z.unknown()).default({}),
  create_attendance_log: z.boolean().default(false),
});

export type FaceProfileInput = z.infer<typeof faceProfileSchema>;
export type FaceEventInput = z.infer<typeof faceEventSchema>;
