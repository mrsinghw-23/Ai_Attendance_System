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
  console.log("\n[SUPER_ADMIN] location CRUD");
  const admin = await login("admin", "admin123");
  const adminApi = makeApi(admin.cookie);

  // list with stats
  const list = await adminApi(
    "/api/locations?stats=true"
  );
  assert(list.body?.success, "admin list locations");
  assert(
    list.body?.data?.[0]?.employee_count !==
      undefined,
    "list includes employee_count stat"
  );

  // create
  const name = `Test Loc ${Date.now()
    .toString()
    .slice(-6)}`;
  const create = await adminApi(
    "/api/locations",
    {
      method: "POST",
      body: JSON.stringify({
        location_name: name,
        city: "Testville",
        state: "TestState",
      }),
    }
  );
  assert(
    create.status === 201,
    "admin create location -> 201"
  );
  const newId = create.body?.data?.id;
  assert(!!newId, "create returns id");

  // duplicate name
  const dup = await adminApi("/api/locations", {
    method: "POST",
    body: JSON.stringify({
      location_name: name,
    }),
  });
  assert(
    dup.status === 409,
    "duplicate location name -> 409"
  );

  // invalid
  const invalid = await adminApi(
    "/api/locations",
    {
      method: "POST",
      body: JSON.stringify({
        location_name: "x",
      }),
    }
  );
  assert(
    invalid.status === 400,
    "invalid location name -> 400"
  );

  // get by id with employees/cameras
  const getOne = await adminApi(
    `/api/locations/${newId}`
  );
  assert(
    getOne.body?.success,
    "get location detail"
  );
  assert(
    Array.isArray(
      getOne.body?.data?.employees
    ) &&
      Array.isArray(
        getOne.body?.data?.cameras
      ),
    "detail includes employees + cameras arrays"
  );

  // update
  const update = await adminApi(
    `/api/locations/${newId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        city: "UpdatedCity",
      }),
    }
  );
  assert(
    update.body?.data?.city ===
      "UpdatedCity",
    "update location city"
  );

  // delete empty location
  const del = await adminApi(
    `/api/locations/${newId}`,
    { method: "DELETE" }
  );
  assert(
    del.body?.success,
    "delete empty location"
  );

  // delete in-use location (Head Office id=1 has employees) -> 409
  const delInUse = await adminApi(
    "/api/locations/1",
    { method: "DELETE" }
  );
  assert(
    delInUse.status === 409,
    "delete in-use location -> 409 (blocked)"
  );

  console.log("\n[MANAGER] location RBAC");
  const manager = await login(
    "manager1",
    "manager123"
  );
  const managerApi = makeApi(manager.cookie);

  // manager can read locations (for dropdowns)
  const mgrList = await managerApi(
    "/api/locations"
  );
  assert(
    mgrList.status === 200,
    "manager can READ locations (dropdowns)"
  );

  // manager cannot create
  const mgrCreate = await managerApi(
    "/api/locations",
    {
      method: "POST",
      body: JSON.stringify({
        location_name: "Mgr Loc",
      }),
    }
  );
  assert(
    mgrCreate.status === 403,
    "manager create location -> 403"
  );

  // manager cannot delete
  const mgrDelete = await managerApi(
    "/api/locations/1",
    { method: "DELETE" }
  );
  assert(
    mgrDelete.status === 403,
    "manager delete location -> 403"
  );

  console.log("\n[EMPLOYEE] location RBAC");
  const employee = await login(
    "employee1",
    "employee123"
  );
  const employeeApi = makeApi(employee.cookie);

  const empCreate = await employeeApi(
    "/api/locations",
    {
      method: "POST",
      body: JSON.stringify({
        location_name: "Emp Loc",
      }),
    }
  );
  assert(
    empCreate.status === 403,
    "employee create location -> 403"
  );

  console.log(
    `\n==== LOCATION RESULTS: ${pass} passed, ${fail} failed ====`
  );
  if (fail > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
