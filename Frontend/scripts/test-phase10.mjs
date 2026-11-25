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

async function main() {
  console.log("\n[PHASE 10] Enterprise Camera Management & AI Camera Operations");

  const admin = await login("admin", "admin123");
  assert(admin.status === 200, "admin login succeeds");
  const adminApi = makeApi(admin.cookie);

  console.log("\n[ZONES] camera zone CRUD");
  const zoneCreate = await adminApi("/api/camera-zones", {
    method: "POST",
    body: JSON.stringify({
      zone_name: `Test Zone ${Date.now().toString().slice(-5)}`,
      description: "Phase 10 test zone",
      floor: "Ground",
    }),
  });
  assert(zoneCreate.status === 201, "create camera zone");
  const zoneId = zoneCreate.body?.data?.id;

  const zones = await adminApi("/api/camera-zones");
  assert(zones.body?.success && Array.isArray(zones.body.data), "list camera zones");

  console.log("\n[CAMERA MASTER] extended CRUD with encrypted password");
  const code = `CAM-${Date.now().toString().slice(-6)}`;
  const create = await adminApi("/api/cameras", {
    method: "POST",
    body: JSON.stringify({
      camera_name: `Phase10 Cam ${Date.now().toString().slice(-5)}`,
      camera_code: code,
      camera_type: "IP Camera",
      brand: "TestBrand",
      model: "Model-X",
      camera_ip: "127.0.0.1",
      port: 554,
      rtsp_username: "admin",
      rtsp_password: "secret-pass-123",
      location_id: 1,
      zone_id: zoneId,
      entry_exit_type: "ENTRY",
      motion_enabled: true,
      motion_sensitivity: 70,
    }),
  });
  assert(create.status === 201, "create camera with master fields");
  const cameraId = create.body?.data?.id;
  assert(create.body?.data?.has_rtsp_password === true, "password stored as encrypted flag");
  assert(!create.body?.data?.rtsp_password, "plain password not returned");

  const getOne = await adminApi(`/api/cameras/${cameraId}`);
  assert(getOne.body?.data?.camera_code === code, "camera code persisted");
  assert(getOne.body?.data?.zone_id === zoneId, "zone assignment persisted");

  console.log("\n[HEALTH] monitoring + logs");
  const healthRun = await adminApi("/api/cameras/health", { method: "POST" });
  assert(healthRun.body?.success, "run camera health check");
  assert(Array.isArray(healthRun.body?.data), "health check returns per-camera results");

  const healthLogs = await adminApi(`/api/cameras/health?camera_id=${cameraId}`);
  assert(healthLogs.body?.success, "fetch camera health logs");

  console.log("\n[OPERATIONS] dashboard + map + pipeline");
  const dashboard = await adminApi("/api/cameras/operations/dashboard");
  assert(dashboard.body?.success, "operations dashboard loads");
  assert(typeof dashboard.body?.data?.stats?.total === "number", "dashboard stats present");
  assert(Array.isArray(dashboard.body?.data?.recent_events), "recent events present");

  const map = await adminApi("/api/cameras/operations/map");
  assert(map.body?.success, "camera map view loads");
  assert(Array.isArray(map.body?.data), "map returns locations tree");

  const pipeline = await adminApi("/api/cameras/pipeline");
  assert(pipeline.body?.success, "pipeline architecture loads");
  assert(pipeline.body?.data?.stages?.length >= 5, "pipeline has stages");

  console.log("\n[EVENTS] motion event");
  const motion = await adminApi("/api/cameras/events", {
    method: "POST",
    body: JSON.stringify({ camera_id: cameraId, message: "Phase 10 motion test" }),
  });
  assert(motion.status === 201, "record motion event");

  const events = await adminApi(`/api/cameras/events?camera_id=${cameraId}`);
  assert(events.body?.data?.length > 0, "camera events listed");

  console.log("\n[REPORTS] camera report types");
  for (const type of [
    "camera_health",
    "camera_uptime",
    "camera_downtime",
    "camera_attendance",
    "motion_detection",
    "location_camera",
  ]) {
    const report = await adminApi(`/api/reports?type=${type}`);
    assert(report.body?.success, `report type ${type} loads`);
  }

  console.log("\n[RBAC] employee blocked, manager scoped");
  const employee = await login("employee", "employee123");
  if (employee.status === 200) {
    const employeeApi = makeApi(employee.cookie);
    const denied = await employeeApi("/api/cameras");
    assert(denied.status === 403, "employee cannot access cameras");
  } else {
    console.log("  SKIP: employee user not available");
  }

  const manager = await login("manager", "manager123");
  if (manager.status === 200) {
    const managerApi = makeApi(manager.cookie);
    const managerCameras = await managerApi("/api/cameras");
    assert(managerCameras.body?.success, "manager can view location cameras");
  } else {
    console.log("  SKIP: manager user not available");
  }

  console.log(`\nPhase 10 results: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
