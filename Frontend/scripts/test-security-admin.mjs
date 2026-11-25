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
  console.log("\n[SECURITY] bcrypt auth + audit");
  const admin = await login("admin", "admin123");
  assert(admin.status === 200, "bcrypt admin login succeeds");
  assert(admin.body?.user?.role === "SUPER_ADMIN", "admin role returned");
  const adminApi = makeApi(admin.cookie);

  const badLogin = await login("admin", "wrong-password");
  assert(badLogin.status === 401, "invalid password rejected");

  const me = await adminApi("/api/auth/me");
  assert(me.body?.user?.status === "ACTIVE", "auth/me validates active session");

  console.log("\n[USERS] create/update/reset/status");
  const username = `phase5_${Date.now().toString().slice(-6)}`;
  const initialPassword = "Phase5pass123!";
  const create = await adminApi("/api/users", {
    method: "POST",
    body: JSON.stringify({
      username,
      password: initialPassword,
      role: "EMPLOYEE",
      status: "ACTIVE",
      employee_id: null,
      location_id: 1,
    }),
  });
  assert(create.status === 201, "admin creates user");
  const userId = create.body?.data?.id;
  assert(!!userId, "created user id returned");

  const userLogin = await login(username, initialPassword);
  assert(userLogin.status === 200, "new bcrypt user can login");

  const deactivate = await adminApi(`/api/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify({ status: "INACTIVE" }),
  });
  assert(deactivate.status === 200, "admin deactivates user");

  const inactiveLogin = await login(username, initialPassword);
  assert(inactiveLogin.status === 403, "inactive user login blocked");

  const reactivate = await adminApi(`/api/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify({ status: "ACTIVE" }),
  });
  assert(reactivate.status === 200, "admin reactivates user");

  const resetPassword = "ResetPass123!";
  const reset = await adminApi(`/api/users/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({
      newPassword: resetPassword,
      requireChange: true,
    }),
  });
  assert(reset.status === 200, "admin resets password");

  const resetLogin = await login(username, resetPassword);
  assert(resetLogin.status === 200, "reset password can login");

  const userApi = makeApi(resetLogin.cookie);
  const changedPassword = "ChangedPass123!";
  const change = await userApi("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({
      currentPassword: resetPassword,
      newPassword: changedPassword,
    }),
  });
  assert(change.status === 200, "user changes own password");

  const changedLogin = await login(username, changedPassword);
  assert(changedLogin.status === 200, "changed password works");

  const manager = await login("manager1", "manager123");
  const managerApi = makeApi(manager.cookie);
  const managerUsers = await managerApi("/api/users");
  assert(managerUsers.status === 403, "manager cannot manage users");

  console.log("\n[SETTINGS] preferences + audit");
  const settings = await adminApi("/api/settings");
  assert(settings.status === 200, "admin reads settings");
  const updateSettings = await adminApi("/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      settings: {
        notification: {
          preferences: {
            emailAlerts: true,
            cameraOfflineAlerts: true,
            lateArrivalAlerts: true,
          },
        },
      },
    }),
  });
  assert(updateSettings.status === 200, "admin updates settings");

  const managerSettings = await managerApi("/api/settings");
  assert(managerSettings.status === 403, "manager cannot access settings");

  const audit = await adminApi("/api/audit-logs?limit=50");
  assert(audit.status === 200, "admin reads audit logs");
  assert(
    audit.body?.data?.some((log) => log.action === "LOGIN_SUCCESS"),
    "login audit trail present"
  );
  assert(
    audit.body?.data?.some((log) => log.action === "USER_CREATED"),
    "user management audit present"
  );
  assert(
    audit.body?.data?.some((log) => log.action === "SETTINGS_UPDATED"),
    "settings audit present"
  );

  console.log(
    `\n==== SECURITY ADMIN RESULTS: ${pass} passed, ${fail} failed ====`
  );
  if (fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
