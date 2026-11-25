import "server-only";

import pool from "@/lib/db";
import { decryptSecret, hasEncryptedSecret } from "@/utils/crypto";

export type CameraStreamSecrets = {
  id: number;
  camera_name: string;
  camera_ip: string | null;
  http_port: number;
  port: number;
  rtsp_channel: number;
  rtsp_subtype: number;
  rtsp_url: string | null;
  rtsp_username: string | null;
  rtsp_password: string;
  brand: string | null;
  firmware: string | null;
  onvif_version: string | null;
  status: "ACTIVE" | "INACTIVE";
};

export async function getCameraStreamSecrets(
  cameraId: number
): Promise<CameraStreamSecrets | null> {
  const result = await pool.query(
    `
    SELECT
      id,
      camera_name,
      COALESCE(status, 'ACTIVE') AS status,
      camera_ip,
      http_port,
      port,
      rtsp_channel,
      rtsp_subtype,
      rtsp_url,
      rtsp_username,
      rtsp_password_enc,
      brand,
      firmware,
      onvif_version
    FROM cameras
    WHERE id = $1
    `,
    [cameraId]
  );

  const row = result.rows[0];
  if (!row) return null;

  const password = hasEncryptedSecret(row.rtsp_password_enc as string)
    ? decryptSecret(String(row.rtsp_password_enc))
    : "";

  return {
    id: row.id as number,
    camera_name: row.camera_name as string,
    camera_ip: (row.camera_ip as string) || null,
    http_port: Number(row.http_port ?? 80),
    port: Number(row.port ?? 554),
    rtsp_channel: Number(row.rtsp_channel ?? 1),
    rtsp_subtype: Number(row.rtsp_subtype ?? 0),
    rtsp_url: (row.rtsp_url as string) || null,
    rtsp_username: (row.rtsp_username as string) || null,
    rtsp_password: password,
    brand: (row.brand as string) || null,
    firmware: (row.firmware as string) || null,
    onvif_version: (row.onvif_version as string) || null,
    status: (row.status as "ACTIVE" | "INACTIVE") || "ACTIVE",
  };
}
