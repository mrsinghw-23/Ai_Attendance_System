const BASE = "http://localhost:3000";

let cookie = "";

function logStep(title) {
  console.log(`\n=== ${title} ===`);
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {}),
    },
  });

  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    cookie = setCookie.split(";")[0];
  }

  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  return { status: res.status, body };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

// 1. Login
logStep("Login as admin (SUPER_ADMIN)");
const login = await api("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({
    username: "admin",
    password: "admin123",
  }),
});
assert(login.body?.success === true, "login succeeds");
assert(login.body?.user?.role === "SUPER_ADMIN", "role is SUPER_ADMIN");

// 2. List employees
logStep("GET /api/employees");
const list = await api("/api/employees?page=1&limit=10");
assert(list.body?.success === true, "list returns success");
assert(Array.isArray(list.body?.data), "list returns array");
assert(
  typeof list.body?.pagination?.total === "number",
  "list returns pagination.total"
);
console.log("   total existing:", list.body?.pagination?.total);

// 3. Create employee
logStep("POST /api/employees (create)");
const code = `EMP${Date.now().toString().slice(-6)}`;
const create = await api("/api/employees", {
  method: "POST",
  body: JSON.stringify({
    employee_code: code,
    first_name: "Test",
    last_name: "User",
    email: "test.user@company.com",
    mobile: "9999988888",
    designation: "QA Engineer",
    department: "Engineering",
    status: "ACTIVE",
  }),
});
assert(create.status === 201, "create returns 201");
assert(create.body?.success === true, "create succeeds");
const newId = create.body?.data?.id;
assert(typeof newId === "number", "create returns new id");
console.log("   new employee id:", newId, "code:", code);

// 4. Duplicate code rejected
logStep("POST duplicate employee_code (expect 409)");
const dup = await api("/api/employees", {
  method: "POST",
  body: JSON.stringify({
    employee_code: code,
    first_name: "Dup",
    last_name: "Code",
    status: "ACTIVE",
  }),
});
assert(dup.status === 409, "duplicate code rejected with 409");

// 5. Validation error
logStep("POST invalid payload (expect 400)");
const invalid = await api("/api/employees", {
  method: "POST",
  body: JSON.stringify({
    employee_code: "X",
    first_name: "",
    last_name: "",
  }),
});
assert(invalid.status === 400, "invalid payload rejected with 400");

// 6. Get by id
logStep(`GET /api/employees/${newId}`);
const getOne = await api(`/api/employees/${newId}`);
assert(getOne.body?.success === true, "get by id succeeds");
assert(
  getOne.body?.data?.employee_code === code,
  "get by id returns correct employee"
);

// 7. Update
logStep(`PUT /api/employees/${newId} (update)`);
const update = await api(`/api/employees/${newId}`, {
  method: "PUT",
  body: JSON.stringify({
    designation: "Senior QA Engineer",
    status: "ON_LEAVE",
  }),
});
assert(update.body?.success === true, "update succeeds");
assert(
  update.body?.data?.designation === "Senior QA Engineer",
  "designation updated"
);
assert(
  update.body?.data?.status === "ON_LEAVE",
  "status updated to ON_LEAVE"
);

// 8. Search filter
logStep("GET /api/employees?search=Test");
const search = await api(
  "/api/employees?search=Test&limit=50"
);
assert(
  search.body?.data?.some((e) => e.id === newId),
  "search finds created employee"
);

// 9. Status filter
logStep("GET /api/employees?status=ON_LEAVE");
const statusFilter = await api(
  "/api/employees?status=ON_LEAVE&limit=50"
);
assert(
  statusFilter.body?.data?.every(
    (e) => e.status === "ON_LEAVE"
  ),
  "status filter returns only ON_LEAVE"
);

// 10. Locations + managers endpoints
logStep("GET /api/locations & /api/employees/managers");
const locations = await api("/api/locations");
assert(
  locations.body?.success === true,
  "locations endpoint works"
);
const managers = await api("/api/employees/managers");
assert(
  managers.body?.success === true,
  "managers endpoint works"
);

// 11. Delete
logStep(`DELETE /api/employees/${newId}`);
const del = await api(`/api/employees/${newId}`, {
  method: "DELETE",
});
assert(del.body?.success === true, "delete succeeds");

// 12. Confirm gone
logStep(`GET /api/employees/${newId} (expect 404)`);
const gone = await api(`/api/employees/${newId}`);
assert(gone.status === 404, "deleted employee returns 404");

// 13. Unauthenticated access blocked
logStep("Unauthenticated GET /api/employees (expect 401)");
const savedCookie = cookie;
cookie = "";
const noauth = await api("/api/employees");
assert(noauth.status === 401, "unauthenticated request blocked");
cookie = savedCookie;

console.log("\n=== DONE ===");
