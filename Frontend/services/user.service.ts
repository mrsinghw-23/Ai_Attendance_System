import bcrypt from "bcrypt";
import pool from "@/lib/db";
import {
  CreateUserInput,
  UpdateUserInput,
} from "@/schemas/admin.schema";
import { AuditLog, UserAccount, UserStats } from "@/types/admin";
import { getRecentLogins, getRecentPasswordResets } from "@/services/login-history.service";

const SALT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

const USER_SELECT = `
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
    u.location_id,
    l.location_name,
    u.last_login_at,
    u.password_changed_at,
    COALESCE(u.password_reset_required, false) AS password_reset_required,
    u.created_at,
    u.updated_at
  FROM users u
  LEFT JOIN employees e ON e.id = u.employee_id
  LEFT JOIN locations l ON l.id = u.location_id
`;

export async function listUsers() {
  const result = await pool.query(
    `
    ${USER_SELECT}
    ORDER BY u.created_at DESC, u.id DESC
    `
  );
  return result.rows as UserAccount[];
}

export async function getUserAccountById(id: number) {
  const result = await pool.query(
    `
    ${USER_SELECT}
    WHERE u.id = $1
    `,
    [id]
  );
  return (result.rows[0] as UserAccount) || null;
}

export async function usernameExists(username: string, excludeId?: number) {
  const values: unknown[] = [username];
  let query = "SELECT id FROM users WHERE LOWER(username) = LOWER($1)";

  if (excludeId) {
    query += " AND id != $2";
    values.push(excludeId);
  }

  const result = await pool.query(query, values);
  return result.rows.length > 0;
}

export async function emailExists(email: string, excludeId?: number) {
  if (!email) return false;
  const values: unknown[] = [email];
  let query =
    "SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND email IS NOT NULL";

  if (excludeId) {
    query += " AND id != $2";
    values.push(excludeId);
  }

  const result = await pool.query(query, values);
  return result.rows.length > 0;
}

export async function createUser(input: CreateUserInput) {
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const result = await pool.query(
    `
    INSERT INTO users (
      username,
      password,
      full_name,
      email,
      mobile,
      department,
      role,
      employee_id,
      location_id,
      status,
      password_reset_required,
      password_changed_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id
    `,
    [
      input.username,
      passwordHash,
      input.full_name || null,
      input.email || null,
      input.mobile || null,
      input.department || null,
      input.role,
      input.employee_id || null,
      input.location_id || null,
      input.status || "ACTIVE",
      input.force_password_change || false,
    ]
  );

  return getUserAccountById(result.rows[0].id);
}

export async function updateUser(id: number, input: UpdateUserInput) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  const setField = (column: string, value: unknown) => {
    fields.push(`${column} = $${index++}`);
    values.push(value);
  };

  if (input.username !== undefined) setField("username", input.username);
  if (input.full_name !== undefined) setField("full_name", input.full_name);
  if (input.email !== undefined) setField("email", input.email);
  if (input.mobile !== undefined) setField("mobile", input.mobile);
  if (input.department !== undefined) setField("department", input.department);
  if (input.role !== undefined) setField("role", input.role);
  if (input.status !== undefined) setField("status", input.status);
  if (input.employee_id !== undefined) setField("employee_id", input.employee_id);
  if (input.location_id !== undefined) setField("location_id", input.location_id);
  if (input.force_password_change !== undefined) {
    setField("password_reset_required", input.force_password_change);
  }

  if (fields.length === 0) return getUserAccountById(id);

  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  await pool.query(
    `
    UPDATE users
    SET ${fields.join(", ")}
    WHERE id = $${index}
    `,
    values
  );

  return getUserAccountById(id);
}

export async function deleteUser(id: number) {
  const existing = await getUserAccountById(id);
  if (!existing) return null;

  await pool.query("DELETE FROM users WHERE id = $1", [id]);
  return existing;
}

export async function setUserPassword(
  id: number,
  newPassword: string,
  requireChange = false
) {
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await pool.query(
    `
    UPDATE users
    SET password = $1,
        password_changed_at = CURRENT_TIMESTAMP,
        password_reset_required = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
    `,
    [passwordHash, requireChange, id]
  );

  return getUserAccountById(id);
}

export async function verifyCurrentPassword(userId: number, password: string) {
  const result = await pool.query(
    "SELECT password FROM users WHERE id = $1",
    [userId]
  );

  const hash = result.rows[0]?.password;
  if (!hash) return false;

  return bcrypt.compare(password, hash);
}

export async function updateLastLogin(userId: number) {
  await pool.query(
    `
    UPDATE users
    SET last_login_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    `,
    [userId]
  );
}

export async function getUserActivityLogs(userId: number, limit = 50) {
  const result = await pool.query(
    `
    SELECT *
    FROM audit_logs
    WHERE (entity_type = 'user' AND entity_id = $1)
       OR user_id = $2
    ORDER BY created_at DESC
    LIMIT $3
    `,
    [String(userId), userId, Math.min(200, Math.max(1, limit))]
  );

  return result.rows as AuditLog[];
}

export async function getUserStats(): Promise<UserStats> {
  const counts = await pool.query(`
    SELECT
      COUNT(*)::int AS total_users,
      COUNT(*) FILTER (WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE')::int AS active_users,
      COUNT(*) FILTER (WHERE COALESCE(status, 'ACTIVE') = 'INACTIVE')::int AS disabled_users
    FROM users
  `);

  const row = counts.rows[0];

  return {
    total_users: row.total_users,
    active_users: row.active_users,
    disabled_users: row.disabled_users,
    recent_logins: await getRecentLogins(8),
    recent_password_resets: await getRecentPasswordResets(8),
  };
}
