const BASE = "http://localhost:3000";

let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) {
    pass++;
    console.log(`  PASS: ${msg}`);
  } else {
    fail++;
    console.error(`  FAIL: ${msg}`);
  }
}

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const setCookie = res.headers.get("set-cookie");
  const cookie = setCookie
    ? setCookie.split(";")[0]
    : "";
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
  console.log("\n[SUPER_ADMIN] camera CRUD + stats");
  const admin = await login("admin", "admin123");
  const adminApi = makeApi(admin.cookie);

  // stats
  const stats = await adminApi(
    "/api/cameras/stats"
  );
  assert(stats.body?.success, "admin gets camera stats");
  assert(
    typeof stats.body?.data?.stats?.total ===
      "number",
    "stats include total count"
  );
  assert(
    Array.isArray(
      stats.body?.data?.locationReport
    ),
    "stats include location-wise report"
  );

  // create (assigned to location 1)
  const name = `Cam ${Date.now()
    .toString()
    .slice(-6)}`;
  const create = await adminApi(
    "/api/cameras",
    {
      method: "POST",
      body: JSON.stringify({
        camera_name: name,
        camera_ip: "192.168.1.77",
        rtsp_url:
          "rtsp://192.168.1.77:554/stream1",
        location_id: 1,
        status: "ACTIVE",
        health_status: "ONLINE",
        recording_status: "RECORDING",
      }),
    }
  );
  assert(
    create.status === 201,
    "admin create camera -> 201"
  );
  const camId = create.body?.data?.id;
  assert(!!camId, "create returns id");
  assert(
    create.body?.data?.location_name ===
      "Head Office",
    "camera joined to location name"
  );

  // duplicate name
  const dup = await adminApi("/api/cameras", {
    method: "POST",
    body: JSON.stringify({
      camera_name: name,
    }),
  });
  assert(
    dup.status === 409,
    "duplicate camera name -> 409"
  );

  // invalid
  const invalid = await adminApi(
    "/api/cameras",
    {
      method: "POST",
      body: JSON.stringify({
        camera_name: "x",
      }),
    }
  );
  assert(
    invalid.status === 400,
    "invalid camera name -> 400"
  );

  // get by id
  const getOne = await adminApi(
    `/api/cameras/${camId}`
  );
  assert(
    getOne.body?.data?.camera_name === name,
    "get camera by id"
  );

  // enable/disable toggle
  const disable = await adminApi(
    `/api/cameras/${camId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        status: "INACTIVE",
      }),
    }
  );
  assert(
    disable.body?.data?.status ===
      "INACTIVE",
    "disable camera (status INACTIVE)"
  );

  // update health
  const health = await adminApi(
    `/api/cameras/${camId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        health_status: "OFFLINE",
      }),
    }
  );
  assert(
    health.body?.data?.health_status ===
      "OFFLINE",
    "update health_status"
  );

  // filter by status
  const filter = await adminApi(
    "/api/cameras?status=INACTIVE"
  );
  assert(
    filter.body?.data?.every(
      (c) => c.status === "INACTIVE"
    ),
    "status filter returns only INACTIVE"
  );

  console.log(
    "\n[MANAGER] view own-location only, no write"
  );
  const manager = await login(
    "manager1",
    "manager123"
  );
  const managerApi = makeApi(manager.cookie);

  const mgrList = await managerApi(
    "/api/cameras"
  );
  assert(
    mgrList.status === 200,
    "manager can VIEW cameras"
  );
  assert(
    mgrList.body?.data?.every(
      (c) =>
        c.location_name === "Head Office" ||
        c.location_id === 1
    ),
    "manager sees ONLY own-location cameras"
  );

  const mgrStats = await managerApi(
    "/api/cameras/stats"
  );
  assert(
    mgrStats.status === 200,
    "manager can view camera stats (scoped)"
  );

  const mgrCreate = await managerApi(
    "/api/cameras",
    {
      method: "POST",
      body: JSON.stringify({
        camera_name: "Mgr Cam",
      }),
    }
  );
  assert(
    mgrCreate.status === 403,
    "manager create camera -> 403"
  );

  const mgrDelete = await managerApi(
    `/api/cameras/${camId}`,
    { method: "DELETE" }
  );
  assert(
    mgrDelete.status === 403,
    "manager delete camera -> 403"
  );

  console.log(
    "\n[EMPLOYEE] no camera access"
  );
  const employee = await login(
    "employee1",
    "employee123"
  );
  const employeeApi = makeApi(employee.cookie);

  const empList = await employeeApi(
    "/api/cameras"
  );
  assert(
    empList.status === 403,
    "employee GET /api/cameras -> 403"
  );

  const empStats = await employeeApi(
    "/api/cameras/stats"
  );
  assert(
    empStats.status === 403,
    "employee GET /api/cameras/stats -> 403"
  );

  // cleanup
  await adminApi(`/api/cameras/${camId}`, {
    method: "DELETE",
  });

  console.log(
    `\n==== CAMERA RESULTS: ${pass} passed, ${fail} failed ====`
  );
  if (fail > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
