import pool from "@/lib/db";
import { PermissionRecord, RoleRecord } from "@/types/admin";

let permissionCache: {
  loadedAt: number;
  rolePermissions: Map<string, Set<string>>;
} | null = null;

const CACHE_TTL_MS = 60_000;

async function loadPermissionCache() {
  if (
    permissionCache &&
    Date.now() - permissionCache.loadedAt < CACHE_TTL_MS
  ) {
    return permissionCache;
  }

  const result = await pool.query(
    `
    SELECT r.code AS role_code, p.code AS permission_code
    FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
    `
  );

  const rolePermissions = new Map<string, Set<string>>();

  for (const row of result.rows) {
    const set =
      rolePermissions.get(row.role_code) || new Set<string>();
    set.add(row.permission_code);
    rolePermissions.set(row.role_code, set);
  }

  permissionCache = {
    loadedAt: Date.now(),
    rolePermissions,
  };

  return permissionCache;
}

export function invalidatePermissionCache() {
  permissionCache = null;
}

async function getUserPermissionOverrides(userId: number) {
  const result = await pool.query(
    `
    SELECT p.code, up.granted
    FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = $1
    `,
    [userId]
  );

  return result.rows as { code: string; granted: boolean }[];
}

export async function getPermissionsForRole(role: string) {
  const cache = await loadPermissionCache();
  return Array.from(cache.rolePermissions.get(role) || []);
}

export async function getEffectivePermissions(
  role: string,
  userId?: number
) {
  const cache = await loadPermissionCache();
  const base = new Set(cache.rolePermissions.get(role) || []);

  if (userId) {
    const overrides = await getUserPermissionOverrides(userId);
    for (const item of overrides) {
      if (item.granted) base.add(item.code);
      else base.delete(item.code);
    }
  }

  return Array.from(base);
}

export async function hasPermissionCode(
  role: string,
  permissionCode: string,
  userId?: number
) {
  const permissions = await getEffectivePermissions(role, userId);
  return permissions.includes(permissionCode);
}

export async function hasModuleAccess(
  role: string,
  module: string,
  userId?: number
) {
  const permissions = await getEffectivePermissions(role, userId);
  return permissions.some(
    (code) => code === `${module}.view` || code.startsWith(`${module}.`)
  );
}

export async function hasPermissionAction(
  role: string,
  module: string,
  action: string,
  userId?: number
) {
  return hasPermissionCode(role, `${module}.${action}`, userId);
}

export async function listRoles() {
  const result = await pool.query(
    `
    SELECT r.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', p.id,
            'module', p.module,
            'action', p.action,
            'code', p.code,
            'description', p.description
          )
        ) FILTER (WHERE p.id IS NOT NULL),
        '[]'::json
      ) AS permissions
    FROM roles r
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    LEFT JOIN permissions p ON p.id = rp.permission_id
    GROUP BY r.id
    ORDER BY r.id
    `
  );

  return result.rows as RoleRecord[];
}

export async function listPermissions() {
  const result = await pool.query(
    `
    SELECT *
    FROM permissions
    ORDER BY module, action
    `
  );

  return result.rows as PermissionRecord[];
}

export async function updateRolePermissions(
  roleCode: string,
  permissionCodes: string[]
) {
  const roleResult = await pool.query(
    "SELECT id FROM roles WHERE code = $1",
    [roleCode]
  );
  const roleId = roleResult.rows[0]?.id;
  if (!roleId) return null;

  const permResult = await pool.query(
    `
    SELECT id, code
    FROM permissions
    WHERE code = ANY($1::text[])
    `,
    [permissionCodes]
  );

  await pool.query(
    "DELETE FROM role_permissions WHERE role_id = $1",
    [roleId]
  );

  for (const perm of permResult.rows) {
    await pool.query(
      `
      INSERT INTO role_permissions (role_id, permission_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [roleId, perm.id]
    );
  }

  invalidatePermissionCache();
  return listRoles();
}

export async function setUserPermissions(
  userId: number,
  permissionCodes: string[]
) {
  const permResult = await pool.query(
    "SELECT id, code FROM permissions WHERE code = ANY($1::text[])",
    [permissionCodes]
  );

  await pool.query(
    "DELETE FROM user_permissions WHERE user_id = $1",
    [userId]
  );

  for (const perm of permResult.rows) {
    await pool.query(
      `
      INSERT INTO user_permissions (user_id, permission_id, granted)
      VALUES ($1, $2, TRUE)
      `,
      [userId, perm.id]
    );
  }
}
