import { z } from "zod";

export const attendanceEventSchema = z.object({
  employee_id: z.number().int().positive(),
  event_time: z.string().optional(),
  source: z
    .enum(["MANUAL", "CAMERA", "AI_FACE_RECOGNITION"])
    .default("MANUAL"),
  camera_id: z.number().int().positive().nullable().optional(),
});

export const attendanceFiltersSchema = z.object({
  search: z.string().optional(),
  status: z
    .enum(["PRESENT", "LATE", "EARLY_EXIT", "OVERTIME", "ABSENT"])
    .optional()
    .or(z.literal("")),
  from: z.string().optional(),
  to: z.string().optional(),
  location_id: z.coerce.number().int().positive().optional(),
  employee_id: z.coerce.number().int().positive().optional(),
});

export type AttendanceEventInput = z.infer<
  typeof attendanceEventSchema
>;

export type AttendanceFiltersInput = z.infer<
  typeof attendanceFiltersSchema
>;
