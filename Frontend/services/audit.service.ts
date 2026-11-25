import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { AuditLog } from "@/types/admin";

export interface AuditInput {
  userId?: number | null;
  username?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | number | null;
  metadata?: Record<string, unknown>;
  request?: NextRequest;
}

export function requestContext(request?: NextRequest) {
  if (!request) {
    return {
      ipAddress: null,
      userAgent: null,
    };
  }

  return {
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null,
    userAgent: request.headers.get("user-agent"),
  };
}

export async function writeAuditLog(input: AuditInput) {
  const { ipAddress, userAgent } = requestContext(input.request);

  await pool.query(
    `
    INSERT INTO audit_logs (
      user_id,
      username,
      action,
      entity_type,
      entity_id,
      metadata,
      ip_address,
      user_agent
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      input.userId || null,
      input.username || null,
      input.action,
      input.entityType || null,
      input.entityId ? String(input.entityId) : null,
      JSON.stringify(input.metadata || {}),
      ipAddress,
      userAgent,
    ]
  );
}

export async function getAuditLogs(options: {
  action?: string;
  entityType?: string;
  limit?: number;
} = {}) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (options.action) {
    conditions.push(`action ILIKE $${index++}`);
    values.push(`%${options.action}%`);
  }

  if (options.entityType) {
    conditions.push(`entity_type = $${index++}`);
    values.push(options.entityType);
  }

  const where =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  values.push(Math.min(200, Math.max(1, options.limit || 100)));

  const result = await pool.query(
    `
    SELECT *
    FROM audit_logs
    ${where}
    ORDER BY created_at DESC
    LIMIT $${index}
    `,
    values
  );

  return result.rows as AuditLog[];
}
