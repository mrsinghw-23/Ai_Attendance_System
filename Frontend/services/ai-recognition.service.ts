import pool from "@/lib/db";
import {
  AIRecognitionDashboard,
  AIRecognitionSettings,
  EmbeddingSyncResult,
  UnknownFaceRecord,
} from "@/types/ai-recognition";
import { getTodayFaceEventCounts } from "@/services/face-events-cleanup.service";
import { purgeStaleFaceEvents } from "@/services/face-events-cleanup.service";

const DEFAULT_SETTINGS: AIRecognitionSettings = {
  confidenceThreshold: 0.65,
  motionSensitivity: 25,
  frameSamplingIntervalMs: 200,
  embeddingModel: "buffalo_l",
  embeddingSyncIntervalMinutes: 30,
  unknownFaceCooldownSeconds: 60,
  recognitionCooldownSeconds: 12,
  continuousScanning: false,
  storeUnknownFaces: false,
};

export async function getAIRecognitionSettings(): Promise<AIRecognitionSettings> {
  const result = await pool.query(
    `
    SELECT setting_value
    FROM system_settings
    WHERE category = 'ai' AND setting_key = 'recognition'
    `
  );

  if (!result.rows[0]?.setting_value) {
    return DEFAULT_SETTINGS;
  }

  return {
    ...DEFAULT_SETTINGS,
    ...(result.rows[0].setting_value as AIRecognitionSettings),
  };
}

export async function updateAIRecognitionSettings(
  settings: Partial<AIRecognitionSettings>
) {
  const current = await getAIRecognitionSettings();
  const merged = { ...current, ...settings };

  await pool.query(
    `
    INSERT INTO system_settings (category, setting_key, setting_value, updated_at)
    VALUES ('ai', 'recognition', $1, CURRENT_TIMESTAMP)
    ON CONFLICT (category, setting_key)
    DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP
    `,
    [JSON.stringify(merged)]
  );

  return merged;
}

async function ensureDailyStatsRow() {
  await pool.query(
    `
    INSERT INTO ai_recognition_stats (stat_date)
    VALUES (CURRENT_DATE)
    ON CONFLICT (stat_date) DO NOTHING
    `
  );
}

export async function incrementAIStat(
  field:
    | "faces_detected"
    | "faces_recognized"
    | "unknown_faces"
    | "attendance_generated"
    | "active_cameras",
  amount = 1
) {
  await ensureDailyStatsRow();
  await pool.query(
    `
    UPDATE ai_recognition_stats
    SET ${field} = ${field} + $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE stat_date = CURRENT_DATE
    `,
    [amount]
  );
}

export async function setActiveCamerasCount(count: number) {
  await ensureDailyStatsRow();
  await pool.query(
    `
    UPDATE ai_recognition_stats
    SET active_cameras = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE stat_date = CURRENT_DATE
    `,
    [count]
  );
}

export async function getAIRecognitionDashboard(): Promise<AIRecognitionDashboard> {
  await ensureDailyStatsRow();
  await purgeStaleFaceEvents();

  const [stats, liveCounts, embeddings, registered, recentUnknown, recentRecognitions, cameras] =
    await Promise.all([
      pool.query(
        `SELECT * FROM ai_recognition_stats WHERE stat_date = CURRENT_DATE`
      ),
      getTodayFaceEventCounts(),
      pool.query(`SELECT COUNT(*)::int AS count FROM face_embeddings`),
      pool.query(
        `
        SELECT COUNT(DISTINCT e.id)::int AS count
        FROM employees e
        WHERE COALESCE(e.status, 'ACTIVE') = 'ACTIVE'
          AND EXISTS (
            SELECT 1 FROM employee_face_images efi WHERE efi.employee_id = e.id
          )
          AND EXISTS (
            SELECT 1 FROM face_embeddings fem
            WHERE fem.employee_id = e.id
              AND fem.embedding_data IS NOT NULL
              AND fem.embedding_data <> ''
          )
        `
      ),
      pool.query(
        `
        SELECT
          uf.*,
          c.camera_name,
          l.location_name
        FROM unknown_faces uf
        LEFT JOIN cameras c ON c.id = uf.camera_id
        LEFT JOIN locations l ON l.id = uf.location_id
        ORDER BY uf.detected_at DESC
        LIMIT 10
        `
      ),
      pool.query(
        `
        SELECT
          fe.id,
          fe.confidence,
          fe.event_time,
          c.camera_name,
          TRIM(CONCAT(
            COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''),
            ' ',
            COALESCE(e.last_name, '')
          )) AS employee_name
        FROM face_events fe
        LEFT JOIN cameras c ON c.id = fe.camera_id
        LEFT JOIN employees e ON e.id = fe.employee_id
        WHERE fe.event_type = 'FACE_RECOGNIZED'
          AND fe.event_time::date = CURRENT_DATE
        ORDER BY fe.event_time DESC
        LIMIT 10
        `
      ),
      pool.query(
        `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE health_status = 'ONLINE')::int AS online
        FROM cameras
        WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE'
        `
      ),
    ]);

  const row = stats.rows[0] || {};
  const live = liveCounts as Record<string, number>;

  return {
    faces_detected: Number(live.faces_detected_unique || 0),
    faces_detected_total: Number(live.faces_detected_total || 0),
    faces_recognized: Number(live.faces_recognized_unique || 0),
    faces_recognized_total: Number(live.faces_recognized_total || 0),
    unknown_faces: Number(row.unknown_faces || 0),
    attendance_generated: Number(row.attendance_generated || 0),
    active_cameras: Number(row.active_cameras || cameras.rows[0]?.online || 0),
    total_cameras: Number(cameras.rows[0]?.total || 0),
    embeddings_count: Number(embeddings.rows[0]?.count || 0),
    registered_employees: Number(registered.rows[0]?.count || 0),
    recent_unknown: recentUnknown.rows.map(mapUnknownFace),
    recent_recognitions: recentRecognitions.rows.map((item) => ({
      id: item.id as number,
      employee_name: (item.employee_name as string) || null,
      camera_name: (item.camera_name as string) || null,
      confidence: item.confidence != null ? Number(item.confidence) : null,
      event_time: String(item.event_time),
    })),
  };
}

function mapUnknownFace(row: Record<string, unknown>): UnknownFaceRecord {
  return {
    id: row.id as number,
    camera_id: (row.camera_id as number) || null,
    camera_name: (row.camera_name as string) || null,
    location_id: (row.location_id as number) || null,
    location_name: (row.location_name as string) || null,
    image_path: row.image_path as string,
    confidence: row.confidence != null ? Number(row.confidence) : null,
    detected_at: String(row.detected_at),
  };
}

export async function listUnknownFaces(limit = 50) {
  const result = await pool.query(
    `
    SELECT
      uf.*,
      c.camera_name,
      l.location_name
    FROM unknown_faces uf
    LEFT JOIN cameras c ON c.id = uf.camera_id
    LEFT JOIN locations l ON l.id = uf.location_id
    ORDER BY uf.detected_at DESC
    LIMIT $1
    `,
    [limit]
  );

  return result.rows.map(mapUnknownFace);
}

export async function deleteUnknownFace(id: number) {
  const result = await pool.query(
    `SELECT id, image_path FROM unknown_faces WHERE id = $1`,
    [id]
  );

  if (!result.rows[0]) {
    return { deleted: false, reason: "NOT_FOUND" as const };
  }

  const imagePath = String(result.rows[0].image_path || "");
  await pool.query(`DELETE FROM unknown_faces WHERE id = $1`, [id]);

  if (imagePath.startsWith("/uploads/")) {
    const fs = await import("fs/promises");
    const path = await import("path");
    try {
      await fs.unlink(path.join(process.cwd(), "public", imagePath));
    } catch {
      // ignore missing file
    }
  }

  return { deleted: true };
}

export async function deleteAllTodayUnknownFaces(locationId?: number | null) {
  return deleteAllUnknownFaces({ locationId, scope: "today" });
}

export async function deleteAllUnknownFaces(options?: {
  locationId?: number | null;
  scope?: "today" | "all";
}) {
  const scope = options?.scope ?? "all";
  const locationId = options?.locationId ?? null;
  const values: unknown[] = [];
  let whereClause = "WHERE 1=1";

  if (scope === "today") {
    whereClause += " AND detected_at::date = CURRENT_DATE";
  }

  if (locationId) {
    values.push(locationId);
    whereClause += ` AND location_id = $${values.length}`;
  }

  const rows = await pool.query(
    `
    SELECT id, image_path
    FROM unknown_faces
    ${whereClause}
    `,
    values
  );

  for (const row of rows.rows) {
    await deleteUnknownFace(row.id as number);
  }

  await pool.query(
    `
    UPDATE ai_recognition_stats
    SET unknown_faces = GREATEST(
          unknown_faces - $1,
          0
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE stat_date = CURRENT_DATE
    `,
    [rows.rows.length]
  );

  if (scope === "all") {
    await pool.query(
      `
      UPDATE ai_recognition_stats
      SET unknown_faces = 0,
          updated_at = CURRENT_TIMESTAMP
      `
    );
  }

  return { deleted: rows.rows.length, scope };
}

export async function recordUnknownFace(input: {
  cameraId?: number | null;
  locationId?: number | null;
  imagePath: string;
  confidence?: number | null;
  metadata?: Record<string, unknown>;
}) {
  const result = await pool.query(
    `
    INSERT INTO unknown_faces (
      camera_id, location_id, image_path, confidence, metadata
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [
      input.cameraId || null,
      input.locationId || null,
      input.imagePath,
      input.confidence ?? null,
      JSON.stringify(input.metadata || {}),
    ]
  );

  await incrementAIStat("unknown_faces");
  await incrementAIStat("faces_detected");

  return mapUnknownFace(result.rows[0]);
}

export async function recordServiceRecognition(
  eventType: string
) {
  if (eventType === "FACE_DETECTED") {
    await incrementAIStat("faces_detected");
    return;
  }

  if (eventType === "FACE_RECOGNIZED") {
    await incrementAIStat("faces_recognized");
    await incrementAIStat("faces_detected");
  }
}

export async function getEmbeddingSyncStatus(): Promise<EmbeddingSyncResult> {
  const result = await pool.query(
    `
    SELECT
      COUNT(*)::int AS embeddings_count,
      COUNT(DISTINCT employee_id)::int AS employees_covered,
      MAX(model_name) AS model_name
    FROM face_embeddings
    `
  );

  const images = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM employee_face_images efi
    JOIN employee_face_profiles efp ON efp.id = efi.face_profile_id
    WHERE COALESCE(efp.active, TRUE) = TRUE
      AND efp.profile_status NOT IN ('NOT_REGISTERED', 'FAILED', 'PENDING')
    `
  );

  return {
    images_processed: Number(images.rows[0]?.count || 0),
    embeddings_created: Number(result.rows[0]?.embeddings_count || 0),
    embeddings_updated: Number(result.rows[0]?.embeddings_count || 0),
    employees_covered: Number(result.rows[0]?.employees_covered || 0),
    model_name: (result.rows[0]?.model_name as string) || "buffalo_l",
  };
}
