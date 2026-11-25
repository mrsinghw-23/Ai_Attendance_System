import pool from "@/lib/db";

const DEFAULT_ENTRANCES = [
  "Main Gate",
  "Main Entrance",
  "Office Floor",
  "Production Area",
];

const DEFAULT_FLOORS = [
  "Ground Floor",
  "1st Floor",
  "2nd Floor",
  "3rd Floor",
  "4th Floor",
  "5th Floor",
  "6th Floor",
  "7th Floor",
];

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
}

export async function getPcWebcamFieldOptions(locationId?: number | null) {
  const locationsResult = await pool.query(
    `
    SELECT id, location_name, city, state
    FROM locations
    ORDER BY location_name ASC
    `
  );

  const locations = locationsResult.rows as Array<{
    id: number;
    location_name: string;
    city: string | null;
    state: string | null;
  }>;

  let branches: string[] = [];
  let entrances: string[] = [...DEFAULT_ENTRANCES];
  let floors: string[] = [...DEFAULT_FLOORS];

  if (locationId) {
    const location = locations.find((item) => item.id === locationId);

    const [camerasResult, zonesResult, savedBranches] = await Promise.all([
      pool.query(
        `
        SELECT DISTINCT camera_name, floor
        FROM cameras
        WHERE location_id = $1
          AND COALESCE(status, 'ACTIVE') = 'ACTIVE'
        ORDER BY camera_name ASC
        `,
        [locationId]
      ),
      pool.query(
        `
        SELECT DISTINCT zone_name, floor
        FROM camera_zones
        WHERE location_id = $1
          AND COALESCE(status, 'ACTIVE') = 'ACTIVE'
        ORDER BY zone_name ASC
        `,
        [locationId]
      ),
      pool.query(
        `
        SELECT DISTINCT setting_value->>'branch_name' AS branch_name
        FROM system_settings
        WHERE category = 'pc_webcam'
          AND setting_key = 'config'
          AND setting_value->>'branch_name' IS NOT NULL
          AND TRIM(setting_value->>'branch_name') <> ''
        `
      ),
    ]);

    branches = uniqueStrings([
      ...(location?.city ? [`${location.location_name} · ${location.city}`] : []),
      location?.location_name,
      ...camerasResult.rows.map((row) => String(row.camera_name)),
      ...savedBranches.rows.map((row) => String(row.branch_name)),
    ]);

    entrances = uniqueStrings([
      ...entrances,
      ...zonesResult.rows.map((row) => String(row.zone_name)),
      "Main Gate",
      "Side Gate",
      "Reception",
    ]);

    floors = uniqueStrings([
      ...floors,
      ...camerasResult.rows.map((row) => String(row.floor)),
      ...zonesResult.rows.map((row) => String(row.floor)),
    ]);
  } else {
    branches = uniqueStrings(
      locations
        .map((loc) => loc.location_name)
        .concat(
          locations
            .filter((loc) => loc.city)
            .map((loc) => `${loc.location_name} · ${loc.city}`)
        )
    );
  }

  return {
    locations,
    branches,
    entrances,
    floors,
  };
}
