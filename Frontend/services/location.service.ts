import pool from "@/lib/db";
import {
  Location,
  LocationWithStats,
} from "@/types/location";
import {
  CreateLocationInput,
  UpdateLocationInput,
} from "@/schemas/location.schema";

export async function getLocations() {
  const result = await pool.query(
    `
    SELECT id, location_name, city, state, created_at
    FROM locations
    ORDER BY location_name ASC
    `
  );

  return result.rows as Location[];
}

export async function getLocationsWithStats() {
  const result = await pool.query(
    `
    SELECT
      l.id,
      l.location_name,
      l.city,
      l.state,
      l.created_at,
      COUNT(DISTINCT e.id)::int AS employee_count,
      COUNT(DISTINCT c.id)::int AS camera_count
    FROM locations l
    LEFT JOIN employees e ON e.location_id = l.id
    LEFT JOIN cameras c ON c.location_id = l.id
    GROUP BY l.id
    ORDER BY l.location_name ASC
    `
  );

  return result.rows as LocationWithStats[];
}

export async function getLocationById(
  id: number
) {
  const result = await pool.query(
    `
    SELECT id, location_name, city, state, created_at
    FROM locations
    WHERE id = $1
    `,
    [id]
  );

  return (result.rows[0] as Location) || null;
}

export async function getLocationWithStats(
  id: number
) {
  const result = await pool.query(
    `
    SELECT
      l.id,
      l.location_name,
      l.city,
      l.state,
      l.created_at,
      COUNT(DISTINCT e.id)::int AS employee_count,
      COUNT(DISTINCT c.id)::int AS camera_count
    FROM locations l
    LEFT JOIN employees e ON e.location_id = l.id
    LEFT JOIN cameras c ON c.location_id = l.id
    WHERE l.id = $1
    GROUP BY l.id
    `,
    [id]
  );

  return (
    (result.rows[0] as LocationWithStats) || null
  );
}

export async function getLocationEmployees(
  locationId: number
) {
  const result = await pool.query(
    `
    SELECT
      id,
      employee_code,
      COALESCE(first_name, SPLIT_PART(name, ' ', 1)) AS first_name,
      COALESCE(last_name, '') AS last_name,
      department,
      designation,
      COALESCE(status, 'ACTIVE') AS status
    FROM employees
    WHERE location_id = $1
    ORDER BY first_name, last_name
    `,
    [locationId]
  );

  return result.rows;
}

export async function getLocationCameras(
  locationId: number
) {
  const result = await pool.query(
    `
    SELECT id, camera_name, camera_ip, status
    FROM cameras
    WHERE location_id = $1
    ORDER BY camera_name
    `,
    [locationId]
  );

  return result.rows;
}

export async function locationNameExists(
  name: string,
  excludeId?: number
) {
  const values: unknown[] = [name];
  let query =
    "SELECT id FROM locations WHERE LOWER(location_name) = LOWER($1)";

  if (excludeId) {
    query += " AND id != $2";
    values.push(excludeId);
  }

  const result = await pool.query(query, values);
  return result.rows.length > 0;
}

export async function createLocation(
  input: CreateLocationInput
) {
  const result = await pool.query(
    `
    INSERT INTO locations (location_name, city, state)
    VALUES ($1, $2, $3)
    RETURNING id
    `,
    [
      input.location_name,
      input.city || null,
      input.state || null,
    ]
  );

  return getLocationWithStats(
    result.rows[0].id
  );
}

export async function updateLocation(
  id: number,
  input: UpdateLocationInput
) {
  const existing = await getLocationById(id);

  if (!existing) {
    return null;
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (input.location_name !== undefined) {
    fields.push(
      `location_name = $${paramIndex++}`
    );
    values.push(input.location_name);
  }
  if (input.city !== undefined) {
    fields.push(`city = $${paramIndex++}`);
    values.push(input.city || null);
  }
  if (input.state !== undefined) {
    fields.push(`state = $${paramIndex++}`);
    values.push(input.state || null);
  }

  if (fields.length === 0) {
    return getLocationWithStats(id);
  }

  values.push(id);

  await pool.query(
    `
    UPDATE locations
    SET ${fields.join(", ")}
    WHERE id = $${paramIndex}
    `,
    values
  );

  return getLocationWithStats(id);
}

export async function deleteLocation(
  id: number
) {
  const existing = await getLocationById(id);

  if (!existing) {
    return { deleted: false, reason: "not_found" };
  }

  const usage = await pool.query(
    `
    SELECT
      (SELECT COUNT(*) FROM employees WHERE location_id = $1)::int AS employees,
      (SELECT COUNT(*) FROM cameras WHERE location_id = $1)::int AS cameras
    `,
    [id]
  );

  const { employees, cameras } =
    usage.rows[0];

  if (employees > 0 || cameras > 0) {
    return {
      deleted: false,
      reason: "in_use",
      employees,
      cameras,
    };
  }

  await pool.query(
    "DELETE FROM locations WHERE id = $1",
    [id]
  );

  return { deleted: true };
}
