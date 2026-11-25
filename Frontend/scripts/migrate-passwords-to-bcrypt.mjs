import bcrypt from "bcrypt";
import pg from "pg";

const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "postgres",
  database: process.env.DB_NAME || "ai_attendance_db",
  password: process.env.DB_PASSWORD || "postgres@123",
  port: Number(process.env.DB_PORT || 5432),
});

const rounds = Number(process.env.BCRYPT_ROUNDS || 12);

const result = await pool.query(
  "SELECT id, username, password FROM users ORDER BY id"
);

let migrated = 0;

for (const user of result.rows) {
  const password = user.password || "";
  const alreadyHashed = /^\$2[aby]\$/.test(password);

  if (alreadyHashed) continue;

  const hash = await bcrypt.hash(password, rounds);
  await pool.query(
    `
    UPDATE users
    SET password = $1,
        password_changed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    `,
    [hash, user.id]
  );
  migrated++;
}

console.log(`bcrypt migration complete. Migrated ${migrated} user(s).`);
await pool.end();
