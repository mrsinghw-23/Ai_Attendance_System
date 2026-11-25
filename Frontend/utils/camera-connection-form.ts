import { CreateCameraInput } from "@/schemas/camera.schema";
import {
  buildCpPlusRtspUrl,
  parseDirectRtspUrl,
  pathStyleForBrand,
} from "@/utils/rtsp-url";

export type CameraConnectionMode = "direct" | "manual";

export type ConnectionProbePayload = {
  camera_ip: string;
  http_port: number;
  port: number;
  rtsp_channel: number;
  rtsp_subtype: number;
  rtsp_username: string;
  rtsp_password?: string;
  rtsp_direct_url?: string;
  brand?: string;
  firmware?: string;
  onvif_version?: string;
};

export function buildManualRtspPreview(
  values: Pick<
    CreateCameraInput,
    "camera_ip" | "port" | "rtsp_channel" | "rtsp_subtype" | "brand"
  >
): string {
  if (!values.camera_ip?.trim()) return "";

  return buildCpPlusRtspUrl({
    host: values.camera_ip,
    rtspPort: values.port ?? 554,
    channel: values.rtsp_channel ?? 1,
    subtype: values.rtsp_subtype ?? 0,
    pathStyle: pathStyleForBrand(values.brand),
    embedCredentials: false,
  });
}

export function applyDirectUrlToFormValues(
  current: CreateCameraInput,
  directUrl: string
): CreateCameraInput {
  const parsed = parseDirectRtspUrl(directUrl);
  if (!parsed) {
    return { ...current, rtsp_direct_url: directUrl };
  }

  return {
    ...current,
    rtsp_direct_url: directUrl,
    camera_ip: parsed.camera_ip,
    port: parsed.port,
    rtsp_channel: parsed.rtsp_channel,
    rtsp_subtype: parsed.rtsp_subtype,
    rtsp_username: parsed.rtsp_username || current.rtsp_username,
    rtsp_password: parsed.rtsp_password || current.rtsp_password,
  };
}

export function buildConnectionPayload(
  values: CreateCameraInput,
  mode: CameraConnectionMode,
  options?: { hasStoredPassword?: boolean }
):
  | { ok: true; data: ConnectionProbePayload }
  | { ok: false; error: string; field?: string } {
  if (mode === "direct") {
    const directUrl = values.rtsp_direct_url?.trim() || "";
    if (!directUrl) {
      return {
        ok: false,
        error: "Paste your camera RTSP URL from CP Plus firmware or VLC",
        field: "rtsp_direct_url",
      };
    }

    const parsed = parseDirectRtspUrl(directUrl);
    if (!parsed) {
      return {
        ok: false,
        error:
          "Invalid RTSP URL. Example: rtsp://admin:Admin%40123@192.168.29.23:554/video/live?channel=1&subtype=0",
        field: "rtsp_direct_url",
      };
    }

    if (!parsed.rtsp_password) {
      return {
        ok: false,
        error: "RTSP URL must include username and password",
        field: "rtsp_direct_url",
      };
    }

    return {
      ok: true,
      data: {
        camera_ip: parsed.camera_ip,
        http_port: values.http_port ?? 80,
        port: parsed.port,
        rtsp_channel: parsed.rtsp_channel,
        rtsp_subtype: parsed.rtsp_subtype,
        rtsp_username: parsed.rtsp_username,
        rtsp_password: parsed.rtsp_password,
        rtsp_direct_url: directUrl,
        brand: values.brand,
        firmware: values.firmware,
        onvif_version: values.onvif_version,
      },
    };
  }

  if (!values.camera_ip?.trim()) {
    return {
      ok: false,
      error: "Enter camera IP address",
      field: "camera_ip",
    };
  }

  if (!values.rtsp_username?.trim()) {
    return {
      ok: false,
      error: "Enter RTSP username",
      field: "rtsp_username",
    };
  }

  const password = values.rtsp_password?.trim() || "";
  if (!password && !options?.hasStoredPassword) {
    return {
      ok: false,
      error: "Enter RTSP password",
      field: "rtsp_password",
    };
  }

  return {
    ok: true,
    data: {
      camera_ip: values.camera_ip.trim(),
      http_port: values.http_port ?? 80,
      port: values.port ?? 554,
      rtsp_channel: values.rtsp_channel ?? 1,
      rtsp_subtype: values.rtsp_subtype ?? 0,
      rtsp_username: values.rtsp_username.trim(),
      rtsp_password: password || undefined,
      brand: values.brand,
      firmware: values.firmware,
      onvif_version: values.onvif_version,
    },
  };
}

export function prepareSubmitData(
  values: CreateCameraInput,
  mode: CameraConnectionMode,
  options?: { hasStoredPassword?: boolean }
):
  | { ok: true; data: CreateCameraInput }
  | { ok: false; error: string; field?: string } {
  const payload = buildConnectionPayload(values, mode, options);
  if (!payload.ok) return payload;

  const submitData: CreateCameraInput = {
    ...values,
    camera_ip: payload.data.camera_ip,
    http_port: payload.data.http_port,
    port: payload.data.port,
    rtsp_channel: payload.data.rtsp_channel,
    rtsp_subtype: payload.data.rtsp_subtype,
    rtsp_username: payload.data.rtsp_username,
  };

  if (mode === "direct") {
    submitData.rtsp_direct_url = payload.data.rtsp_direct_url;
    if (payload.data.rtsp_password) {
      submitData.rtsp_password = payload.data.rtsp_password;
    }
  } else {
    submitData.rtsp_direct_url = "";
    if (payload.data.rtsp_password) {
      submitData.rtsp_password = payload.data.rtsp_password;
    }
  }

  return { ok: true, data: submitData };
}
