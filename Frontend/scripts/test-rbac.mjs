const BASE = "http://localhost:3000";

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    passCount++;
    console.log(`  PASS: ${message}`);
  } else {
    failCount++;
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
        Cookie: cookie,
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
  // ---------- SUPER_ADMIN ----------
  console.log("\n[SUPER_ADMIN] admin");
  const admin = await login("admin", "admin123");
  assert(admin.body?.success, "admin login succeeds");
  assert(
    admin.body?.user?.role === "SUPER_ADMIN",
    "admin role is SUPER_ADMIN"
  );
  const adminApi = makeApi(admin.cookie);

  const adminList = await adminApi(
    "/api/employees?limit=100"
  );
  assert(
    adminList.body?.success,
    "admin can list employees"
  );
  const all = adminList.body?.data || [];
  const loc1Emp = all.find(
    (e) => e.employee_code === "EMP101"
  );
  const loc2Emp = all.find(
    (e) => e.employee_code === "EMP200"
  );
  assert(!!loc1Emp, "admin sees loc1 employee EMP101");
  assert(
    !!loc2Emp,
    "admin sees loc2 employee EMP200 (all locations)"
  );
  console.log(
    `  (admin total employees: ${adminList.body?.pagination?.total})`
  );

  // ---------- MANAGER ----------
  console.log("\n[MANAGER] manager1 (location 1)");
  const manager = await login("manager1", "manager123");
  assert(manager.body?.success, "manager login succeeds");
  assert(
    manager.body?.user?.role === "MANAGER",
    "manager role is MANAGER"
  );
  const managerApi = makeApi(manager.cookie);

  const mgrList = await managerApi(
    "/api/employees?limit=100"
  );
  assert(
    mgrList.body?.success,
    "manager can list employees"
  );
  const mgrEmployees = mgrList.body?.data || [];
  assert(
    mgrEmployees.length > 0,
    "manager sees some employees"
  );
  assert(
    mgrEmployees.every(
      (e) => e.location_name === "Head Office"
    ),
    "manager sees ONLY own-location (Head Office) employees"
  );
  assert(
    !mgrEmployees.some(
      (e) => e.employee_code === "EMP200"
    ),
    "manager does NOT see loc2 employee EMP200"
  );

  // Manager GET loc2 employee by id -> 404
  const mgrGetLoc2 = await managerApi(
    `/api/employees/${loc2Emp.id}`
  );
  assert(
    mgrGetLoc2.status === 404,
    "manager GET loc2 employee -> 404 (scoped out)"
  );

  // Manager GET loc1 employee by id -> 200
  const mgrGetLoc1 = await managerApi(
    `/api/employees/${loc1Emp.id}`
  );
  assert(
    mgrGetLoc1.status === 200,
    "manager GET loc1 employee -> 200"
  );

  // Manager create in loc2 -> 403
  const mgrCreateLoc2 = await managerApi(
    "/api/employees",
    {
      method: "POST",
      body: JSON.stringify({
        employee_code: `MGRX${Date.now().toString().slice(-5)}`,
        first_name: "Cross",
        last_name: "Location",
        status: "ACTIVE",
        location_id: loc2Emp.location_id,
      }),
    }
  );
  assert(
    mgrCreateLoc2.status === 403,
    "manager create employee in loc2 -> 403"
  );

  // Manager create in loc1 -> 201
  const newCode = `MGR${Date.now().toString().slice(-6)}`;
  const mgrCreateLoc1 = await managerApi(
    "/api/employees",
    {
      method: "POST",
      body: JSON.stringify({
        employee_code: newCode,
        first_name: "Local",
        last_name: "Hire",
        status: "ACTIVE",
        location_id: loc1Emp.location_id,
      }),
    }
  );
  assert(
    mgrCreateLoc1.status === 201,
    "manager create employee in own loc1 -> 201"
  );
  const createdId = mgrCreateLoc1.body?.data?.id;

  // Manager update loc2 employee -> 404
  const mgrUpdateLoc2 = await managerApi(
    `/api/employees/${loc2Emp.id}`,
    {
      method: "PUT",
      body: JSON.stringify({ designation: "Hacked" }),
    }
  );
  assert(
    mgrUpdateLoc2.status === 404,
    "manager update loc2 employee -> 404 (scoped out)"
  );

  // Manager reassign own employee to loc2 -> 403
  if (createdId) {
    const mgrReassign = await managerApi(
      `/api/employees/${createdId}`,
      {
        method: "PUT",
        body: JSON.stringify({
          location_id: loc2Emp.location_id,
        }),
      }
    );
    assert(
      mgrReassign.status === 403,
      "manager reassign employee to loc2 -> 403"
    );

    // cleanup created employee via admin
    await adminApi(`/api/employees/${createdId}`, {
      method: "DELETE",
    });
  }

  // ---------- EMPLOYEE ----------
  console.log("\n[EMPLOYEE] employee1");
  const employee = await login(
    "employee1",
    "employee123"
  );
  assert(
    employee.body?.success,
    "employee login succeeds"
  );
  assert(
    employee.body?.user?.role === "EMPLOYEE",
    "employee role is EMPLOYEE"
  );
  const employeeApi = makeApi(employee.cookie);

  const empList = await employeeApi(
    "/api/employees"
  );
  assert(
    empList.status === 403,
    "employee GET /api/employees -> 403 (no access)"
  );

  const empGet = await employeeApi(
    `/api/employees/${loc1Emp.id}`
  );
  assert(
    empGet.status === 403,
    "employee GET /api/employees/[id] -> 403"
  );

  const empCreate = await employeeApi(
    "/api/employees",
    {
      method: "POST",
      body: JSON.stringify({
        employee_code: "EMPX1",
        first_name: "Should",
        last_name: "Fail",
        status: "ACTIVE",
      }),
    }
  );
  assert(
    empCreate.status === 403,
    "employee POST /api/employees -> 403"
  );

  const empManagers = await employeeApi(
    "/api/employees/managers"
  );
  assert(
    empManagers.status === 403,
    "employee GET /api/employees/managers -> 403"
  );

  // ---------- SUMMARY ----------
  console.log(
    `\n==== RBAC RESULTS: ${passCount} passed, ${failCount} failed ====`
  );
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
