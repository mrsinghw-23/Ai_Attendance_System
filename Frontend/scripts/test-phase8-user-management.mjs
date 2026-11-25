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
  console.log("\n[PHASE 8] Enterprise User Management");

  const admin = await login("admin", "admin123");
  assert(admin.status === 200, "admin login succeeds");
  assert(Array.isArray(admin.body?.user?.permissions), "login returns DB permissions");
  const adminApi = makeApi(admin.cookie);

  console.log("\n[USERS] create/update/delete");
  const username = `p8_${Date.now().toString().slice(-6)}`;
  const create = await adminApi("/api/users", {
    method: "POST",
    body: JSON.stringify({
      username,
      password: "Phase8Pass!",
      confirmPassword: "Phase8Pass!",
      full_name: "Phase Eight User",
      email: `${username}@example.com`,
      mobile: "9999999999",
      department: "IT",
      role: "HR",
      status: "ACTIVE",
      force_password_change: true,
    }),
  });
  assert(create.status === 201, "create user with extended fields");
  const userId = create.body?.data?.id;
  assert(!!userId, "created user id returned");

  const update = await adminApi(`/api/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify({
      department: "HR Ops",
      role: "VIEWER",
    }),
  });
  assert(update.status === 200, "update user and role assignment");

  console.log("\n[FORGOT PASSWORD]");
  const forgot = await fetch(`${BASE}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: username }),
  });
  const forgotBody = await forgot.json();
  assert(forgot.status === 200, "forgot password request succeeds");
  assert(!!forgotBody.token, "reset token generated");

  const reset = await fetch(`${BASE}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: forgotBody.token,
      newPassword: "ResetPass8!",
      confirmPassword: "ResetPass8!",
    }),
  });
  const resetBody = await reset.json();
  assert(reset.status === 200 && resetBody.success, "reset password with token");

  const resetLogin = await login(username, "ResetPass8!");
  assert(resetLogin.status === 200, "login with reset password");

  console.log("\n[ADMIN RESET + FORCE CHANGE]");
  const adminReset = await adminApi(`/api/users/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({
      generateTemporary: true,
      requireChange: true,
    }),
  });
  assert(adminReset.status === 200, "admin generates temporary password");
  assert(!!adminReset.body?.temporaryPassword, "temporary password returned");

  console.log("\n[LOGIN HISTORY + ACTIVITY]");
  const history = await adminApi(`/api/users/${userId}/login-history`);
  assert(history.body?.data?.length > 0, "login history stored");

  const activity = await adminApi(`/api/users/${userId}/activity`);
  assert(Array.isArray(activity.body?.data), "user activity logs returned");

  console.log("\n[PERMISSIONS]");
  const roles = await adminApi("/api/roles");
  assert(roles.body?.data?.length >= 7, "all enterprise roles seeded");

  const permissions = await adminApi("/api/permissions");
  assert(permissions.body?.data?.length >= 20, "granular permissions stored in DB");

  console.log("\n[DASHBOARD STATS]");
  const stats = await adminApi("/api/users/stats");
  assert(stats.body?.data?.total_users >= 1, "user stats widget data");

  console.log("\n[DELETE USER]");
  const deleted = await adminApi(`/api/users/${userId}`, {
    method: "DELETE",
  });
  assert(deleted.status === 200, "delete user");

  console.log(`\nPhase 8 results: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
