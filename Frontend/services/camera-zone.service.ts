import pool from "@/lib/db";
import { CameraZone } from "@/types/camera";
import {
  CreateCameraZoneInput,
  UpdateCameraZoneInput,
} from "@/schemas/camera.schema";

const ZONE_SELECT = `
  SELECT
    z.id,
    z.zone_name,
    z.location_id,
    l.location_name,
    z.description,
    z.floor,
    COALESCE(z.status, 'ACTIVE') AS status,
    z.created_at,
    z.updated_at,
    COUNT(c.id)::int AS camera_count
  FROM camera_zones z
  LEFT JOIN locations l ON l.id = z.location_id
  LEFT JOIN cameras c ON c.zone_id = z.id
`;

function mapZone(row: Record<string, unknown>): CameraZone {
  return {
    id: row.id as number,
    zone_name: row.zone_name as string,
    location_id: (row.location_id as number) || null,
    location_name: (row.location_name as string) || null,
    description: (row.description as string) || null,
    floor: (row.floor as string) || null,
    status: row.status as string,
    camera_count: Number(row.camera_count || 0),
    created_at: String(row.created_at),
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
}

export async function getCameraZones(options: {
  locationId?: number;
  managerLocationId?: number | null;
} = {}) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (options.managerLocationId) {
    conditions.push(
      `(z.location_id = $${paramIndex} OR z.location_id IS NULL)`
    );
    values.push(options.managerLocationId);
    paramIndex++;
  } else if (options.locationId) {
    conditions.push(
      `(z.location_id = $${paramIndex} OR z.location_id IS NULL)`
    );
    values.push(options.locationId);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `
    ${ZONE_SELECT}
    ${whereClause}
    GROUP BY z.id, l.location_name
    ORDER BY z.zone_name ASC
    `,
    values
  );

  return result.rows.map(mapZone);
}

export async function getCameraZoneById(id: number) {
  const result = await pool.query(
    `
    ${ZONE_SELECT}
    WHERE z.id = $1
    GROUP BY z.id, l.location_name
    `,
    [id]
  );

  if (!result.rows[0]) return null;
  return mapZone(result.rows[0]);
}

export async function createCameraZone(input: CreateCameraZoneInput) {
  const result = await pool.query(
    `
    INSERT INTO camera_zones (
      zone_name, location_id, description, floor, status, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    RETURNING id
    `,
    [
      input.zone_name,
      input.location_id || null,
      input.description || null,
      input.floor || null,
      input.status || "ACTIVE",
    ]
  );

  return getCameraZoneById(result.rows[0].id);
}

export async function updateCameraZone(
  id: number,
  input: UpdateCameraZoneInput
) {
  const existing = await getCameraZoneById(id);
  if (!existing) return null;

  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const setField = (column: string, value: unknown) => {
    fields.push(`${column} = $${paramIndex++}`);
    values.push(value);
  };

  if (input.zone_name !== undefined) setField("zone_name", input.zone_name);
  if (input.location_id !== undefined) setField("location_id", input.location_id);
  if (input.description !== undefined) setField("description", input.description || null);
  if (input.floor !== undefined) setField("floor", input.floor || null);
  if (input.status !== undefined) setField("status", input.status);

  if (fields.length === 0) return existing;

  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  await pool.query(
    `UPDATE camera_zones SET ${fields.join(", ")} WHERE id = $${paramIndex}`,
    values
  );

  return getCameraZoneById(id);
}

export async function deleteCameraZone(id: number) {
  const existing = await getCameraZoneById(id);
  if (!existing) return false;

  await pool.query(
    "UPDATE cameras SET zone_id = NULL WHERE zone_id = $1",
    [id]
  );
  await pool.query("DELETE FROM camera_zones WHERE id = $1", [id]);
  return true;
}
