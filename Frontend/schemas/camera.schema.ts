import { z } from "zod";



export const cameraStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);



export const cameraHealthSchema = z.enum([

  "ONLINE",

  "OFFLINE",

  "WARNING",

  "MAINTENANCE",

  "UNKNOWN",

]);



export const cameraRecordingSchema = z.enum([

  "RECORDING",

  "NOT_RECORDING",

]);



export const cameraEntryExitSchema = z.enum([

  "ENTRY",

  "EXIT",

  "BOTH",

  "NONE",

]);



const cameraConnectionFields = {

  camera_ip: z

    .string()

    .trim()

    .min(7, "Camera IP address is required")

    .max(100),

  http_port: z.number().int().min(1).max(65535).default(80),

  port: z.number().int().min(1).max(65535).default(554),

  rtsp_channel: z.number().int().min(1).max(32).default(1),

  rtsp_subtype: z.number().int().min(0).max(1).default(0),

  rtsp_username: z.string().trim().min(1, "RTSP username is required").max(150),

  rtsp_password: z.string().max(200).optional().or(z.literal("")),

  firmware: z.string().max(120).optional().or(z.literal("")),

  onvif_version: z.string().max(50).optional().or(z.literal("")),

  rtsp_direct_url: z.string().max(500).optional().or(z.literal("")),

};



export const createCameraSchema = z.object({

  camera_name: z.string().min(2, "Camera name is required").max(150),

  camera_code: z.string().max(50).optional().or(z.literal("")),

  brand: z.string().trim().min(1, "Brand is required").max(100),

  model: z.string().max(100).optional().or(z.literal("")),

  serial_number: z.string().max(100).optional().or(z.literal("")),

  ...cameraConnectionFields,

  rtsp_password: z

    .string()

    .max(200)

    .optional()

    .or(z.literal("")),

  location_id: z.number().int().positive().nullable().optional(),

  zone_id: z.number().int().positive().nullable().optional(),

  floor: z.string().max(50).optional().or(z.literal("")),

  entry_exit_type: cameraEntryExitSchema.default("NONE"),

  status: cameraStatusSchema.default("ACTIVE"),

  health_status: cameraHealthSchema.optional(),

  recording_status: cameraRecordingSchema.optional(),

  installation_date: z.string().optional().or(z.literal("")),

  warranty_date: z.string().optional().or(z.literal("")),

  motion_enabled: z.boolean().optional(),

  motion_sensitivity: z.number().int().min(1).max(100).optional(),

});



export const updateCameraSchema = createCameraSchema

  .partial()

  .extend({

    rtsp_password: z.string().max(200).optional().or(z.literal("")),

  });



export const probeCameraSchema = z.object({

  camera_ip: z.string().trim().min(7).max(100),

  http_port: z.number().int().min(1).max(65535).default(80),

  port: z.number().int().min(1).max(65535).default(554),

  rtsp_channel: z.number().int().min(1).max(32).default(1),

  rtsp_subtype: z.number().int().min(0).max(1).default(0),

  rtsp_username: z.string().trim().min(1).max(150),

  rtsp_password: z.string().max(200).optional().or(z.literal("")),

  brand: z.string().max(100).optional().or(z.literal("")),

  firmware: z.string().max(120).optional().or(z.literal("")),

  onvif_version: z.string().max(50).optional().or(z.literal("")),

  rtsp_direct_url: z.string().max(500).optional().or(z.literal("")),

});



export const createCameraZoneSchema = z.object({

  zone_name: z.string().min(2).max(150),

  location_id: z.number().int().positive().nullable().optional(),

  description: z.string().max(500).optional().or(z.literal("")),

  floor: z.string().max(50).optional().or(z.literal("")),

  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),

});



export const updateCameraZoneSchema = createCameraZoneSchema.partial();



export type CreateCameraInput = z.infer<typeof createCameraSchema>;

export type UpdateCameraInput = z.infer<typeof updateCameraSchema>;

export type ProbeCameraInput = z.infer<typeof probeCameraSchema>;

export type CreateCameraZoneInput = z.infer<typeof createCameraZoneSchema>;

export type UpdateCameraZoneInput = z.infer<typeof updateCameraZoneSchema>;

