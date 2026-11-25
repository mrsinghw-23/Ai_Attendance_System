import { z } from "zod";
import { validatePasswordStrength } from "@/utils/password";

export const userRoleSchema = z.enum([
  "SUPER_ADMIN",
  "HR",
  "MANAGER",
  "ATTENDANCE_ADMIN",
  "CAMERA_ADMIN",
  "EMPLOYEE",
  "VIEWER",
]);

export const userStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

const strongPasswordSchema = z
  .string()
  .min(8)
  .max(100)
  .refine((value) => !validatePasswordStrength(value), {
    message:
      "Password must include uppercase, lowercase, number, and special character",
  });

const userFieldsSchema = z.object({
  username: z.string().min(3).max(100),
  password: z.string().min(8).max(100),
  confirmPassword: z.string().optional(),
  full_name: z.string().max(200).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  mobile: z.string().max(30).optional().nullable(),
  department: z.string().max(120).optional().nullable(),
  role: userRoleSchema,
  status: userStatusSchema.default("ACTIVE"),
  employee_id: z.number().int().positive().nullable().optional(),
  location_id: z.number().int().positive().nullable().optional(),
  force_password_change: z.boolean().default(false),
});

export const createUserSchema = userFieldsSchema
  .superRefine((data, ctx) => {
    const passwordError = validatePasswordStrength(data.password);
    if (passwordError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: passwordError,
        path: ["password"],
      });
    }
    if (data.confirmPassword && data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match",
        path: ["confirmPassword"],
      });
    }
  });

export const updateUserSchema = userFieldsSchema
  .omit({ password: true, confirmPassword: true })
  .partial();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: strongPasswordSchema,
    confirmPassword: z.string().optional(),
  })
  .refine(
    (data) =>
      !data.confirmPassword || data.newPassword === data.confirmPassword,
    { message: "Passwords do not match", path: ["confirmPassword"] }
  );

export const resetPasswordSchema = z.object({
  newPassword: strongPasswordSchema.optional(),
  requireChange: z.boolean().default(true),
  generateTemporary: z.boolean().default(false),
});

export const forgotPasswordSchema = z.object({
  identifier: z.string().min(3).max(200),
});

export const resetPasswordTokenSchema = z
  .object({
    token: z.string().min(10),
    newPassword: strongPasswordSchema,
    confirmPassword: z.string().optional(),
  })
  .refine(
    (data) =>
      !data.confirmPassword || data.newPassword === data.confirmPassword,
    { message: "Passwords do not match", path: ["confirmPassword"] }
  );

export const updateSettingsSchema = z.object({
  settings: z.record(z.string(), z.record(z.string(), z.unknown())),
});

export const updateRolePermissionsSchema = z.object({
  permissionCodes: z.array(z.string()),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
