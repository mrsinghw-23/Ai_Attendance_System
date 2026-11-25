import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requestContext } from "@/services/audit.service";
import { parseUserAgent } from "@/utils/user-agent";
import { LoginHistoryEntry } from "@/types/admin";

export type LoginEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "LOGOUT"
  | "PASSWORD_RESET"
  | "PASSWORD_CHANGE";

export async function writeLoginHistory(input: {
  userId?: number | null;
  username?: string | null;
  eventType: LoginEventType;
  status: "SUCCESS" | "FAILURE" | "BLOCKED";
  request?: NextRequest;
  metadata?: Record<string, unknown>;
}) {
  const { ipAddress, userAgent } = requestContext(input.request);
  const { browser, device } = parseUserAgent(userAgent);

  await pool.query(
    `
    INSERT INTO login_history (
      user_id,
      username,
      event_type,
      status,
      ip_address,
      browser,
      device,
      user_agent,
      metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      input.userId || null,
      input.username || null,
      input.eventType,
      input.status,
      ipAddress,
      browser,
      device,
      userAgent,
      JSON.stringify(input.metadata || {}),
    ]
  );
}

export async function getLoginHistoryForUser(
  userId: number,
  limit = 50
) {
  const result = await pool.query(
    `
    SELECT *
    FROM login_history
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [userId, Math.min(200, Math.max(1, limit))]
  );

  return result.rows as LoginHistoryEntry[];
}

export async function getRecentLogins(limit = 10) {
  const result = await pool.query(
    `
    SELECT *
    FROM login_history
    WHERE event_type = 'LOGIN_SUCCESS'
    ORDER BY created_at DESC
    LIMIT $1
    `,
    [Math.min(50, Math.max(1, limit))]
  );

  return result.rows as LoginHistoryEntry[];
}

export async function getRecentPasswordResets(limit = 10) {
  const result = await pool.query(
    `
    SELECT lh.*, u.full_name, u.email
    FROM login_history lh
    LEFT JOIN users u ON u.id = lh.user_id
    WHERE lh.event_type = 'PASSWORD_RESET'
    ORDER BY lh.created_at DESC
    LIMIT $1
    `,
    [Math.min(50, Math.max(1, limit))]
  );

  return result.rows;
}
