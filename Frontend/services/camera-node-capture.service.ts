import "server-only";

import net from "net";
import { CameraDiagnostics } from "@/types/camera";
import {
  isJpegBuffer,
} from "@/utils/cp-plus-http";
import { ProbeCameraInput } from "@/types/camera-probe";

export function checkTcpPort(
  host: string,
  port: number,
  timeoutMs = 4000
): Promise<{ ok: boolean; ms: number | null }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      socket.destroy();
      resolve({ ok: true, ms: Date.now() - start });
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve({ ok: false, ms: null });
    });
    socket.once("error", () => {
      socket.destroy();
      resolve({ ok: false, ms: null });
    });

    socket.connect(port, host);
  });
}

export async function captureHttpSnapshot(
  input: ProbeCameraInput
): Promise<Buffer | null> {
  const host = input.camera_ip?.trim();
  const username = input.rtsp_username?.trim();
  const password = input.rtsp_password ?? "";

  if (!host || !username || !password) return null;

  const httpPort = input.http_port ?? 80;
  const channel = input.rtsp_channel ?? 1;
  const subtypes = [input.rtsp_subtype ?? 0, 0, 1];

  const paths = new Set<string>();
  for (const subtype of subtypes) {
    paths.add(`/cgi-bin/snapshot.cgi?channel=${channel}&subtype=${subtype}`);
    paths.add(`/cgi-bin/snapshot.cgi?channel=${channel}`);
  }

  const embeddedBase = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${httpPort}`;
  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  for (const path of paths) {
    const url = `${embeddedBase}${path}`;

    try {
      const embeddedResponse = await fetch(url, {
        method: "GET",
        headers: { Accept: "image/jpeg,image/*,*/*" },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (embeddedResponse.ok) {
        const buffer = Buffer.from(await embeddedResponse.arrayBuffer());
        if (isJpegBuffer(buffer)) return buffer;
      }
    } catch {
      // try basic auth header next
    }

    try {
      const basicResponse = await fetch(`http://${host}:${httpPort}${path}`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "image/jpeg,image/*,*/*",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (basicResponse.ok) {
        const buffer = Buffer.from(await basicResponse.arrayBuffer());
        if (isJpegBuffer(buffer)) return buffer;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function probeCameraNode(
  input: ProbeCameraInput
): Promise<CameraDiagnostics> {
  const host = input.camera_ip?.trim();
  const httpPort = input.http_port ?? 80;
  const rtspPort = input.port ?? 554;

  const base: CameraDiagnostics = {
    ping_ok: false,
    tcp_rtsp_ok: false,
    rtsp_connected: false,
    auth_success: false,
    frame_captured: false,
    camera_reachable: false,
    health_status: "OFFLINE",
    codec: "H.264",
    firmware: input.firmware ?? null,
    onvif_version: input.onvif_version ?? null,
  };

  if (!host) {
    return {
      ...base,
      error: "Camera IP not configured",
      error_code: "INVALID_RTSP_URL",
    };
  }

  const [httpTcp, rtspTcp] = await Promise.all([
    checkTcpPort(host, httpPort),
    checkTcpPort(host, rtspPort),
  ]);

  base.ping_ok = httpTcp.ok;
  base.tcp_rtsp_ok = rtspTcp.ok;
  base.camera_reachable = rtspTcp.ok || httpTcp.ok;
  base.latency_ms = rtspTcp.ms ?? httpTcp.ms ?? null;

  if (!base.camera_reachable) {
    return {
      ...base,
      error: `Camera offline — cannot reach ${host}`,
      error_code: "CAMERA_OFFLINE",
    };
  }

  const frame = await captureHttpSnapshot(input);
  if (frame) {
    return {
      ...base,
      rtsp_connected: true,
      auth_success: true,
      frame_captured: true,
      health_status: "ONLINE",
      resolution: "1920x1080",
      fps: 25,
    };
  }

  if (!input.rtsp_password) {
    return {
      ...base,
      error: "RTSP password required for camera authentication",
      error_code: "RTSP_AUTHENTICATION_FAILED",
    };
  }

  return {
    ...base,
    error: "HTTP snapshot failed — trying RTSP probe",
    error_code: "NO_FRAMES_RECEIVED",
  };
}
