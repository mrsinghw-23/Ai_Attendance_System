import pool from "@/lib/db";
import { getCameras } from "@/services/camera.service";
import {
  isCctvConfiguredCamera,
  resolveCameraMjpegUrl,
  resolveCameraSnapshotUrl,
} from "@/utils/camera-stream";
import {
  EmployeeFaceImage,
  EmployeeFaceProfile,
  FaceImageType,
  FaceProfileStatus,
  FaceRegistrationStats,
  MIN_FACE_SAMPLES,
  RECOMMENDED_FACE_SAMPLES,
  REQUIRED_FACE_TYPES,
} from "@/types/face-registration";
import { validateFaceImageQuality } from "@/services/face-quality.service";
import {
  deleteFaceImageFile,
  getExtensionFromMime,
  saveFaceImage,
} from "@/utils/face-image-storage";
import { publishRealtimeEvent } from "@/services/realtime.service";
import { logFaceRegistrationAudit } from "@/services/face-registration-audit.service";
import { syncEmployeeEmbeddings } from "@/utils/embedding-sync";
import { invalidateEncodingCache } from "@/services/employee-encoding-cache.service";
import { getEmployeeFaceScanStatus } from "@/services/employee-encoding-cache.service";
import { purgeFaceEventsForEmployee } from "@/services/face-events-cleanup.service";

async function removeEmbeddingsForImages(imageIds: number[]) {
  if (!imageIds.length) return;
  await pool.query(
    `DELETE FROM face_embeddings WHERE source_image_id = ANY($1::int[])`,
    [imageIds]
  );
}

async function purgeStaleEmbeddings(employeeId: number) {
  await pool.query(
    `
    DELETE FROM face_embeddings fe
    WHERE fe.employee_id = $1
      AND (
        fe.source_image_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM employee_face_images efi WHERE efi.id = fe.source_image_id
        )
      )
    `,
    [employeeId]
  );
}

async function rebuildEmployeeEmbeddings(employeeId: number) {
  invalidateEncodingCache();
  const pythonResult = await syncEmployeeEmbeddings(employeeId);
  const scanStatus = await getEmployeeFaceScanStatus(employeeId);

  return {
    success: scanStatus.scannable,
    pythonExitOk: pythonResult.success,
    output: pythonResult.output,
    stats: pythonResult.stats,
    scannable: scanStatus.scannable,
    embeddingCount: scanStatus.embedding_count,
    imageCount: scanStatus.image_count,
    reason: scanStatus.reason,
  };
}

function mapImage(row: Record<string, unknown>): EmployeeFaceImage {
  return {
    id: row.id as number,
    employee_id: row.employee_id as number,
    face_profile_id: row.face_profile_id as number,
    image_path: row.image_path as string,
    image_type: row.image_type as FaceImageType,
    quality_score: Number(row.quality_score || 0),
    quality_metadata: (row.quality_metadata as Record<string, unknown>) || {},
    created_at: String(row.created_at),
  };
}

function computeProfileStatus(
  images: EmployeeFaceImage[]
): FaceProfileStatus {
  if (images.length === 0) return "NOT_REGISTERED";

  const types = new Set(images.map((image) => image.image_type));
  const hasAllRequired = REQUIRED_FACE_TYPES.every((type) => types.has(type));

  if (images.length >= MIN_FACE_SAMPLES && hasAllRequired) {
    return "FULLY_REGISTERED";
  }

  return "PARTIALLY_REGISTERED";
}

function mapEmployeeFaceStatus(status: FaceProfileStatus) {
  if (status === "FULLY_REGISTERED") return "REGISTERED";
  if (status === "PARTIALLY_REGISTERED") return "PENDING";
  return "NOT_REGISTERED";
}

async function syncEmployeeFaceStatus(
  employeeId: number,
  profileStatus: FaceProfileStatus
) {
  await pool.query(
    `
    UPDATE employees
    SET face_registration_status = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    `,
    [mapEmployeeFaceStatus(profileStatus), employeeId]
  );
}

async function refreshProfile(employeeId: number, profileId: number) {
  const imagesResult = await pool.query(
    `
    SELECT *
    FROM employee_face_images
    WHERE face_profile_id = $1
    ORDER BY created_at ASC
    `,
    [profileId]
  );

  const images = imagesResult.rows.map(mapImage);
  const profileStatus = computeProfileStatus(images);

  await pool.query(
    `
    UPDATE employee_face_profiles
    SET profile_status = $1,
        image_count = $2,
        registration_date = CASE
          WHEN $2 > 0 AND registration_date IS NULL THEN CURRENT_DATE
          ELSE registration_date
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
    `,
    [profileStatus, images.length, profileId]
  );

  await syncEmployeeFaceStatus(employeeId, profileStatus);

  return { images, profileStatus };
}

export async function getOrCreateFaceProfile(employeeId: number) {
  const existing = await pool.query(
    `SELECT * FROM employee_face_profiles WHERE employee_id = $1`,
    [employeeId]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const created = await pool.query(
    `
    INSERT INTO employee_face_profiles (
      employee_id,
      profile_status,
      image_count,
      active,
      updated_at
    )
    VALUES ($1, 'NOT_REGISTERED', 0, TRUE, CURRENT_TIMESTAMP)
    RETURNING *
    `,
    [employeeId]
  );

  return created.rows[0];
}

export async function getEmployeeFaceRegistration(
  employeeId: number
): Promise<EmployeeFaceProfile> {
  const profileRow = await getOrCreateFaceProfile(employeeId);
  const { images, profileStatus } = await refreshProfile(
    employeeId,
    profileRow.id
  );

  return {
    id: profileRow.id,
    employee_id: employeeId,
    profile_status: profileStatus,
    registration_date: profileRow.registration_date
      ? String(profileRow.registration_date).slice(0, 10)
      : null,
    image_count: images.length,
    active: Boolean(profileRow.active ?? true),
    required_count: MIN_FACE_SAMPLES,
    recommended_count: RECOMMENDED_FACE_SAMPLES,
    images,
    created_at: String(profileRow.created_at),
    updated_at: profileRow.updated_at ? String(profileRow.updated_at) : null,
  };
}

export async function uploadFaceImage(options: {
  employeeId: number;
  imageType: FaceImageType;
  buffer: Buffer;
  mimeType: string;
  replaceImageId?: number;
  liveSessionId?: string;
  liveQualityScore?: number;
}) {
  const quality = validateFaceImageQuality(options.buffer, options.mimeType);
  if (!quality.passed) {
    return {
      success: false as const,
      message: quality.issues.join(" "),
      quality,
    };
  }

  const extension = getExtensionFromMime(options.mimeType);
  if (!extension) {
    return {
      success: false as const,
      message: "Unsupported image format.",
      quality,
    };
  }

  const profileRow = await getOrCreateFaceProfile(options.employeeId);

  if (options.replaceImageId) {
    await deleteFaceImage(options.replaceImageId, options.employeeId);
  } else if (options.imageType !== "ADDITIONAL") {
    const existing = await pool.query(
      `
      SELECT id, image_path
      FROM employee_face_images
      WHERE face_profile_id = $1 AND image_type = $2
      LIMIT 1
      `,
      [profileRow.id, options.imageType]
    );

    if (existing.rows[0]) {
      await deleteFaceImage(Number(existing.rows[0].id), options.employeeId);
    }
  }

  const imagePath = await saveFaceImage(
    options.employeeId,
    options.buffer,
    extension
  );

  const inserted = await pool.query(
    `
    INSERT INTO employee_face_images (
      employee_id,
      face_profile_id,
      image_path,
      image_type,
      quality_score,
      quality_metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [
      options.employeeId,
      profileRow.id,
      imagePath,
      options.imageType,
      options.liveQualityScore ?? quality.score,
      JSON.stringify({
        ...quality.metrics,
        registration_mode: options.liveSessionId ? "live_enrollment" : "manual",
        live_session_id: options.liveSessionId || null,
      }),
    ]
  );

  if (options.liveSessionId) {
    await logFaceRegistrationAudit({
      employeeId: options.employeeId,
      faceProfileId: profileRow.id,
      sessionId: options.liveSessionId,
      eventType: options.replaceImageId ? "POSE_RETAKE" : "POSE_CAPTURED",
      imageType: options.imageType,
      qualityScore: options.liveQualityScore ?? quality.score,
      metadata: { image_id: inserted.rows[0].id },
    });
  }

  const profile = await getEmployeeFaceRegistration(options.employeeId);

  let embeddingResult = {
    success: false,
    scannable: false,
    output: "",
    embeddingCount: 0,
  };

  if (!options.liveSessionId) {
    const rebuilt = await rebuildEmployeeEmbeddings(options.employeeId);
    embeddingResult = {
      success: rebuilt.success,
      scannable: rebuilt.scannable,
      output: rebuilt.output,
      embeddingCount: rebuilt.embeddingCount ?? 0,
    };
  }

  publishRealtimeEvent("face_registration.updated", {
    employeeId: options.employeeId,
    profileStatus: profile.profile_status,
    imageCount: profile.image_count,
    embeddingsSynced: embeddingResult.scannable,
  });

  return {
    success: true as const,
    image: mapImage(inserted.rows[0]),
    profile,
    quality,
    embeddingsSynced: embeddingResult.scannable,
  };
}

export async function saveManualQuickFaceRegistration(options: {
  employeeId: number;
  buffer: Buffer;
  mimeType: string;
  liveQualityScore?: number;
}) {
  const quality = validateFaceImageQuality(options.buffer, options.mimeType);
  if (!quality.passed) {
    return {
      success: false as const,
      message: quality.issues.join(" "),
      quality,
    };
  }

  const extension = getExtensionFromMime(options.mimeType);
  if (!extension) {
    return {
      success: false as const,
      message: "Unsupported image format.",
      quality,
    };
  }

  const profileRow = await getOrCreateFaceProfile(options.employeeId);
  const score = options.liveQualityScore ?? quality.score;
  const sessionId = `manual-quick-${Date.now()}`;

  for (const imageType of REQUIRED_FACE_TYPES) {
    const existing = await pool.query(
      `
      SELECT id, image_path
      FROM employee_face_images
      WHERE face_profile_id = $1 AND image_type = $2
      LIMIT 1
      `,
      [profileRow.id, imageType]
    );

    if (existing.rows[0]) {
      const oldId = Number(existing.rows[0].id);
      await deleteFaceImageFile(existing.rows[0].image_path);
      await removeEmbeddingsForImages([oldId]);
      await pool.query(`DELETE FROM employee_face_images WHERE id = $1`, [oldId]);
    }

    const imagePath = await saveFaceImage(
      options.employeeId,
      options.buffer,
      extension
    );

    await pool.query(
      `
      INSERT INTO employee_face_images (
        employee_id,
        face_profile_id,
        image_path,
        image_type,
        quality_score,
        quality_metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        options.employeeId,
        profileRow.id,
        imagePath,
        imageType,
        score,
        JSON.stringify({
          ...quality.metrics,
          registration_mode: "manual_quick",
          live_session_id: sessionId,
        }),
      ]
    );
  }

  await logFaceRegistrationAudit({
    employeeId: options.employeeId,
    faceProfileId: profileRow.id,
    sessionId,
    eventType: "SESSION_COMPLETED",
    qualityScore: score,
    metadata: { mode: "manual_quick", pose_count: REQUIRED_FACE_TYPES.length },
  });

  await purgeStaleEmbeddings(options.employeeId);
  const profile = await getEmployeeFaceRegistration(options.employeeId);
  const embeddingResult = await rebuildEmployeeEmbeddings(options.employeeId);

  publishRealtimeEvent("face_registration.live_completed", {
    employeeId: options.employeeId,
    profileStatus: profile.profile_status,
    imageCount: profile.image_count,
    embeddingsSynced: embeddingResult.scannable,
  });

  return {
    success: true as const,
    profile,
    quality,
    embeddingsSynced: embeddingResult.scannable,
  };
}

export async function deleteFaceImage(imageId: number, employeeId: number) {
  const result = await pool.query(
    `
    SELECT efi.*, efp.employee_id
    FROM employee_face_images efi
    JOIN employee_face_profiles efp ON efp.id = efi.face_profile_id
    WHERE efi.id = $1 AND efi.employee_id = $2
    `,
    [imageId, employeeId]
  );

  if (!result.rows[0]) return null;

  await deleteFaceImageFile(result.rows[0].image_path);
  await removeEmbeddingsForImages([imageId]);
  await pool.query(`DELETE FROM employee_face_images WHERE id = $1`, [imageId]);
  await purgeStaleEmbeddings(employeeId);

  const profile = await getEmployeeFaceRegistration(employeeId);
  const embeddingResult = await rebuildEmployeeEmbeddings(employeeId);

  if (!(await getEmployeeFaceScanStatus(employeeId)).scannable) {
    await purgeFaceEventsForEmployee(employeeId);
  }

  publishRealtimeEvent("face_registration.updated", {
    employeeId,
    profileStatus: profile.profile_status,
    imageCount: profile.image_count,
    embeddingsSynced: embeddingResult.scannable,
  });

  return profile;
}

export async function deleteFaceImages(imageIds: number[], employeeId: number) {
  const uniqueIds = [...new Set(imageIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!uniqueIds.length) {
    const [profile, scanStatus] = await Promise.all([
      getEmployeeFaceRegistration(employeeId),
      getEmployeeFaceScanStatus(employeeId),
    ]);
    return { profile, embeddingsSynced: scanStatus.scannable };
  }

  const result = await pool.query(
    `
    SELECT efi.id, efi.image_path
    FROM employee_face_images efi
    WHERE efi.id = ANY($1::int[])
      AND efi.employee_id = $2
    `,
    [uniqueIds, employeeId]
  );

  if (!result.rows.length) return null;

  for (const row of result.rows) {
    await deleteFaceImageFile(row.image_path);
  }

  const deletedIds = result.rows.map((row) => Number(row.id));
  await removeEmbeddingsForImages(deletedIds);

  await pool.query(
    `
    DELETE FROM employee_face_images
    WHERE id = ANY($1::int[])
      AND employee_id = $2
    `,
    [uniqueIds, employeeId]
  );

  await purgeStaleEmbeddings(employeeId);

  const profile = await getEmployeeFaceRegistration(employeeId);
  const embeddingResult = await rebuildEmployeeEmbeddings(employeeId);

  if (!(await getEmployeeFaceScanStatus(employeeId)).scannable) {
    await purgeFaceEventsForEmployee(employeeId);
  }

  publishRealtimeEvent("face_registration.updated", {
    employeeId,
    profileStatus: profile.profile_status,
    imageCount: profile.image_count,
    embeddingsSynced: embeddingResult.scannable,
  });

  return {
    profile,
    embeddingsSynced: embeddingResult.scannable,
  };
}

export async function getFaceRegistrationStats(
  managerLocationId?: number | null
): Promise<FaceRegistrationStats> {
  const values: unknown[] = [];
  let whereClause = "WHERE COALESCE(e.status, 'ACTIVE') = 'ACTIVE'";

  if (managerLocationId) {
    whereClause += " AND e.location_id = $1";
    values.push(managerLocationId);
  }

  const result = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total_employees,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM employee_face_images efi WHERE efi.employee_id = e.id
        )
        AND EXISTS (
          SELECT 1 FROM face_embeddings fem
          WHERE fem.employee_id = e.id
            AND fem.embedding_data IS NOT NULL
            AND fem.embedding_data <> ''
        )
      )::int AS registered,
      COUNT(*) FILTER (
        WHERE COALESCE(efp.profile_status, 'NOT_REGISTERED') IN (
          'PARTIALLY_REGISTERED',
          'FULLY_REGISTERED'
        )
        AND NOT (
          EXISTS (SELECT 1 FROM employee_face_images efi WHERE efi.employee_id = e.id)
          AND EXISTS (
            SELECT 1 FROM face_embeddings fem
            WHERE fem.employee_id = e.id
              AND fem.embedding_data IS NOT NULL
              AND fem.embedding_data <> ''
          )
        )
      )::int AS partially_registered,
      COUNT(*) FILTER (
        WHERE NOT EXISTS (SELECT 1 FROM employee_face_images efi WHERE efi.employee_id = e.id)
           OR efp.id IS NULL
           OR COALESCE(efp.profile_status, 'NOT_REGISTERED') = 'NOT_REGISTERED'
      )::int AS pending
    FROM employees e
    LEFT JOIN employee_face_profiles efp ON efp.employee_id = e.id
    ${whereClause}
    `,
    values
  );

  const row = result.rows[0];
  const total = Number(row.total_employees || 0);
  const registered = Number(row.registered || 0);

  return {
    total_employees: total,
    registered,
    partially_registered: Number(row.partially_registered || 0),
    pending: Number(row.pending || 0),
    registration_percentage:
      total > 0 ? Math.round((registered / total) * 100) : 0,
  };
}

export async function employeeInLocation(
  employeeId: number,
  locationId: number
) {
  const result = await pool.query(
    `SELECT id FROM employees WHERE id = $1 AND location_id = $2`,
    [employeeId, locationId]
  );
  return result.rows.length > 0;
}

export async function getEnrollmentCamerasForEmployee(employeeId: number) {
  const employeeResult = await pool.query(
    `SELECT location_id FROM employees WHERE id = $1`,
    [employeeId]
  );
  const locationId = employeeResult.rows[0]?.location_id as number | null;

  const locationCameras = await getCameras({
    location_id: locationId ?? undefined,
    status: "ACTIVE",
  });

  let cameras = locationCameras;

  if (locationId && locationCameras.length === 0) {
    cameras = await getCameras({ status: "ACTIVE" });
  }

  return cameras
    .filter((camera) => {
      const streamInput = {
        camera_ip: camera.camera_ip,
        port: camera.port,
        rtsp_url: camera.rtsp_url,
      };
      return (
        isCctvConfiguredCamera(streamInput) ||
        resolveCameraMjpegUrl(streamInput) ||
        resolveCameraSnapshotUrl(streamInput)
      );
    })
    .map((camera) => ({
      id: camera.id,
      camera_name: camera.camera_name,
      camera_ip: camera.camera_ip,
      port: camera.port,
      rtsp_url: camera.rtsp_url,
      health_status: camera.health_status,
      location_name: camera.location_name,
    }))
    .sort((a, b) => {
      const rank = (status: string) =>
        status === "ONLINE" ? 0 : status === "WARNING" ? 1 : 2;
      return rank(a.health_status) - rank(b.health_status);
    });
}

export async function startLiveRegistrationSession(
  employeeId: number,
  sessionId: string
) {
  const profileRow = await getOrCreateFaceProfile(employeeId);
  const cameras = await getEnrollmentCamerasForEmployee(employeeId);
  await logFaceRegistrationAudit({
    employeeId,
    faceProfileId: profileRow.id,
    sessionId,
    eventType: "SESSION_STARTED",
    metadata: { mode: "live_enrollment", available_cameras: cameras.length },
  });

  return {
    sessionId,
    faceProfileId: profileRow.id as number,
    cameras,
  };
}

export async function completeLiveRegistrationSession(
  employeeId: number,
  sessionId: string
) {
  const profile = await getEmployeeFaceRegistration(employeeId);

  if (profile.profile_status !== "FULLY_REGISTERED") {
    return {
      success: false as const,
      message: "All required poses must be captured before completing live registration.",
      profile,
    };
  }

  await logFaceRegistrationAudit({
    employeeId,
    faceProfileId: profile.id,
    sessionId,
    eventType: "SESSION_COMPLETED",
    metadata: {
      image_count: profile.image_count,
      profile_status: profile.profile_status,
    },
  });

  const embeddingResult = await rebuildEmployeeEmbeddings(employeeId);

  await logFaceRegistrationAudit({
    employeeId,
    faceProfileId: profile.id,
    sessionId,
    eventType: "EMBEDDINGS_GENERATED",
    metadata: {
      success: embeddingResult.scannable,
      output: embeddingResult.output,
      stats: embeddingResult.stats,
    },
  });

  publishRealtimeEvent("face_registration.live_completed", {
    employeeId,
    sessionId,
    profileStatus: profile.profile_status,
    embeddingsSynced: embeddingResult.scannable,
  });

  if (!embeddingResult.scannable) {
    return {
      success: false as const,
      message:
        "All poses saved but AI embedding sync failed. Ensure Python AI service is running, then click Sync AI Embeddings.",
      profile,
      embeddingsSynced: false,
      embeddingOutput: embeddingResult.output,
    };
  }

  return {
    success: true as const,
    profile,
    embeddingsSynced: true,
    embeddingOutput: embeddingResult.output,
  };
}

export async function syncEmployeeFaceEmbeddings(employeeId: number) {
  const embeddingResult = await rebuildEmployeeEmbeddings(employeeId);

  publishRealtimeEvent("face_registration.updated", {
    employeeId,
    profileStatus: (
      await getEmployeeFaceScanStatus(employeeId)
    ).profile_status,
    imageCount: embeddingResult.imageCount,
    embeddingsSynced: embeddingResult.scannable,
  });

  return {
    success: embeddingResult.scannable,
    pythonExitOk: embeddingResult.pythonExitOk,
    scannable: embeddingResult.scannable,
    embeddingCount: embeddingResult.embeddingCount,
    imageCount: embeddingResult.imageCount,
    output: embeddingResult.output,
    reason: embeddingResult.reason,
    stats: embeddingResult.stats,
  };
}
