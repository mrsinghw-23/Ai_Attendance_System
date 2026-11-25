import { z } from "zod";

export const employeeStatusSchema = z.enum([
  "ACTIVE",
  "INACTIVE",
  "ON_LEAVE",
]);

export const faceRegistrationStatusSchema = z.enum([
  "NOT_REGISTERED",
  "PENDING",
  "REGISTERED",
]);

export const createEmployeeSchema = z.object({
  employee_code: z
    .string()
    .min(2, "Employee code is required")
    .max(50),
  first_name: z
    .string()
    .min(1, "First name is required")
    .max(100),
  last_name: z
    .string()
    .min(1, "Last name is required")
    .max(100),
  email: z
    .union([
      z.string().email("Invalid email"),
      z.literal(""),
    ])
    .optional(),
  mobile: z
    .string()
    .max(20)
    .optional()
    .or(z.literal("")),
  designation: z
    .string()
    .max(100)
    .optional()
    .or(z.literal("")),
  department: z
    .string()
    .max(100)
    .optional()
    .or(z.literal("")),
  location_id: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),
  reporting_manager_id: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),
  status: employeeStatusSchema.default("ACTIVE"),
  joining_date: z
    .string()
    .optional()
    .or(z.literal("")),
  photo_url: z
    .union([
      z.string().url("Invalid photo URL"),
      z.literal(""),
    ])
    .optional(),
  face_registration_status:
    faceRegistrationStatusSchema.optional(),
});

export const updateEmployeeSchema =
  createEmployeeSchema.partial();

export type CreateEmployeeInput = z.infer<
  typeof createEmployeeSchema
>;

export type UpdateEmployeeInput = z.infer<
  typeof updateEmployeeSchema
>;
