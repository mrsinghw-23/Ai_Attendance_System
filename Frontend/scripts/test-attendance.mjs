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
  return { cookie, body };
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
    } catch {
      body = null;
    }
    return { status: res.status, body };
  };
}

async function main() {
  console.log("\n[SUPER_ADMIN] Attendance flow");
  const admin = await login("admin", "admin123");
  const adminApi = makeApi(admin.cookie);
  assert(admin.body?.success, "admin login succeeds");

  const employees = await adminApi("/api/employees?limit=100");
  const loc1 = employees.body.data.find(
    (e) => e.employee_code === "EMP101"
  );
  const loc2 = employees.body.data.find(
    (e) => e.employee_code === "EMP200"
  );
  assert(!!loc1 && !!loc2, "seed employees exist in loc1 and loc2");

  const day = `2031-03-${String(
    10 + Math.floor(Math.random() * 10)
  ).padStart(2, "0")}`;

  const checkIn = await adminApi("/api/attendance/check-in", {
    method: "POST",
    body: JSON.stringify({
      employee_id: loc1.id,
      event_time: `${day}T09:30:00`,
      source: "MANUAL",
    }),
  });
  assert(checkIn.status === 201, "admin check-in -> 201");
  assert(
    checkIn.body?.data?.late_minutes > 0,
    "late arrival detected"
  );
  assert(checkIn.body?.data?.status === "LATE", "status is LATE");

  const checkOut = await adminApi("/api/attendance/check-out", {
    method: "POST",
    body: JSON.stringify({
      employee_id: loc1.id,
      event_time: `${day}T19:00:00`,
      source: "MANUAL",
    }),
  });
  assert(checkOut.status === 201, "admin check-out -> 201");
  assert(
    checkOut.body?.data?.working_hours >= 9,
    "working hours calculated"
  );
  assert(
    checkOut.body?.data?.overtime_hours > 0,
    "overtime calculated"
  );

  const records = await adminApi(`/api/attendance?from=${day}&to=${day}`);
  assert(records.body?.success, "attendance records query succeeds");
  assert(
    records.body?.data?.some((r) => r.employee_id === loc1.id),
    "created record appears in reports"
  );

  const dashboard = await adminApi("/api/attendance/dashboard");
  assert(dashboard.body?.success, "dashboard endpoint succeeds");
  assert(
    Array.isArray(dashboard.body?.data?.daily),
    "daily chart data returned"
  );
  assert(
    Array.isArray(dashboard.body?.data?.monthly),
    "monthly chart data returned"
  );

  const aiLog = await adminApi("/api/attendance/logs", {
    method: "POST",
    body: JSON.stringify({
      employee_id: loc1.id,
      event_type: "CHECK_IN",
      event_time: `${day}T09:31:00`,
      source: "AI_FACE_RECOGNITION",
    }),
  });
  assert(aiLog.status === 201, "AI-ready attendance log insertion works");

  console.log("\n[MANAGER] Location-scoped attendance");
  const manager = await login("manager1", "manager123");
  const managerApi = makeApi(manager.cookie);
  assert(manager.body?.success, "manager login succeeds");

  const mgrRecords = await managerApi("/api/attendance");
  assert(mgrRecords.status === 200, "manager can view attendance");
  assert(
    mgrRecords.body?.data?.every((r) => r.location_id === 1),
    "manager sees only own-location attendance"
  );

  const mgrCrossCheckIn = await managerApi("/api/attendance/check-in", {
    method: "POST",
    body: JSON.stringify({
      employee_id: loc2.id,
      event_time: `${day}T09:00:00`,
      source: "MANUAL",
    }),
  });
  assert(
    mgrCrossCheckIn.status === 403,
    "manager cannot check in employee outside location"
  );

  console.log("\n[EMPLOYEE] Own attendance only");
  const employee = await login("employee1", "employee123");
  const employeeApi = makeApi(employee.cookie);
  assert(employee.body?.success, "employee login succeeds");

  const empRecords = await employeeApi("/api/attendance");
  assert(empRecords.status === 200, "employee can view attendance");
  assert(
    empRecords.body?.data?.every((r) => r.employee_id === loc1.id),
    "employee sees only own attendance"
  );

  const empCross = await employeeApi("/api/attendance/check-in", {
    method: "POST",
    body: JSON.stringify({
      employee_id: loc2.id,
      event_time: `${day}T09:00:00`,
      source: "MANUAL",
    }),
  });
  assert(
    empCross.status === 403,
    "employee cannot write attendance for another employee"
  );

  const unauth = await makeApi("")("/api/attendance");
  assert(unauth.status === 401, "unauthenticated attendance blocked");

  console.log(
    `\n==== ATTENDANCE RESULTS: ${pass} passed, ${fail} failed ====`
  );
  if (fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
