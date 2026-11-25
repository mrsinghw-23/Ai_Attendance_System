import crypto from "crypto";
import pool from "@/lib/db";

const TOKEN_EXPIRY_MINUTES = 15;

export async function createPasswordResetToken(userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

  await pool.query(
    `
    UPDATE password_reset_tokens
    SET used = TRUE
    WHERE user_id = $1 AND used = FALSE
    `,
    [userId]
  );

  await pool.query(
    `
    INSERT INTO password_reset_tokens (user_id, token, expires_at)
    VALUES ($1, $2, $3)
    `,
    [userId, token, expiresAt]
  );

  return { token, expiresAt };
}

export async function findUserByUsernameOrEmail(
  identifier: string
) {
  const result = await pool.query(
    `
    SELECT id, username, email, status
    FROM users
    WHERE LOWER(username) = LOWER($1)
       OR LOWER(email) = LOWER($1)
    LIMIT 1
    `,
    [identifier.trim()]
  );

  return result.rows[0] || null;
}

export async function validateResetToken(token: string) {
  const result = await pool.query(
    `
    SELECT prt.*, u.username, u.status
    FROM password_reset_tokens prt
    JOIN users u ON u.id = prt.user_id
    WHERE prt.token = $1
    LIMIT 1
    `,
    [token]
  );

  const row = result.rows[0];
  if (!row) return { valid: false as const, reason: "invalid_token" };
  if (row.used) return { valid: false as const, reason: "token_used" };
  if (new Date(row.expires_at) < new Date()) {
    return { valid: false as const, reason: "token_expired" };
  }
  if (row.status === "INACTIVE") {
    return { valid: false as const, reason: "inactive_account" };
  }

  return {
    valid: true as const,
    userId: row.user_id as number,
    username: row.username as string,
  };
}

export async function markTokenUsed(token: string) {
  await pool.query(
    `
    UPDATE password_reset_tokens
    SET used = TRUE
    WHERE token = $1
    `,
    [token]
  );
}
