import { Pool } from "pg";

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "postgres",
  database:
    process.env.DB_NAME || "ai_attendance_db",
  password:
    process.env.DB_PASSWORD || "postgres@123",
  port: Number(process.env.DB_PORT || 5432),
});

pool.on("connect", (client) => {
  client.query("SET TIME ZONE 'Asia/Kolkata'").catch((error) => {
    console.error("Failed to set database timezone:", error);
  });
});

export default pool;