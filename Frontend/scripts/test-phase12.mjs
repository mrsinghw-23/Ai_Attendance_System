const BASE = "http://localhost:3000";
const AI_KEY =
  process.env.AI_SERVICE_API_KEY || "ai-service-local-key-change-me";

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
  console.log("Phase 12 – Production AI Face Recognition Tests\n");

  const auth = await login("admin", "admin123");
  assert(auth.status === 200, "Admin login");
  const api = makeApi(auth.cookie);

  const dashboard = await api("/api/ai/recognition/dashboard");
  assert(dashboard.status === 200, "GET /api/ai/recognition/dashboard");
  assert(dashboard.body?.success === true, "Recognition dashboard success");
  assert(
    typeof dashboard.body?.data?.faces_detected === "number",
    "Dashboard includes faces_detected"
  );
  assert(
    typeof dashboard.body?.data?.embeddings_count === "number",
    "Dashboard includes embeddings_count"
  );

  const settings = await api("/api/ai/recognition/settings");
  assert(settings.status === 200, "GET /api/ai/recognition/settings");
  assert(
    settings.body?.data?.settings?.confidenceThreshold != null,
    "Recognition settings loaded"
  );

  const unknown = await api("/api/ai/recognition/unknown-faces");
  assert(unknown.status === 200, "GET /api/ai/recognition/unknown-faces");
  assert(Array.isArray(unknown.body?.data), "Unknown faces list is array");

  const faceEvent = await fetch(`${BASE}/api/ai/face-events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ai-service-key": AI_KEY,
    },
    body: JSON.stringify({
      employee_id: 1,
      event_time: new Date().toISOString(),
      confidence: 0.92,
      event_type: "FACE_RECOGNIZED",
      metadata: { source: "phase12-test" },
    }),
  });
  const faceEventBody = await faceEvent.json();
  assert(faceEvent.status === 201, "Service key face event ingest");
  assert(faceEventBody?.success === true, "Face event ingest success");

  const engine = await fetch(`${BASE}/api/attendance/engine/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ai-service-key": AI_KEY,
    },
    body: JSON.stringify({ limit: 10 }),
  });
  const engineBody = await engine.json();
  assert(engine.status === 200, "Service key attendance engine process");
  assert(engineBody?.success === true, "Attendance engine process success");

  const noKey = await fetch(`${BASE}/api/ai/face-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_time: new Date().toISOString(),
      event_type: "FACE_DETECTED",
    }),
  });
  assert(noKey.status === 401, "Face event without auth rejected");

  const unauthorizedSettings = await fetch(`${BASE}/api/ai/recognition/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      confidenceThreshold: 0.7,
      motionSensitivity: 30,
    }),
  });
  assert(
    unauthorizedSettings.status === 401,
    "Unauthenticated AI settings update rejected"
  );

  const adminSettings = await fetch(`${BASE}/api/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: auth.cookie,
    },
    body: JSON.stringify({
      settings: {
        ai: {
          recognition: {
            confidenceThreshold: 0.68,
            motionSensitivity: 28,
            frameSamplingIntervalMs: 600,
          },
        },
      },
    }),
  });
  const adminSettingsBody = await adminSettings.json();
  assert(adminSettings.status === 200, "Admin can save AI settings via /api/settings");
  assert(
    adminSettingsBody?.data?.ai?.recognition?.confidenceThreshold === 0.68,
    "AI settings persisted"
  );

  console.log(`\nResults: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
