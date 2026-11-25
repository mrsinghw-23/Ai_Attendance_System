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
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, cookie, body };
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
    return { status: res.status, body };
  };
}

function todayAt(hour, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

async function main() {
  console.log("\n[PHASE 9] AI Attendance Processing Engine");

  const admin = await login("admin", "admin123");
  assert(admin.status === 200, "admin login succeeds");
  const adminApi = makeApi(admin.cookie);

  console.log("\n[INGEST] face events for engine");
  const employees = await adminApi("/api/employees?limit=5");
  const employeeIds = employees.body?.data?.map((e) => e.id) || [1];
  const empOnTime = employeeIds[0];
  const empLate = employeeIds[1] || employeeIds[0];

  const onTime = await adminApi("/api/ai/face-events", {
    method: "POST",
    body: JSON.stringify({
      camera_id: 1,
      employee_id: empOnTime,
      location_id: 1,
      event_time: todayAt(9, 58),
      confidence: 0.95,
      event_type: "FACE_RECOGNIZED",
      image_ref: "phase9-on-time.jpg",
    }),
  });
  assert(onTime.status === 201, "ingest on-time face event");

  const late = await adminApi("/api/ai/face-events", {
    method: "POST",
    body: JSON.stringify({
      camera_id: 1,
      employee_id: empLate,
      location_id: 1,
      event_time: todayAt(10, 25),
      confidence: 0.92,
      event_type: "FACE_RECOGNIZED",
      image_ref: "phase9-late.jpg",
    }),
  });
  assert(late.status === 201, "ingest late face event");

  const checkout = await adminApi("/api/ai/face-events", {
    method: "POST",
    body: JSON.stringify({
      camera_id: 1,
      employee_id: empOnTime,
      location_id: 1,
      event_time: todayAt(19, 15),
      confidence: 0.9,
      event_type: "FACE_RECOGNIZED",
      image_ref: "phase9-checkout.jpg",
    }),
  });
  assert(checkout.status === 201, "ingest checkout face event");

  console.log("\n[ENGINE] process pending events");
  const engineRun = await adminApi("/api/attendance/engine/process", {
    method: "POST",
    body: JSON.stringify({ limit: 100, finalizeAbsent: true }),
  });
  assert(engineRun.status === 200, "engine processes face events");
  assert(engineRun.body?.data?.eventsProcessed >= 2, "events processed count");

  console.log("\n[CHECK-IN / CHECK-OUT]");
  const summary = await adminApi("/api/attendance/summary");
  assert(summary.body?.data?.length >= 1, "attendance summary generated");

  const presence = await adminApi("/api/attendance/presence-logs");
  assert(presence.body?.data?.length >= 1, "presence IN/OUT logs stored");

  console.log("\n[DASHBOARDS]");
  const employeeDash = await adminApi(
    "/api/attendance/engine/dashboard?type=employee"
  );
  assert(employeeDash.body?.success, "employee engine dashboard");

  const cameraDash = await adminApi(
    "/api/attendance/engine/dashboard?type=camera"
  );
  assert(cameraDash.body?.data?.total_cameras >= 0, "camera engine dashboard");

  const locationDash = await adminApi(
    "/api/attendance/engine/dashboard?type=location"
  );
  assert(locationDash.body?.data?.locations?.length >= 0, "location dashboard");

  console.log("\n[REPORTS]");
  const lateReport = await adminApi("/api/reports?type=late_arrival");
  assert(lateReport.body?.success, "late arrival report");

  const movementReport = await adminApi("/api/reports?type=movement");
  assert(movementReport.body?.success, "movement report");

  const exportCsv = await adminApi(
    "/api/reports/export?type=daily_attendance&format=csv"
  );
  assert(exportCsv.status === 200, "daily attendance CSV export");

  console.log(`\nPhase 9 results: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
