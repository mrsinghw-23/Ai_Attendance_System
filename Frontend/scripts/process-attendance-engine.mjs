const BASE = process.env.APP_URL || "http://localhost:3000";

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const setCookie = res.headers.get("set-cookie");
  return setCookie ? setCookie.split(";")[0] : "";
}

async function main() {
  const username = process.env.ENGINE_USER || "admin";
  const password = process.env.ENGINE_PASSWORD || "admin123";
  const cookie = await login(username, password);

  if (!cookie) {
    console.error("Failed to authenticate scheduler user");
    process.exit(1);
  }

  const response = await fetch(`${BASE}/api/attendance/engine/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ limit: 500, finalizeAbsent: true }),
  });

  const data = await response.json();
  if (!data.success) {
    console.error("Engine run failed:", data.message);
    process.exit(1);
  }

  console.log("Attendance engine completed:", data.data);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
