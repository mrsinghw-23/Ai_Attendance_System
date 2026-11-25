import pool from "@/lib/db";
import {
  Camera,
  CameraListParams,
  CameraStats,
  LocationCameraReport,
  CameraDiagnostics,
} from "@/types/camera";
import {
  CreateCameraInput,
  UpdateCameraInput,
} from "@/schemas/camera.schema";
import {
  encryptSecret,
  hasEncryptedSecret,
} from "@/utils/crypto";

const CAMERA_SELECT = `
  SELECT
    c.id,
    c.camera_name,
    c.camera_code,
    c.camera_type,
    c.brand,
    c.model,
    c.serial_number,
    c.camera_ip,
    c.http_port,
    c.port,
    c.rtsp_channel,
    c.rtsp_subtype,
    c.rtsp_url,
    c.rtsp_username,
    c.rtsp_password_enc,
    c.firmware,
    c.onvif_version,
    c.last_diagnostics,
    COALESCE(c.reconnect_count, 0) AS reconnect_count,
    c.location_id,
    l.location_name,
    c.zone_id,
    z.zone_name,
    c.floor,
    COALESCE(c.entry_exit_type, 'NONE') AS entry_exit_type,
    COALESCE(c.status, 'ACTIVE') AS status,
    COALESCE(c.health_status, 'UNKNOWN') AS health_status,
    c.last_seen,
    COALESCE(c.recording_status, 'NOT_RECORDING') AS recording_status,
    c.installation_date,
    c.warranty_date,
    COALESCE(c.motion_enabled, FALSE) AS motion_enabled,
    COALESCE(c.motion_sensitivity, 50) AS motion_sensitivity,
    c.last_motion_detected,
    c.created_at,
    c.updated_at
  FROM cameras c
  LEFT JOIN locations l ON l.id = c.location_id
  LEFT JOIN camera_zones z ON z.id = c.zone_id
`;

function mapCamera(row: Record<string, unknown>): Camera {
  return {
    id: row.id as number,
    camera_name: row.camera_name as string,
    camera_code: (row.camera_code as string) || null,
    camera_type: (row.camera_type as string) || null,
    brand: (row.brand as string) || null,
    model: (row.model as string) || null,
    serial_number: (row.serial_number as string) || null,
    camera_ip: (row.camera_ip as string) || null,
    http_port: row.http_port != null ? Number(row.http_port) : 80,
    port: row.port != null ? Number(row.port) : 554,
    rtsp_channel: row.rtsp_channel != null ? Number(row.rtsp_channel) : 1,
    rtsp_subtype: row.rtsp_subtype != null ? Number(row.rtsp_subtype) : 0,
    rtsp_url: sanitizeRtspUrlForApi((row.rtsp_url as string) || null),
    rtsp_username: (row.rtsp_username as string) || null,
    has_rtsp_password: hasEncryptedSecret(
      row.rtsp_password_enc as string | null
    ),
    firmware: (row.firmware as string) || null,
    onvif_version: (row.onvif_version as string) || null,
    last_diagnostics: (row.last_diagnostics as Camera["last_diagnostics"]) || null,
    reconnect_count: Number(row.reconnect_count || 0),
    location_id: (row.location_id as number) || null,
    location_name: (row.location_name as string) || null,
    zone_id: (row.zone_id as number) || null,
    zone_name: (row.zone_name as string) || null,
    floor: (row.floor as string) || null,
    entry_exit_type: row.entry_exit_type as Camera["entry_exit_type"],
    status: row.status as Camera["status"],
    health_status: row.health_status as Camera["health_status"],
    last_seen: row.last_seen ? String(row.last_seen) : null,
    recording_status: row.recording_status as Camera["recording_status"],
    installation_date: row.installation_date
      ? String(row.installation_date).slice(0, 10)
      : null,
    warranty_date: row.warranty_date
      ? String(row.warranty_date).slice(0, 10)
      : null,
    motion_enabled: Boolean(row.motion_enabled),
    motion_sensitivity: Number(row.motion_sensitivity || 50),
    last_motion_detected: row.last_motion_detected
      ? String(row.last_motion_detected)
      : null,
    created_at: String(row.created_at),
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
}

import {
  buildStoredRtspUrl,
  parseDirectRtspUrl,
  sanitizeRtspUrlForApi,
} from "@/utils/rtsp-url";

interface ListOptions extends CameraListParams {
  managerLocationId?: number | null;
}

export async function getCameras(options: ListOptions = {}) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (options.managerLocationId) {
    conditions.push(`c.location_id = $${paramIndex++}`);
    values.push(options.managerLocationId);
  }

  if (options.search) {
    conditions.push(`(
      c.camera_name ILIKE $${paramIndex} OR
      c.camera_code ILIKE $${paramIndex} OR
      c.camera_ip ILIKE $${paramIndex} OR
      c.brand ILIKE $${paramIndex} OR
      c.model ILIKE $${paramIndex}
    )`);
    values.push(`%${options.search}%`);
    paramIndex++;
  }

  if (options.status) {
    conditions.push(`COALESCE(c.status, 'ACTIVE') = $${paramIndex++}`);
    values.push(options.status);
  }

  if (options.location_id) {
    conditions.push(`c.location_id = $${paramIndex++}`);
    values.push(options.location_id);
  }

  if (options.zone_id) {
    conditions.push(`c.zone_id = $${paramIndex++}`);
    values.push(options.zone_id);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `
    ${CAMERA_SELECT}
    ${whereClause}
    ORDER BY c.camera_name ASC
    `,
    values
  );

  return result.rows.map(mapCamera);
}

export async function getCameraById(
  id: number,
  managerLocationId?: number | null
) {
  const conditions = ["c.id = $1"];
  const values: unknown[] = [id];

  if (managerLocationId) {
    conditions.push("c.location_id = $2");
    values.push(managerLocationId);
  }

  const result = await pool.query(
    `
    ${CAMERA_SELECT}
    WHERE ${conditions.join(" AND ")}
    `,
    values
  );

  if (!result.rows[0]) return null;
  return mapCamera(result.rows[0]);
}

export async function getCameraStats(
  managerLocationId?: number | null
): Promise<CameraStats> {
  const values: unknown[] = [];
  let whereClause = "";

  if (managerLocationId) {
    whereClause = "WHERE c.location_id = $1";
    values.push(managerLocationId);
  }

  const result = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE COALESCE(c.status,'ACTIVE') = 'ACTIVE')::int AS active,
      COUNT(*) FILTER (WHERE COALESCE(c.status,'ACTIVE') = 'INACTIVE')::int AS inactive,
      COUNT(*) FILTER (WHERE c.health_status = 'ONLINE')::int AS online,
      COUNT(*) FILTER (WHERE c.health_status = 'OFFLINE')::int AS offline,
      COUNT(*) FILTER (WHERE c.health_status = 'WARNING')::int AS warning,
      COUNT(*) FILTER (WHERE c.health_status = 'MAINTENANCE')::int AS maintenance,
      COUNT(*) FILTER (WHERE c.health_status IN ('OFFLINE','WARNING'))::int AS errors,
      COUNT(*) FILTER (WHERE c.recording_status = 'RECORDING')::int AS recording
    FROM cameras c
    ${whereClause}
    `,
    values
  );

  return result.rows[0] as CameraStats;
}

export async function getLocationCameraReport(
  managerLocationId?: number | null
): Promise<LocationCameraReport[]> {
  const values: unknown[] = [];
  let whereClause = "";

  if (managerLocationId) {
    whereClause = "WHERE l.id = $1";
    values.push(managerLocationId);
  }

  const result = await pool.query(
    `
    SELECT
      l.id AS location_id,
      l.location_name,
      COUNT(c.id)::int AS total,
      COUNT(c.id) FILTER (WHERE c.health_status = 'ONLINE')::int AS online,
      COUNT(c.id) FILTER (WHERE COALESCE(c.status,'ACTIVE') = 'ACTIVE')::int AS active
    FROM locations l
    LEFT JOIN cameras c ON c.location_id = l.id
    ${whereClause}
    GROUP BY l.id
    ORDER BY l.location_name ASC
    `,
    values
  );

  return result.rows as LocationCameraReport[];
}

function prepareCameraConnection<
  T extends {
    camera_ip?: string | null;
    port?: number | null;
    http_port?: number | null;
    rtsp_channel?: number | null;
    rtsp_subtype?: number | null;
    rtsp_username?: string | null;
    rtsp_password?: string | null;
    brand?: string | null;
    firmware?: string | null;
    onvif_version?: string | null;
    rtsp_direct_url?: string | null;
  },
>(input: T): T & {
  rtsp_url: string | null;
  rtsp_password?: string | null;
} {
  if (input.rtsp_direct_url?.trim()) {
    const parsed = parseDirectRtspUrl(input.rtsp_direct_url);
    if (parsed) {
      return {
        ...input,
        camera_ip: parsed.camera_ip,
        port: parsed.port,
        rtsp_channel: parsed.rtsp_channel,
        rtsp_subtype: parsed.rtsp_subtype,
        rtsp_username: parsed.rtsp_username || input.rtsp_username,
        rtsp_password: parsed.rtsp_password || input.rtsp_password,
        rtsp_url: parsed.rtsp_url,
      };
    }
  }

  const rtsp_url = buildStoredRtspUrl({
    camera_ip: input.camera_ip,
    port: input.port,
    rtsp_channel: input.rtsp_channel,
    rtsp_subtype: input.rtsp_subtype,
    brand: input.brand,
  });
  return { ...input, rtsp_url };
}

export async function saveCameraDiagnostics(
  cameraId: number,
  diagnostics: CameraDiagnostics
) {
  await pool.query(
    `
    UPDATE cameras
    SET
      last_diagnostics = COALESCE(last_diagnostics, '{}'::jsonb) || $2::jsonb,
      health_status = $3::varchar,
      last_seen = CASE WHEN $3::varchar = 'ONLINE' THEN CURRENT_TIMESTAMP ELSE last_seen END,
      firmware = COALESCE($4, firmware),
      onvif_version = COALESCE($5, onvif_version),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    `,
    [
      cameraId,
      JSON.stringify({ ...diagnostics, checked_at: new Date().toISOString() }),
      diagnostics.health_status || "UNKNOWN",
      diagnostics.firmware || null,
      diagnostics.onvif_version || null,
    ]
  );
}

export async function createCamera(input: CreateCameraInput) {
  const prepared = prepareCameraConnection(input);
  const passwordEnc = prepared.rtsp_password
    ? encryptSecret(prepared.rtsp_password)
    : null;

  const result = await pool.query(
    `
    INSERT INTO cameras (
      camera_name, camera_code, camera_type, brand, model, serial_number,
      camera_ip, http_port, port, rtsp_channel, rtsp_subtype,
      rtsp_url, rtsp_username, rtsp_password_enc,
      firmware, onvif_version,
      location_id, zone_id, floor, entry_exit_type,
      status, health_status, recording_status,
      installation_date, warranty_date,
      motion_enabled, motion_sensitivity, updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13, $14,
      $15, $16,
      $17, $18, $19, $20,
      $21, $22, $23,
      $24, $25,
      $26, $27, CURRENT_TIMESTAMP
    )
    RETURNING id
    `,
    [
      prepared.camera_name,
      prepared.camera_code || null,
      "IP Camera",
      prepared.brand || null,
      prepared.model || null,
      prepared.serial_number || null,
      prepared.camera_ip || null,
      prepared.http_port ?? 80,
      prepared.port ?? 554,
      prepared.rtsp_channel ?? 1,
      prepared.rtsp_subtype ?? 0,
      prepared.rtsp_url || null,
      prepared.rtsp_username || null,
      passwordEnc,
      prepared.firmware || null,
      prepared.onvif_version || null,
      prepared.location_id || null,
      prepared.zone_id || null,
      prepared.floor || null,
      prepared.entry_exit_type || "NONE",
      prepared.status || "ACTIVE",
      prepared.health_status || "UNKNOWN",
      prepared.recording_status || "NOT_RECORDING",
      prepared.installation_date || null,
      prepared.warranty_date || null,
      prepared.motion_enabled ?? true,
      prepared.motion_sensitivity ?? 50,
    ]
  );

  return getCameraById(result.rows[0].id);
}

export async function updateCamera(id: number, input: UpdateCameraInput) {
  const existing = await getCameraById(id);
  if (!existing) return null;

  const merged = prepareCameraConnection({
    camera_ip: input.camera_ip ?? existing.camera_ip,
    port: input.port ?? existing.port,
    http_port: input.http_port ?? existing.http_port,
    rtsp_channel: input.rtsp_channel ?? existing.rtsp_channel,
    rtsp_subtype: input.rtsp_subtype ?? existing.rtsp_subtype,
    rtsp_username: input.rtsp_username ?? existing.rtsp_username,
    rtsp_password: input.rtsp_password,
    brand: input.brand ?? existing.brand,
    firmware: input.firmware ?? existing.firmware,
    onvif_version: input.onvif_version ?? existing.onvif_version,
    rtsp_direct_url: input.rtsp_direct_url,
  });

  const updates = new Map<string, unknown>();

  const setColumn = (column: string, value: unknown) => {
    updates.set(column, value);
  };

  const hasDirectUrl = Boolean(input.rtsp_direct_url?.trim());

  if (hasDirectUrl) {
    setColumn("camera_ip", merged.camera_ip || null);
    setColumn("port", merged.port ?? 554);
    setColumn("rtsp_channel", merged.rtsp_channel ?? 1);
    setColumn("rtsp_subtype", merged.rtsp_subtype ?? 0);
    if (merged.rtsp_username) setColumn("rtsp_username", merged.rtsp_username);
    setColumn("rtsp_url", merged.rtsp_url || null);
  }

  if (input.camera_name !== undefined) setColumn("camera_name", input.camera_name);
  if (input.camera_code !== undefined) setColumn("camera_code", input.camera_code || null);
  if (input.brand !== undefined) setColumn("brand", input.brand || null);
  if (input.model !== undefined) setColumn("model", input.model || null);
  if (input.serial_number !== undefined) setColumn("serial_number", input.serial_number || null);
  if (input.camera_ip !== undefined) setColumn("camera_ip", input.camera_ip || null);
  if (input.http_port !== undefined) setColumn("http_port", input.http_port);
  if (input.port !== undefined) setColumn("port", input.port);
  if (input.rtsp_channel !== undefined) setColumn("rtsp_channel", input.rtsp_channel);
  if (input.rtsp_subtype !== undefined) setColumn("rtsp_subtype", input.rtsp_subtype);

  const shouldRefreshRtspUrl =
    input.camera_ip !== undefined ||
    input.port !== undefined ||
    input.rtsp_channel !== undefined ||
    input.rtsp_subtype !== undefined ||
    input.brand !== undefined ||
    hasDirectUrl;

  if (shouldRefreshRtspUrl) {
    setColumn("rtsp_url", merged.rtsp_url || null);
  }

  if (input.rtsp_username !== undefined) setColumn("rtsp_username", input.rtsp_username || null);
  if (merged.rtsp_password?.trim()) {
    setColumn("rtsp_password_enc", encryptSecret(merged.rtsp_password));
  } else if (input.rtsp_password !== undefined && input.rtsp_password) {
    setColumn("rtsp_password_enc", encryptSecret(input.rtsp_password));
  }
  if (input.firmware !== undefined) setColumn("firmware", input.firmware || null);
  if (input.onvif_version !== undefined) setColumn("onvif_version", input.onvif_version || null);
  if (input.location_id !== undefined) setColumn("location_id", input.location_id);
  if (input.zone_id !== undefined) setColumn("zone_id", input.zone_id);
  if (input.floor !== undefined) setColumn("floor", input.floor || null);
  if (input.entry_exit_type !== undefined) setColumn("entry_exit_type", input.entry_exit_type);
  if (input.status !== undefined) setColumn("status", input.status);
  if (input.health_status !== undefined) setColumn("health_status", input.health_status);
  if (input.recording_status !== undefined) setColumn("recording_status", input.recording_status);
  if (input.installation_date !== undefined) setColumn("installation_date", input.installation_date || null);
  if (input.warranty_date !== undefined) setColumn("warranty_date", input.warranty_date || null);
  if (input.motion_enabled !== undefined) setColumn("motion_enabled", input.motion_enabled);
  if (input.motion_sensitivity !== undefined) setColumn("motion_sensitivity", input.motion_sensitivity);

  if (updates.size === 0) return existing;

  const columns = Array.from(updates.keys());
  const values = Array.from(updates.values());
  const setClauses = columns.map((column, index) => `${column} = $${index + 1}`);
  setClauses.push("updated_at = CURRENT_TIMESTAMP");

  const idPlaceholder = values.length + 1;
  values.push(id);

  const sql = `UPDATE cameras SET ${setClauses.join(", ")} WHERE id = $${idPlaceholder}`;

  console.log("[updateCamera] SQL:", sql);
  console.log("[updateCamera] values:", values);

  await pool.query(sql, values);

  return getCameraById(id);
}

export async function deleteCamera(id: number) {
  const existing = await getCameraById(id);
  if (!existing) return false;
  await pool.query("DELETE FROM cameras WHERE id = $1", [id]);
  return true;
}

export async function cameraNameExists(name: string, excludeId?: number) {
  const values: unknown[] = [name];
  let query =
    "SELECT id FROM cameras WHERE LOWER(camera_name) = LOWER($1)";

  if (excludeId) {
    query += " AND id != $2";
    values.push(excludeId);
  }

  const result = await pool.query(query, values);
  return result.rows.length > 0;
}

export async function cameraCodeExists(code: string, excludeId?: number) {
  if (!code) return false;
  const values: unknown[] = [code];
  let query =
    "SELECT id FROM cameras WHERE LOWER(camera_code) = LOWER($1)";

  if (excludeId) {
    query += " AND id != $2";
    values.push(excludeId);
  }

  const result = await pool.query(query, values);
  return result.rows.length > 0;
}

export async function getCameraCredentialsForHealth(id: number) {
  const result = await pool.query(
    `
    SELECT camera_ip, port, rtsp_url, rtsp_username, rtsp_password_enc, health_status
    FROM cameras WHERE id = $1
    `,
    [id]
  );
  return result.rows[0] as Record<string, unknown> | undefined;
}
