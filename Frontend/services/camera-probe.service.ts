import "server-only";

import { spawn } from "child_process";
import path from "path";
import { CameraDiagnostics } from "@/types/camera";
import {
  getCameraStreamSecrets,
} from "@/services/camera-stream-credentials.service";
import { ProbeCameraInput } from "@/types/camera-probe";
import {
  parseDirectRtspUrl,
  resolveRtspStreamUrlWithAuth,
} from "@/utils/rtsp-url";
import {
  probeCameraNode,
} from "@/services/camera-node-capture.service";

function pythonPaths() {
  const repoRoot = path.resolve(process.cwd(), "..");
  const serviceDir = path.join(repoRoot, "AI-Recognition-Service");
  const pythonBin =
    process.env.AI_PYTHON_PATH ||
    path.join(serviceDir, ".venv", "Scripts", "python.exe");
  return { serviceDir, pythonBin };
}

function pythonEnv() {
  return {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    CREDENTIAL_ENCRYPTION_KEY:
      process.env.CREDENTIAL_ENCRYPTION_KEY ||
      process.env.JWT_SECRET ||
      "AI_ATTENDANCE_SUPER_SECRET_2026",
    DB_HOST: process.env.DB_HOST || "localhost",
    DB_PORT: process.env.DB_PORT || "5432",
    DB_NAME: process.env.DB_NAME || "ai_attendance_db",
    DB_USER: process.env.DB_USER || "postgres",
    DB_PASSWORD: process.env.DB_PASSWORD || "postgres@123",
  };
}

function mergeProbe(
  nodeResult: CameraDiagnostics,
  pythonResult: CameraDiagnostics
): CameraDiagnostics {
  if (nodeResult.frame_captured) {
    return {
      ...pythonResult,
      ...nodeResult,
      rtsp_connected: nodeResult.rtsp_connected || pythonResult.rtsp_connected,
      auth_success: nodeResult.auth_success || pythonResult.auth_success,
      frame_captured: true,
      health_status: "ONLINE",
      resolution: pythonResult.resolution || nodeResult.resolution,
      width: pythonResult.width ?? nodeResult.width,
      height: pythonResult.height ?? nodeResult.height,
      fps: pythonResult.fps ?? nodeResult.fps,
      codec: pythonResult.codec ?? nodeResult.codec,
      latency_ms: pythonResult.latency_ms ?? nodeResult.latency_ms,
      error: undefined,
      error_code: undefined,
    };
  }

  if (pythonResult.frame_captured) {
    return {
      ...nodeResult,
      ...pythonResult,
      ping_ok: nodeResult.ping_ok || pythonResult.ping_ok,
      tcp_rtsp_ok: nodeResult.tcp_rtsp_ok || pythonResult.tcp_rtsp_ok,
      camera_reachable:
        nodeResult.camera_reachable || pythonResult.camera_reachable,
      health_status: "ONLINE",
    };
  }

  return {
    ...nodeResult,
    ...pythonResult,
    frame_captured: false,
    health_status:
      nodeResult.camera_reachable || pythonResult.camera_reachable
        ? "WARNING"
        : "OFFLINE",
    error: pythonResult.error || nodeResult.error,
    error_code: pythonResult.error_code || nodeResult.error_code,
  };
}

async function runProbeScript(
  args: string[],
  stdin?: string
): Promise<CameraDiagnostics> {
  const { serviceDir, pythonBin } = pythonPaths();
  const scriptPath = path.join(serviceDir, "probe_camera.py");

  return new Promise((resolve) => {
    const proc = spawn(pythonBin, [scriptPath, ...args], {
      cwd: serviceDir,
      env: pythonEnv(),
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += String(chunk);
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += String(chunk);
    });

    if (stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    }

    proc.on("close", () => {
      try {
        const parsed = JSON.parse(stdout.trim() || "{}") as CameraDiagnostics;
        if (!parsed.error && stderr && !parsed.success) {
          parsed.error = stderr.slice(0, 200);
        }
        resolve(parsed);
      } catch {
        resolve({
          success: false,
          ping_ok: false,
          tcp_rtsp_ok: false,
          rtsp_connected: false,
          auth_success: false,
          frame_captured: false,
          camera_reachable: false,
          health_status: "OFFLINE",
          error: stderr || stdout.slice(0, 200) || "Probe script failed",
          error_code: "DECODER_FAILED",
        });
      }
    });

    proc.on("error", () => {
      resolve({
        success: false,
        ping_ok: false,
        tcp_rtsp_ok: false,
        rtsp_connected: false,
        auth_success: false,
        frame_captured: false,
        camera_reachable: false,
        health_status: "OFFLINE",
        error:
          "Python AI service not available. Install AI-Recognition-Service/.venv",
        error_code: "DECODER_FAILED",
      });
    });
  });
}

function normalizeProbeInput(input: ProbeCameraInput): ProbeCameraInput {
  return {
    camera_ip: input.camera_ip,
    port: input.port ?? 554,
    http_port: input.http_port ?? 80,
    rtsp_username: input.rtsp_username ?? "",
    rtsp_password: input.rtsp_password ?? "",
    rtsp_channel: input.rtsp_channel ?? 1,
    rtsp_subtype: input.rtsp_subtype ?? 0,
    brand: input.brand ?? "CP Plus",
    firmware: input.firmware ?? null,
    onvif_version: input.onvif_version ?? null,
    rtsp_direct_url: input.rtsp_direct_url ?? null,
    rtsp_stream_url: input.rtsp_stream_url ?? null,
  };
}

function buildStreamUrlForProbe(input: ProbeCameraInput): string | null {
  if (input.rtsp_direct_url?.trim()) {
    const parsed = parseDirectRtspUrl(input.rtsp_direct_url);
    if (parsed) return parsed.rtsp_stream_url;
  }

  if (input.rtsp_stream_url?.trim()) {
    return input.rtsp_stream_url.trim();
  }

  return resolveRtspStreamUrlWithAuth({
    camera_ip: input.camera_ip,
    port: input.port,
    rtsp_username: input.rtsp_username,
    rtsp_password: input.rtsp_password,
    rtsp_channel: input.rtsp_channel,
    rtsp_subtype: input.rtsp_subtype,
    brand: input.brand,
  });
}

function resolveProbePassword(input: ProbeCameraInput): string {
  if (input.rtsp_password?.trim()) {
    return input.rtsp_password.trim();
  }

  if (input.rtsp_direct_url?.trim()) {
    const parsed = parseDirectRtspUrl(input.rtsp_direct_url);
    if (parsed?.rtsp_password) return parsed.rtsp_password;
  }

  if (input.rtsp_stream_url?.trim()) {
    try {
      const parsed = new URL(input.rtsp_stream_url);
      if (parsed.password) return decodeURIComponent(parsed.password);
    } catch {
      // ignore malformed URL
    }
  }

  return "";
}

export async function probeCameraConfig(
  input: ProbeCameraInput
): Promise<CameraDiagnostics> {
  const payload = normalizeProbeInput(input);
  const nodeResult = await probeCameraNode(payload);

  if (nodeResult.frame_captured) {
    return { ...nodeResult, success: true };
  }

  const rtspStreamUrl = buildStreamUrlForProbe(payload);
  const probePassword = resolveProbePassword({
    ...payload,
    rtsp_stream_url: rtspStreamUrl,
  });
  const pythonPayload = {
    ...payload,
    rtsp_password: probePassword,
    rtsp_stream_url: rtspStreamUrl,
  };

  const pythonResult = await runProbeScript(
    ["--json-stdin"],
    JSON.stringify(pythonPayload)
  );

  return mergeProbe(nodeResult, pythonResult);
}

export async function probeCameraById(
  cameraId: number
): Promise<CameraDiagnostics> {
  const camera = await getCameraStreamSecrets(cameraId);
  if (!camera?.camera_ip) {
    return {
      ping_ok: false,
      tcp_rtsp_ok: false,
      rtsp_connected: false,
      auth_success: false,
      frame_captured: false,
      camera_reachable: false,
      health_status: "OFFLINE",
      error: "Camera not found or IP not configured",
      error_code: "INVALID_RTSP_URL",
    };
  }

  const input = normalizeProbeInput({
    camera_ip: camera.camera_ip,
    http_port: camera.http_port,
    port: camera.port,
    rtsp_username: camera.rtsp_username,
    rtsp_password: camera.rtsp_password,
    rtsp_channel: camera.rtsp_channel,
    rtsp_subtype: camera.rtsp_subtype,
    brand: camera.brand,
    firmware: camera.firmware,
    onvif_version: camera.onvif_version,
    rtsp_stream_url: resolveRtspStreamUrlWithAuth({
      camera_ip: camera.camera_ip,
      port: camera.port,
      rtsp_url: camera.rtsp_url,
      rtsp_username: camera.rtsp_username,
      rtsp_password: camera.rtsp_password,
      rtsp_channel: camera.rtsp_channel,
      rtsp_subtype: camera.rtsp_subtype,
      brand: camera.brand,
    }),
  });

  const nodeResult = await probeCameraNode(input);
  const pythonResult = await runProbeScript(
    ["--json-stdin"],
    JSON.stringify({
      ...input,
      rtsp_stream_url: input.rtsp_stream_url,
    })
  );
  const merged = mergeProbe(nodeResult, {
    ...pythonResult,
    camera_id: cameraId,
    camera_name: camera.camera_name,
  });

  return {
    ...merged,
    success: merged.frame_captured,
    camera_id: cameraId,
    camera_name: camera.camera_name,
  };
}

export async function captureCameraFrameRtsp(
  cameraId: number,
  preview = false
): Promise<Buffer | null> {
  const { serviceDir, pythonBin } = pythonPaths();
  const scriptPath = path.join(serviceDir, "capture_frame.py");
  const args = preview
    ? [scriptPath, String(cameraId), "--preview"]
    : [scriptPath, String(cameraId)];

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const proc = spawn(pythonBin, args, {
      cwd: serviceDir,
      env: pythonEnv(),
    });

    proc.stdout.on("data", (data: Buffer) => chunks.push(data));
    proc.stderr.on("data", (data: Buffer) => {
      console.error(`capture_frame stderr: ${String(data)}`);
    });

    proc.on("close", (code) => {
      if (code !== 0 || chunks.length === 0) {
        resolve(null);
        return;
      }
      const buffer = Buffer.concat(chunks);
      if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        resolve(buffer);
        return;
      }
      resolve(null);
    });

    proc.on("error", () => resolve(null));
  });
}
