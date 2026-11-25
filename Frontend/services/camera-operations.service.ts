import pool from "@/lib/db";
import {
  CameraMapLocation,
  CameraOperationsDashboard,
} from "@/types/camera";
import { getCameraStats } from "@/services/camera.service";
import { getCameraEvents } from "@/services/camera-event.service";
import { getCameraHealthLogs } from "@/services/camera-health.service";

export async function getCameraOperationsDashboard(
  managerLocationId?: number | null
): Promise<CameraOperationsDashboard> {
  const locationFilter = managerLocationId
    ? "WHERE c.location_id = $1"
    : "";
  const values = managerLocationId ? [managerLocationId] : [];

  const [stats, recentEvents, healthTimeline, motionEvents, attendanceRows] =
    await Promise.all([
      getCameraStats(managerLocationId),
      getCameraEvents({
        limit: 15,
        managerLocationId,
      }),
      getCameraHealthLogs(undefined, managerLocationId),
      getCameraEvents({
        eventType: "MOTION_DETECTED",
        limit: 10,
        managerLocationId,
      }),
      pool.query(
        `
        SELECT
          c.id AS camera_id,
          c.camera_name,
          l.location_name,
          COUNT(fe.id) FILTER (WHERE fe.event_time::date = CURRENT_DATE)::int AS detections_today,
          COUNT(DISTINCT fe.employee_id) FILTER (WHERE fe.event_time::date = CURRENT_DATE)::int AS unique_employees
        FROM cameras c
        LEFT JOIN locations l ON l.id = c.location_id
        LEFT JOIN face_events fe ON fe.camera_id = c.id
        ${locationFilter}
        GROUP BY c.id, c.camera_name, l.location_name
        ORDER BY detections_today DESC, c.camera_name ASC
        LIMIT 20
        `,
        values
      ),
    ]);

  const filteredTimeline = healthTimeline.slice(0, 20);

  return {
    stats,
    recent_events: recentEvents,
    health_timeline: filteredTimeline,
    motion_events: motionEvents,
    camera_attendance: attendanceRows.rows.map((row) => ({
      camera_id: row.camera_id as number,
      camera_name: row.camera_name as string,
      location_name: (row.location_name as string) || null,
      detections_today: Number(row.detections_today || 0),
      unique_employees: Number(row.unique_employees || 0),
    })),
  };
}

export async function getCameraMapView(
  managerLocationId?: number | null
): Promise<CameraMapLocation[]> {
  const locationValues: unknown[] = [];
  let locationWhere = "";

  if (managerLocationId) {
    locationWhere = "WHERE l.id = $1";
    locationValues.push(managerLocationId);
  }

  const locations = await pool.query(
    `
    SELECT l.id AS location_id, l.location_name
    FROM locations l
    ${locationWhere}
    ORDER BY l.location_name ASC
    `,
    locationValues
  );

  const cameras = await pool.query(
    `
    SELECT
      c.id,
      c.camera_name,
      c.camera_code,
      c.location_id,
      c.zone_id,
      COALESCE(z.zone_name, 'Unassigned Zone') AS zone_name,
      COALESCE(z.floor, c.floor) AS floor,
      COALESCE(c.status, 'ACTIVE') AS status,
      COALESCE(c.health_status, 'UNKNOWN') AS health_status
    FROM cameras c
    LEFT JOIN camera_zones z ON z.id = c.zone_id
    ${managerLocationId ? "WHERE c.location_id = $1" : ""}
    ORDER BY c.camera_name ASC
    `,
    locationValues
  );

  return locations.rows.map((location) => {
    const locationCameras = cameras.rows.filter(
      (camera) => camera.location_id === location.location_id
    );

    const zoneMap = new Map<
      string,
      {
        zone_id: number | null;
        zone_name: string;
        floor: string | null;
        cameras: CameraMapLocation["zones"][0]["cameras"];
      }
    >();

    for (const camera of locationCameras) {
      const key = String(camera.zone_id || "unassigned");
      if (!zoneMap.has(key)) {
        zoneMap.set(key, {
          zone_id: (camera.zone_id as number) || null,
          zone_name: camera.zone_name as string,
          floor: (camera.floor as string) || null,
          cameras: [],
        });
      }

      zoneMap.get(key)!.cameras.push({
        id: camera.id as number,
        camera_name: camera.camera_name as string,
        camera_code: (camera.camera_code as string) || null,
        health_status: camera.health_status as CameraMapLocation["zones"][0]["cameras"][0]["health_status"],
        status: camera.status as CameraMapLocation["zones"][0]["cameras"][0]["status"],
      });
    }

    return {
      location_id: location.location_id as number,
      location_name: location.location_name as string,
      zones: Array.from(zoneMap.values()),
    };
  });
}
