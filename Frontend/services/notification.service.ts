import pool from "@/lib/db";
import { publishRealtimeEvent } from "@/services/realtime.service";
import { Notification } from "@/types/phase6";

interface CreateNotificationInput {
  userId?: number | null;
  role?: string | null;
  title: string;
  message: string;
  type?: "ATTENDANCE" | "CAMERA" | "SYSTEM" | "SECURITY";
  priority?: "LOW" | "NORMAL" | "HIGH";
  entityType?: string | null;
  entityId?: string | number | null;
}

function mapNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as number,
    user_id: (row.user_id as number) ?? null,
    role: (row.role as string) ?? null,
    title: row.title as string,
    message: row.message as string,
    type: row.type as Notification["type"],
    priority: (row.priority as Notification["priority"]) || "NORMAL",
    read_at: row.read_at ? String(row.read_at) : null,
    entity_type: (row.entity_type as string) ?? null,
    entity_id: (row.entity_id as string) ?? null,
    created_at: String(row.created_at),
  };
}

function visibilityClause(role: string, userParam: number, roleParam: number) {
  if (role === "SUPER_ADMIN") {
    return "TRUE";
  }

  if (role === "EMPLOYEE") {
    return `user_id = $${userParam}`;
  }

  if (role === "CAMERA_ADMIN") {
    return `(user_id = $${userParam} OR role IN ('CAMERA_ADMIN', 'SUPER_ADMIN') OR (user_id IS NULL AND role IS NULL))`;
  }

  if (role === "ATTENDANCE_ADMIN" || role === "HR") {
    return `(user_id = $${userParam} OR role IN ($${roleParam}, 'SUPER_ADMIN') OR type = 'ATTENDANCE' OR (user_id IS NULL AND role IS NULL))`;
  }

  return `(user_id = $${userParam} OR role = $${roleParam} OR (user_id IS NULL AND role IS NULL))`;
}

function scopeValues(userId: number, role: string) {
  if (role === "SUPER_ADMIN") return [] as unknown[];
  if (role === "EMPLOYEE" || role === "CAMERA_ADMIN") return [userId];
  return [userId, role];
}

export async function createNotification(input: CreateNotificationInput) {
  const result = await pool.query(
    `
    INSERT INTO notifications (
      user_id,
      role,
      title,
      message,
      type,
      priority,
      entity_type,
      entity_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
    `,
    [
      input.userId || null,
      input.role || null,
      input.title,
      input.message,
      input.type || "SYSTEM",
      input.priority || "NORMAL",
      input.entityType || null,
      input.entityId ? String(input.entityId) : null,
    ]
  );

  const notification = mapNotification(result.rows[0]);
  publishRealtimeEvent("notification.created", { ...notification });
  return notification;
}

export async function listNotifications(options: {
  userId: number;
  role: string;
  unreadOnly?: boolean;
}) {
  const values = scopeValues(options.userId, options.role);
  const userParam = 1;
  const roleParam = 2;
  const conditions = [
    visibilityClause(options.role, userParam, roleParam),
  ];

  if (options.unreadOnly) {
    conditions.push("read_at IS NULL");
  }

  const result = await pool.query(
    `
    SELECT *
    FROM notifications
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT 100
    `,
    values
  );

  return result.rows.map(mapNotification);
}

export async function markNotificationRead(
  id: number,
  userId: number,
  role: string
) {
  const values = [id, ...scopeValues(userId, role)];
  const userParam = 2;
  const roleParam = 3;

  const result = await pool.query(
    `
    UPDATE notifications
    SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
    WHERE id = $1
      AND ${visibilityClause(role, userParam, roleParam)}
    RETURNING *
    `,
    values
  );

  return result.rows[0] ? mapNotification(result.rows[0]) : null;
}

export async function markAllNotificationsRead(userId: number, role: string) {
  const values = scopeValues(userId, role);
  const userParam = 1;
  const roleParam = 2;

  const result = await pool.query(
    `
    UPDATE notifications
    SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
    WHERE read_at IS NULL
      AND ${visibilityClause(role, userParam, roleParam)}
    RETURNING id
    `,
    values
  );

  return result.rowCount || 0;
}
