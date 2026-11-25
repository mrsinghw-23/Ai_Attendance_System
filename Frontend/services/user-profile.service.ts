import pool from "@/lib/db";
import {
  deleteProfileImageFile,
  saveProfileImage,
} from "@/utils/profile-image-storage";
import { UserProfile } from "@/types/user-profile";

const PROFILE_SELECT = `
  SELECT
    u.id,
    u.username,
    u.full_name,
    u.email,
    u.mobile,
    u.department,
    u.role,
    COALESCE(u.status, 'ACTIVE') AS status,
    u.employee_id,
    TRIM(CONCAT(
      COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''),
      ' ',
      COALESCE(e.last_name, '')
    )) AS employee_name,
    e.employee_code,
    u.location_id,
    l.location_name,
    u.profile_image,
    u.last_login_at,
    u.password_changed_at,
    COALESCE(u.password_reset_required, false) AS password_reset_required,
    u.created_at,
    u.updated_at
  FROM users u
  LEFT JOIN employees e ON e.id = u.employee_id
  LEFT JOIN locations l ON l.id = u.location_id
`;

function mapProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as number,
    username: row.username as string,
    full_name: (row.full_name as string) || null,
    email: (row.email as string) || null,
    mobile: (row.mobile as string) || null,
    department: (row.department as string) || null,
    role: row.role as string,
    status: row.status as UserProfile["status"],
    employee_id: (row.employee_id as number) ?? null,
    employee_name: (row.employee_name as string) || null,
    employee_code: (row.employee_code as string) || null,
    location_id: (row.location_id as number) ?? null,
    location_name: (row.location_name as string) || null,
    profile_image: (row.profile_image as string) || null,
    last_login_at: row.last_login_at ? String(row.last_login_at) : null,
    password_changed_at: row.password_changed_at
      ? String(row.password_changed_at)
      : null,
    password_reset_required: Boolean(row.password_reset_required),
    created_at: String(row.created_at),
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
}

export async function getUserProfile(userId: number) {
  const result = await pool.query(
    `
    ${PROFILE_SELECT}
    WHERE u.id = $1
    `,
    [userId]
  );

  return result.rows[0] ? mapProfile(result.rows[0]) : null;
}

export async function updateUserProfile(
  userId: number,
  input: {
    full_name?: string;
    email?: string | null;
    mobile?: string | null;
    department?: string | null;
  }
) {
  const result = await pool.query(
    `
    UPDATE users
    SET
      full_name = COALESCE($2, full_name),
      email = $3,
      mobile = $4,
      department = $5,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id
    `,
    [
      userId,
      input.full_name?.trim() || null,
      input.email?.trim() || null,
      input.mobile?.trim() || null,
      input.department?.trim() || null,
    ]
  );

  if (!result.rows[0]) return null;
  return getUserProfile(userId);
}

export async function updateUserProfileImage(
  userId: number,
  buffer: Buffer,
  extension: string
) {
  const existing = await pool.query(
    `SELECT profile_image FROM users WHERE id = $1`,
    [userId]
  );

  const imagePath = await saveProfileImage(userId, buffer, extension);

  await pool.query(
    `
    UPDATE users
    SET profile_image = $2, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    `,
    [userId, imagePath]
  );

  await deleteProfileImageFile(existing.rows[0]?.profile_image);

  return getUserProfile(userId);
}
