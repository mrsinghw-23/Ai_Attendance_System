const BASE = process.env.APP_URL || "http://localhost:3000";
const USERNAME = process.env.HEALTH_CHECK_USER || "admin";
const PASSWORD = process.env.HEALTH_CHECK_PASSWORD || "admin123";
const INTERVAL_MS = Number(process.env.HEALTH_CHECK_INTERVAL_MS || 60000);
const watch = process.argv.includes("--watch");

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const setCookie = res.headers.get("set-cookie");
  return setCookie ? setCookie.split(";")[0] : "";
}

async function runHealthCheck() {
  const cookie = await login();
  if (!cookie) {
    console.error("Health check login failed");
    return;
  }

  const res = await fetch(`${BASE}/api/cameras/health`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  const body = await res.json();

  if (!body.success) {
    console.error("Health check failed:", body.message || res.status);
    return;
  }

  const online = body.data.filter((row) => row.health_status === "ONLINE").length;
  console.log(
    `[${new Date().toISOString()}] Camera health check complete: ${body.data.length} cameras, ${online} online`
  );
}

console.log(`Camera health endpoint: ${BASE}/api/cameras/health`);
console.log(`Interval: ${INTERVAL_MS}ms${watch ? " (watch mode)" : ""}`);

await runHealthCheck();

if (watch) {
  setInterval(runHealthCheck, INTERVAL_MS);
}
