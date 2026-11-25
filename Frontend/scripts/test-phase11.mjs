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

function createValidTestImageBuffer() {
  const width = 400;
  const height = 400;
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4);
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8;
  ihdr[17] = 2;
  ihdr.writeUInt32BE(0, 21);

  const payload = Buffer.alloc(50000);
  for (let i = 0; i < payload.length; i++) {
    payload[i] = (i * 31 + 120) % 256;
  }

  return Buffer.concat([signature, ihdr, payload]);
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

async function uploadFaceImage(api, employeeId, imageType) {
  const formData = new FormData();
  const blob = new Blob([createValidTestImageBuffer()], { type: "image/png" });
  formData.append("image", blob, `${imageType.toLowerCase()}.png`);
  formData.append("image_type", imageType);

  return api(`/api/face-registration/employees/${employeeId}/images`, {
    method: "POST",
    body: formData,
  });
}

async function main() {
  console.log("\n[PHASE 11] Face Registration Module");

  const admin = await login("admin", "admin123");
  assert(admin.status === 200, "admin login succeeds");
  const adminApi = makeApi(admin.cookie);

  console.log("\n[STATS] face registration dashboard stats");
  const stats = await adminApi("/api/face-registration/stats");
  assert(stats.body?.success, "face registration stats load");
  assert(
    typeof stats.body?.data?.registration_percentage === "number",
    "stats include registration percentage"
  );

  const employees = await adminApi("/api/employees?limit=1");
  const employeeId = employees.body?.data?.[0]?.id || 1;

  console.log("\n[PROFILE] create/read face profile");
  const profileBefore = await adminApi(
    `/api/face-registration/employees/${employeeId}`
  );
  assert(profileBefore.body?.success, "get employee face profile");

  console.log("\n[UPLOAD] required face image types");
  for (const type of ["FRONT", "LEFT", "RIGHT", "UP", "DOWN"]) {
    const upload = await uploadFaceImage(adminApi, employeeId, type);
    assert(upload.status === 201, `upload ${type} face image`);
  }

  const profileAfter = await adminApi(
    `/api/face-registration/employees/${employeeId}`
  );
  assert(
    profileAfter.body?.data?.profile_status === "FULLY_REGISTERED",
    "profile becomes fully registered after 5 samples"
  );
  assert(
    profileAfter.body?.data?.images?.length >= 5,
    "profile stores uploaded images"
  );

  const imageId = profileAfter.body?.data?.images?.[0]?.id;
  if (imageId) {
    const replace = await (async () => {
      const formData = new FormData();
      const blob = new Blob([createValidTestImageBuffer()], {
        type: "image/png",
      });
      formData.append("image", blob, "replace.png");
      return adminApi(`/api/face-registration/images/${imageId}`, {
        method: "PUT",
        body: formData,
      });
    })();
    assert(replace.body?.success, "replace face image");

    const deleteId = replace.body?.data?.image?.id || imageId;
    const deleted = await adminApi(`/api/face-registration/images/${deleteId}`, {
      method: "DELETE",
    });
    assert(deleted.body?.success, "delete face image");
  }

  console.log("\n[QUALITY] reject invalid upload");
  const badForm = new FormData();
  badForm.append("image", new Blob([Buffer.from("not-an-image")]), "bad.txt");
  badForm.append("image_type", "ADDITIONAL");
  const badUpload = await adminApi(
    `/api/face-registration/employees/${employeeId}/images`,
    { method: "POST", body: badForm }
  );
  assert(badUpload.status === 422, "reject poor quality/invalid image");

  console.log("\n[REPORTS] face registration reports");
  for (const type of [
    "face_registration",
    "missing_face_profiles",
    "registration_progress",
  ]) {
    const report = await adminApi(`/api/reports?type=${type}`);
    assert(report.body?.success, `report ${type} loads`);
  }

  console.log("\n[DASHBOARD] overview includes face registration");
  const overview = await adminApi("/api/dashboard/overview");
  assert(overview.body?.data?.face_registration, "dashboard overview includes face stats");

  console.log(`\nPhase 11 results: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
