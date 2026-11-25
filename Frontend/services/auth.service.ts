import pool from "@/lib/db";

export async function getUserByUsername(
  username: string
) {
  const result = await pool.query(
    `
    SELECT *
    FROM users
    WHERE username = $1
    `,
    [username]
  );

  return result.rows[0];
}