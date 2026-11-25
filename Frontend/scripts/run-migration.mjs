import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "postgres",
  database: process.env.DB_NAME || "ai_attendance_db",
  password: process.env.DB_PASSWORD || "postgres@123",
  port: Number(process.env.DB_PORT || 5432),
});

const migrationFile = process.argv[2] || "001_extend_employees.sql";
const sqlPath = path.join(__dirname, "..", "database", "migrations", migrationFile);
const sql = fs.readFileSync(sqlPath, "utf8");

await pool.query(sql);
console.log(`Migration applied: ${migrationFile}`);
await pool.end();
