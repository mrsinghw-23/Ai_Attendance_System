import pool from "@/lib/db";
import {
  deleteFaceImageFile,
} from "@/utils/face-image-storage";
import { invalidateEncodingCache } from "@/services/employee-encoding-cache.service";
import { deriveAIReadiness } from "@/services/employee-ai-readiness.service";
import { publishRealtimeEvent } from "@/services/realtime.service";
import { purgeFaceEventsForEmployee } from "@/services/face-events-cleanup.service";
import {
  Employee,
  EmployeeListParams,
} from "@/types/employee";
import {
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from "@/schemas/employee.schema";

const EMPLOYEE_SELECT = `
  SELECT
    e.id,
    e.employee_code,
    COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1)) AS first_name,
    COALESCE(
      NULLIF(e.last_name, ''),
      NULLIF(TRIM(SUBSTRING(e.name FROM POSITION(' ' IN COALESCE(e.name, '')) + 1)), ''),
      SPLIT_PART(e.name, ' ', 1)
    ) AS last_name,
    e.email,
    e.mobile,
    e.designation,
    e.department,
    e.location_id,
    COALESCE(l.location_name, e.location) AS location_name,
    l.city AS location_city,
    e.reporting_manager_id,
    TRIM(
      CONCAT(
        COALESCE(m.first_name, SPLIT_PART(m.name, ' ', 1), ''),
        ' ',
        COALESCE(m.last_name, '')
      )
    ) AS reporting_manager_name,
    COALESCE(e.status, 'ACTIVE') AS status,
    e.joining_date,
    e.photo_url,
    COALESCE(e.face_registration_status, 'NOT_REGISTERED') AS face_registration_status,
    (
      SELECT COUNT(*)::int
      FROM employee_face_images efi
      WHERE efi.employee_id = e.id
    ) AS face_image_count,
    (
      SELECT COUNT(*)::int
      FROM face_embeddings fe
      WHERE fe.employee_id = e.id
        AND fe.embedding_data IS NOT NULL
        AND fe.embedding_data <> ''
    ) AS face_embedding_count,
    e.created_at,
    e.updated_at
  FROM employees e
  LEFT JOIN locations l ON l.id = e.location_id
  LEFT JOIN employees m ON m.id = e.reporting_manager_id
`;

function mapEmployee(row: Record<string, unknown>): Employee {
  return {
    id: row.id as number,
    employee_code: row.employee_code as string,
    first_name: row.first_name as string,
    last_name: row.last_name as string,
    email: (row.email as string) || null,
    mobile: (row.mobile as string) || null,
    designation: (row.designation as string) || null,
    department: (row.department as string) || null,
    location_id: (row.location_id as number) || null,
    location_name: (row.location_name as string) || null,
    location_city: (row.location_city as string) || null,
    reporting_manager_id:
      (row.reporting_manager_id as number) || null,
    reporting_manager_name:
      (row.reporting_manager_name as string)?.trim() || null,
    status: row.status as Employee["status"],
    joining_date: row.joining_date
      ? String(row.joining_date).slice(0, 10)
      : null,
    photo_url: (row.photo_url as string) || null,
    face_registration_status:
      row.face_registration_status as Employee["face_registration_status"],
    face_image_count: Number(row.face_image_count || 0),
    face_embedding_count: Number(row.face_embedding_count || 0),
    ai_scannable:
      Number(row.face_image_count || 0) > 0 &&
      Number(row.face_embedding_count || 0) > 0,
    ai_readiness: deriveAIReadiness({
      imageCount: Number(row.face_image_count || 0),
      embeddingCount: Number(row.face_embedding_count || 0),
      faceRegistrationStatus: String(row.face_registration_status || ""),
    }),
    created_at: String(row.created_at),
    updated_at: row.updated_at
      ? String(row.updated_at)
      : null,
  };
}

interface ListOptions extends EmployeeListParams {
  managerLocationId?: number | null;
}

export async function getEmployees(
  options: ListOptions = {}
) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(
    100,
    Math.max(1, options.limit || 10)
  );
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (options.managerLocationId) {
    conditions.push(
      `e.location_id = $${paramIndex++}`
    );
    values.push(options.managerLocationId);
  }

  if (options.search) {
    conditions.push(`(
      e.employee_code ILIKE $${paramIndex} OR
      e.first_name ILIKE $${paramIndex} OR
      e.last_name ILIKE $${paramIndex} OR
      e.name ILIKE $${paramIndex} OR
      e.email ILIKE $${paramIndex} OR
      e.department ILIKE $${paramIndex}
    )`);
    values.push(`%${options.search}%`);
    paramIndex++;
  }

  if (options.status) {
    conditions.push(
      `COALESCE(e.status, 'ACTIVE') = $${paramIndex++}`
    );
    values.push(options.status);
  }

  if (options.department) {
    conditions.push(
      `e.department ILIKE $${paramIndex++}`
    );
    values.push(`%${options.department}%`);
  }

  if (options.location_id) {
    conditions.push(
      `e.location_id = $${paramIndex++}`
    );
    values.push(options.location_id);
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const countResult = await pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM employees e
    ${whereClause}
    `,
    values
  );

  const total = countResult.rows[0].total;

  const dataResult = await pool.query(
    `
    ${EMPLOYEE_SELECT}
    ${whereClause}
    ORDER BY e.created_at DESC
    LIMIT $${paramIndex++}
    OFFSET $${paramIndex}
    `,
    [...values, limit, offset]
  );

  return {
    data: dataResult.rows.map(mapEmployee),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getEmployeeById(
  id: number,
  managerLocationId?: number | null
) {
  const conditions = ["e.id = $1"];
  const values: unknown[] = [id];

  if (managerLocationId) {
    conditions.push("e.location_id = $2");
    values.push(managerLocationId);
  }

  const result = await pool.query(
    `
    ${EMPLOYEE_SELECT}
    WHERE ${conditions.join(" AND ")}
    `,
    values
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapEmployee(result.rows[0]);
}

export async function createEmployee(
  input: CreateEmployeeInput
) {
  const fullName =
    `${input.first_name} ${input.last_name}`.trim();
  const locationId = input.location_id || null;

  const result = await pool.query(
    `
    INSERT INTO employees (
      employee_code,
      first_name,
      last_name,
      name,
      email,
      mobile,
      designation,
      department,
      location_id,
      location,
      reporting_manager_id,
      status,
      joining_date,
      photo_url,
      face_registration_status
    )
    VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8, $9,
      (SELECT location_name FROM locations WHERE id = $9),
      $10, $11, $12, $13, $14
    )
    RETURNING id
    `,
    [
      input.employee_code,
      input.first_name,
      input.last_name,
      fullName,
      input.email || null,
      input.mobile || null,
      input.designation || null,
      input.department || null,
      locationId,
      input.reporting_manager_id || null,
      input.status || "ACTIVE",
      input.joining_date || null,
      input.photo_url || null,
      input.face_registration_status || "NOT_REGISTERED",
    ]
  );

  return getEmployeeById(result.rows[0].id);
}

export async function updateEmployee(
  id: number,
  input: UpdateEmployeeInput,
  managerLocationId?: number | null
) {
  const existing = await getEmployeeById(
    id,
    managerLocationId
  );

  if (!existing) {
    return null;
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const setField = (
    column: string,
    value: unknown
  ) => {
    fields.push(`${column} = $${paramIndex++}`);
    values.push(value);
  };

  if (input.employee_code !== undefined) {
    setField("employee_code", input.employee_code);
  }
  if (input.first_name !== undefined) {
    setField("first_name", input.first_name);
  }
  if (input.last_name !== undefined) {
    setField("last_name", input.last_name);
  }
  if (
    input.first_name !== undefined ||
    input.last_name !== undefined
  ) {
    const firstName =
      input.first_name ?? existing.first_name;
    const lastName =
      input.last_name ?? existing.last_name;
    setField(
      "name",
      `${firstName} ${lastName}`.trim()
    );
  }
  if (input.email !== undefined) {
    setField("email", input.email || null);
  }
  if (input.mobile !== undefined) {
    setField("mobile", input.mobile || null);
  }
  if (input.designation !== undefined) {
    setField("designation", input.designation || null);
  }
  if (input.department !== undefined) {
    setField("department", input.department || null);
  }
  if (input.location_id !== undefined) {
    setField("location_id", input.location_id);
    const locationResult = await pool.query(
      "SELECT location_name FROM locations WHERE id = $1",
      [input.location_id]
    );
    setField(
      "location",
      locationResult.rows[0]?.location_name || null
    );
  }
  if (input.reporting_manager_id !== undefined) {
    setField(
      "reporting_manager_id",
      input.reporting_manager_id
    );
  }
  if (input.status !== undefined) {
    setField("status", input.status);
  }
  if (input.joining_date !== undefined) {
    setField(
      "joining_date",
      input.joining_date || null
    );
  }
  if (input.photo_url !== undefined) {
    setField("photo_url", input.photo_url || null);
  }
  if (input.face_registration_status !== undefined) {
    setField(
      "face_registration_status",
      input.face_registration_status
    );
  }

  if (fields.length === 0) {
    return existing;
  }

  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  await pool.query(
    `
    UPDATE employees
    SET ${fields.join(", ")}
    WHERE id = $${paramIndex}
    `,
    values
  );

  return getEmployeeById(id, managerLocationId);
}

export async function deleteEmployee(
  id: number,
  managerLocationId?: number | null
) {
  const existing = await getEmployeeById(
    id,
    managerLocationId
  );

  if (!existing) {
    return false;
  }

  const faceFiles = await pool.query(
    `SELECT image_path FROM employee_face_images WHERE employee_id = $1`,
    [id]
  );
  for (const row of faceFiles.rows) {
    if (row.image_path) {
      await deleteFaceImageFile(String(row.image_path)).catch(() => undefined);
    }
  }

  await pool.query(`DELETE FROM face_embeddings WHERE employee_id = $1`, [id]);
  await purgeFaceEventsForEmployee(id);
  invalidateEncodingCache();

  await pool.query(
    "DELETE FROM employees WHERE id = $1",
    [id]
  );

  publishRealtimeEvent("employee.deleted", {
    employeeId: id,
    employeeCode: existing.employee_code,
  });

  return true;
}

export async function getEmployeeCount(
  managerLocationId?: number | null
) {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (managerLocationId) {
    conditions.push("location_id = $1");
    values.push(managerLocationId);
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const result = await pool.query(
    `SELECT COUNT(*)::int AS total FROM employees ${whereClause}`,
    values
  );

  return result.rows[0].total;
}

export async function getManagerOptions(
  locationId?: number | null
) {
  const conditions = [
    "COALESCE(e.status, 'ACTIVE') = 'ACTIVE'",
  ];
  const values: unknown[] = [];

  if (locationId) {
    conditions.push("e.location_id = $1");
    values.push(locationId);
  }

  const result = await pool.query(
    `
    SELECT
      e.id,
      e.employee_code,
      COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1)) AS first_name,
      COALESCE(e.last_name, '') AS last_name
    FROM employees e
    WHERE ${conditions.join(" AND ")}
    ORDER BY first_name, last_name
    `,
    values
  );

  return result.rows;
}

export async function employeeCodeExists(
  code: string,
  excludeId?: number
) {
  const values: unknown[] = [code];
  let query =
    "SELECT id FROM employees WHERE employee_code = $1";

  if (excludeId) {
    query += " AND id != $2";
    values.push(excludeId);
  }

  const result = await pool.query(query, values);
  return result.rows.length > 0;
}
