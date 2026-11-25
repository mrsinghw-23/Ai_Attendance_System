import "server-only";

import pool from "@/lib/db";

type EmployeeEncoding = {
  employee_id: number;
  employee_code: string;
  employee_name: string;
  department: string | null;
  location_id: number | null;
  vectors: number[][];
};

const CACHE_TTL_MS = 60_000;

let cachedAt = 0;
let cachedEncodings: EmployeeEncoding[] = [];
let inflight: Promise<EmployeeEncoding[]> | null = null;

function toNumberArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function norm(vector: number[]) {
  return Math.sqrt(vector.reduce((acc, value) => acc + value * value, 0));
}

function cosineSimilarity(a: number[], b: number[]) {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  const aNorm = norm(a);
  const bNorm = norm(b);
  if (aNorm === 0 || bNorm === 0) return 0;

  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot / (aNorm * bNorm);
}

async function loadFromDb(): Promise<EmployeeEncoding[]> {
  const result = await pool.query(
    `
    SELECT
      e.id AS employee_id,
      e.location_id,
      e.employee_code,
      e.department,
      TRIM(CONCAT(
        COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''),
        ' ',
        COALESCE(e.last_name, '')
      )) AS employee_name,
      fe.embedding_data
    FROM face_embeddings fe
    JOIN employees e ON e.id = fe.employee_id
    WHERE COALESCE(e.status, 'ACTIVE') = 'ACTIVE'
      AND fe.embedding_data IS NOT NULL
      AND fe.embedding_data <> ''
      AND EXISTS (
        SELECT 1
        FROM employee_face_images efi
        WHERE efi.employee_id = e.id
      )
    ORDER BY e.id, fe.id
    `
  );

  const grouped = new Map<number, EmployeeEncoding>();
  for (const row of result.rows) {
    const employeeId = Number(row.employee_id);
    const embeddingRaw = row.embedding_data;
    const parsed =
      typeof embeddingRaw === "string" ? JSON.parse(embeddingRaw) : embeddingRaw;
    const vector = toNumberArray(parsed);
    if (vector.length === 0) continue;

    const existing = grouped.get(employeeId);
    if (!existing) {
      grouped.set(employeeId, {
        employee_id: employeeId,
        employee_code: String(row.employee_code || ""),
        employee_name: String(row.employee_name || ""),
        department: row.department ? String(row.department) : null,
        location_id:
          row.location_id == null ? null : Number(row.location_id),
        vectors: [vector],
      });
      continue;
    }
    existing.vectors.push(vector);
  }

  return Array.from(grouped.values());
}

/** DB cross-check: employee must have both face images and embeddings to be AI-scannable. */
export async function employeeCanBeFaceScanned(employeeId: number) {
  const result = await pool.query(
    `
    SELECT
      COUNT(DISTINCT fe.id)::int AS embedding_count,
      COUNT(DISTINCT efi.id)::int AS image_count
    FROM employees e
    LEFT JOIN face_embeddings fe ON fe.employee_id = e.id
      AND fe.embedding_data IS NOT NULL
      AND fe.embedding_data <> ''
    LEFT JOIN employee_face_images efi ON efi.employee_id = e.id
    WHERE e.id = $1
      AND COALESCE(e.status, 'ACTIVE') = 'ACTIVE'
    GROUP BY e.id
    `,
    [employeeId]
  );

  const row = result.rows[0];
  if (!row) return false;
  return Number(row.embedding_count) > 0 && Number(row.image_count) > 0;
}

export async function getEmployeeFaceScanStatus(employeeId: number) {
  const result = await pool.query(
    `
    SELECT
      e.id,
      e.employee_code,
      TRIM(CONCAT(
        COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''),
        ' ',
        COALESCE(e.last_name, '')
      )) AS employee_name,
      COUNT(DISTINCT fe.id)::int AS embedding_count,
      COUNT(DISTINCT efi.id)::int AS image_count,
      COALESCE(MAX(efp.profile_status), 'NOT_REGISTERED') AS profile_status
    FROM employees e
    LEFT JOIN face_embeddings fe ON fe.employee_id = e.id
      AND fe.embedding_data IS NOT NULL
      AND fe.embedding_data <> ''
    LEFT JOIN employee_face_images efi ON efi.employee_id = e.id
    LEFT JOIN employee_face_profiles efp ON efp.employee_id = e.id
    WHERE e.id = $1
    GROUP BY e.id, e.employee_code, e.first_name, e.last_name, e.name
    `,
    [employeeId]
  );

  const row = result.rows[0];
  if (!row) {
    return {
      employee_id: employeeId,
      scannable: false,
      reason: "employee_not_found",
    };
  }

  const embeddingCount = Number(row.embedding_count || 0);
  const imageCount = Number(row.image_count || 0);
  const scannable = embeddingCount > 0 && imageCount > 0;

  let reason = "ok";
  if (imageCount === 0) reason = "no_face_images";
  else if (embeddingCount === 0) reason = "embeddings_not_synced";

  return {
    employee_id: Number(row.id),
    employee_code: String(row.employee_code || ""),
    employee_name: String(row.employee_name || ""),
    profile_status: String(row.profile_status || "NOT_REGISTERED"),
    embedding_count: embeddingCount,
    image_count: imageCount,
    scannable,
    reason,
  };
}

export function invalidateEncodingCache() {
  cachedAt = 0;
  cachedEncodings = [];
}

export async function getEmployeeEncodingCache(forceRefresh = false) {
  const freshEnough = Date.now() - cachedAt < CACHE_TTL_MS;
  if (!forceRefresh && freshEnough && cachedEncodings.length > 0) {
    return cachedEncodings;
  }

  if (!inflight) {
    inflight = loadFromDb()
      .then((rows) => {
        cachedEncodings = rows;
        cachedAt = Date.now();
        return rows;
      })
      .finally(() => {
        inflight = null;
      });
  }

  return inflight;
}

export async function countScannableEmployees() {
  const employees = await getEmployeeEncodingCache();
  return employees.length;
}

export function matchEmployeeFromEncoding(
  probe: number[],
  employees: EmployeeEncoding[],
  options?: { minConfidence?: number }
) {
  let best: EmployeeEncoding | null = null;
  let bestScore = 0;

  for (const employee of employees) {
    for (const vector of employee.vectors) {
      const score = cosineSimilarity(probe, vector);
      if (score > bestScore) {
        bestScore = score;
        best = employee;
      }
    }
  }

  const threshold = options?.minConfidence ?? 0.65;
  if (!best || bestScore < threshold) {
    return { matched: false as const, confidence: bestScore };
  }

  return {
    matched: true as const,
    confidence: bestScore,
    employee: best,
  };
}

/** SQL EXISTS: employee is active with face images and synced embeddings. */
export function scannableEmployeeFilterSql(employeeIdColumn: string) {
  return `EXISTS (
    SELECT 1
    FROM employees e_scan
    WHERE e_scan.id = ${employeeIdColumn}
      AND COALESCE(e_scan.status, 'ACTIVE') = 'ACTIVE'
      AND EXISTS (
        SELECT 1 FROM employee_face_images efi WHERE efi.employee_id = e_scan.id
      )
      AND EXISTS (
        SELECT 1 FROM face_embeddings fem
        WHERE fem.employee_id = e_scan.id
          AND fem.embedding_data IS NOT NULL
          AND fem.embedding_data <> ''
      )
  )`;
}
