const BASE = "http://localhost:3000";

let pass = 0;
let fail = 0;

function assert(condition, message) {
  if (condition) {
    pass++;
    console.log(`  PASS: ${message}`);
  } else {
    fail++;
    console.error(`  FAIL: ${message}`);
  }
}

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const setCookie = res.headers.get("set-cookie");
  const cookie = setCookie ? setCookie.split(";")[0] : "";
  const body = await res.json();
  return { cookie, body, status: res.status };
}

function makeApi(cookie) {
  return async (path, options = {}) => {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(options.headers || {}),
      },
    });
    let body = null;
    try {
      body = await res.json();
    } catch {}
    return { status: res.status, body, headers: res.headers };
  };
}

async function main() {
  const admin = await login("admin", "admin123");
  const adminApi = makeApi(admin.cookie);
  assert(admin.status === 200, "admin login");

  console.log("\n[REPORTS]");
  for (const type of ["attendance", "employees", "locations", "cameras", "audit"]) {
    const report = await adminApi(`/api/reports?type=${type}`);
    assert(report.status === 200, `${type} report loads`);
    assert(Array.isArray(report.body?.data?.columns), `${type} report columns`);
  }

  for (const format of ["csv", "excel", "pdf"]) {
    const exportRes = await adminApi(
      `/api/reports/export?type=attendance&format=${format}`
    );
    assert(exportRes.status === 200, `${format} export returns 200`);
  }

  console.log("\n[NOTIFICATIONS]");
  const notification = await adminApi("/api/notifications", {
    method: "POST",
    body: JSON.stringify({
      title: "Phase 6 Test",
      message: "Notification engine test",
      type: "SYSTEM",
      priority: "NORMAL",
    }),
  });
  assert(notification.status === 201, "create notification");
  const listNotifications = await adminApi("/api/notifications");
  assert(listNotifications.status === 200, "list notifications");
  const notificationId = notification.body?.data?.id;
  const read = await adminApi(`/api/notifications/${notificationId}/read`, {
    method: "PATCH",
  });
  assert(read.status === 200, "mark notification read");

  console.log("\n[CAMERA HEALTH]");
  const healthRun = await adminApi("/api/cameras/health", { method: "POST" });
  assert(healthRun.status === 200, "run camera health check");
  const healthLogs = await adminApi("/api/cameras/health");
  assert(healthLogs.status === 200, "list camera health logs");

  console.log("\n[REALTIME]");
  const feed = await adminApi("/api/realtime/feed");
  assert(feed.status === 200, "realtime feed endpoint");
  assert(Array.isArray(feed.body?.data), "realtime feed array");

  console.log("\n[AI READINESS]");
  const employees = await adminApi("/api/employees?limit=100");
  const employee = employees.body?.data?.find((e) => e.employee_code === "EMP101");
  assert(!!employee, "employee for AI tests exists");

  const profile = await adminApi("/api/ai/face-profiles", {
    method: "POST",
    body: JSON.stringify({
      employee_id: employee.id,
      profile_status: "READY",
      image_count: 3,
      embedding_model: "future-face-model-v1",
      metadata: { source: "test" },
    }),
  });
  assert(profile.status === 201, "upsert face profile");

  const profiles = await adminApi("/api/ai/face-profiles");
  assert(profiles.status === 200, "list face profiles");

  const faceEvent = await adminApi("/api/ai/face-events", {
    method: "POST",
    body: JSON.stringify({
      employee_id: employee.id,
      location_id: employee.location_id,
      event_time: "2032-01-01T09:00:00",
      confidence: 0.98,
      event_type: "FACE_RECOGNIZED",
      image_ref: "s3://future/image.jpg",
      embedding_ref: "embedding://future/ref",
      metadata: { bbox: [1, 2, 3, 4] },
    }),
  });
  assert(faceEvent.status === 201, "ingest face event");

  const faceEvents = await adminApi("/api/ai/face-events");
  assert(faceEvents.status === 200, "list face events");

  console.log("\n[RBAC]");
  const employeeLogin = await login("employee1", "employee123");
  const employeeApi = makeApi(employeeLogin.cookie);
  const employeeAudit = await employeeApi("/api/reports?type=audit");
  assert(employeeAudit.status === 403, "employee cannot access audit report");
  const employeeAi = await employeeApi("/api/ai/face-events");
  assert(employeeAi.status === 403, "employee cannot access AI face events");

  console.log(`\n==== PHASE 6 RESULTS: ${pass} passed, ${fail} failed ====`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
