/**
 * CP Plus RTSP URL builder — firmware path: /video/live?channel=&subtype=
 * Credentials are stored separately (encrypted password); URL stored without auth.
 */

export type RtspPathStyle = "video_live" | "realmonitor";

export type BuildRtspUrlInput = {
  host: string;
  rtspPort?: number;
  channel?: number;
  subtype?: number;
  username?: string | null;
  password?: string | null;
  /** Include credentials in URL (for OpenCV). Never persist or return to clients. */
  embedCredentials?: boolean;
  pathStyle?: RtspPathStyle;
};

export function rtspPathForStyle(
  pathStyle: RtspPathStyle,
  channel: number,
  subtype: number
): string {
  if (pathStyle === "realmonitor") {
    return `/cam/realmonitor?channel=${channel}&subtype=${subtype}`;
  }
  return `/video/live?channel=${channel}&subtype=${subtype}`;
}

export function buildCpPlusRtspUrl(input: BuildRtspUrlInput): string {
  const host = input.host.trim();
  const port = input.rtspPort ?? 554;
  const channel = input.channel ?? 1;
  const subtype = input.subtype ?? 0;
  const pathStyle = input.pathStyle ?? "video_live";
  const path = rtspPathForStyle(pathStyle, channel, subtype);

  if (input.embedCredentials && input.username) {
    const user = encodeURIComponent(input.username.trim());
    const pass = input.password
      ? encodeURIComponent(input.password)
      : "";
    const auth = pass ? `${user}:${pass}@` : `${user}@`;
    return `rtsp://${auth}${host}:${port}${path}`;
  }

  return `rtsp://${host}:${port}${path}`;
}

export function rtspUrlHasEmbeddedAuth(url: string): boolean {
  try {
    const parsed = new URL(url);
    return Boolean(parsed.username);
  } catch {
    return /rtsp:\/\/[^@/]+@/i.test(url);
  }
}

export function injectRtspCredentials(
  url: string,
  username?: string | null,
  password?: string | null
): string {
  const raw = url.trim();
  if (!raw.startsWith("rtsp://")) return raw;
  if (rtspUrlHasEmbeddedAuth(raw)) return raw;
  if (!username?.trim()) return raw;

  const withoutScheme = raw.slice("rtsp://".length).replace(/^[^@/]+@/, "");
  const user = encodeURIComponent(username.trim());
  const pass = password ? encodeURIComponent(password) : "";
  const auth = pass ? `${user}:${pass}@` : `${user}@`;
  return `rtsp://${auth}${withoutScheme}`;
}

export type CameraRtspFields = {
  camera_ip?: string | null;
  port?: number | null;
  rtsp_url?: string | null;
  rtsp_username?: string | null;
  rtsp_password?: string | null;
  rtsp_channel?: number | null;
  rtsp_subtype?: number | null;
  brand?: string | null;
};

export function pathStyleForBrand(brand?: string | null): RtspPathStyle {
  const normalized = (brand || "").toLowerCase();
  if (normalized.includes("dahua") || normalized.includes("hikvision")) {
    return "realmonitor";
  }
  return "video_live";
}

/** Stored in DB — no credentials. */
export function buildStoredRtspUrl(camera: CameraRtspFields): string | null {
  const host = camera.camera_ip?.trim();
  if (!host) return null;

  return buildCpPlusRtspUrl({
    host,
    rtspPort: camera.port ?? 554,
    channel: camera.rtsp_channel ?? 1,
    subtype: camera.rtsp_subtype ?? 0,
    pathStyle: pathStyleForBrand(camera.brand),
    embedCredentials: false,
  });
}

/** For OpenCV / health probe — credentials embedded when available. */
export function resolveRtspStreamUrlWithAuth(
  camera: CameraRtspFields,
  decryptedPassword?: string | null
): string | null {
  const password =
    camera.rtsp_password?.trim() ||
    decryptedPassword?.trim() ||
    null;

  const stored = camera.rtsp_url?.trim();
  if (stored?.startsWith("rtsp://")) {
    return injectRtspCredentials(
      stored,
      camera.rtsp_username,
      password
    );
  }

  const host = camera.camera_ip?.trim();
  if (!host) return null;

  return buildCpPlusRtspUrl({
    host,
    rtspPort: camera.port ?? 554,
    channel: camera.rtsp_channel ?? 1,
    subtype: camera.rtsp_subtype ?? 0,
    username: camera.rtsp_username,
    password,
    embedCredentials: true,
    pathStyle: pathStyleForBrand(camera.brand),
  });
}

export function sanitizeRtspUrlForApi(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "********";
    if (parsed.username) parsed.username = "********";
    return parsed.toString();
  } catch {
    return url.replace(/:([^:@/]+)@/, ":********@");
  }
}

export type ParsedDirectRtsp = {
  camera_ip: string;
  port: number;
  rtsp_username: string;
  rtsp_password: string;
  rtsp_channel: number;
  rtsp_subtype: number;
  rtsp_url: string;
  rtsp_stream_url: string;
};

/** Parse full RTSP URL pasted from camera firmware / VLC. Credentials extracted for secure storage. */
export function parseDirectRtspUrl(directUrl: string): ParsedDirectRtsp | null {
  const raw = directUrl.trim();
  if (!raw.startsWith("rtsp://")) return null;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname?.trim();
    if (!host) return null;

    const port = parsed.port ? Number(parsed.port) : 554;
    const username = decodeURIComponent(parsed.username || "");
    const password = decodeURIComponent(parsed.password || "");
    const channel = Number(parsed.searchParams.get("channel") || 1);
    const subtype = Number(parsed.searchParams.get("subtype") || 0);
    const pathStyle: RtspPathStyle = parsed.pathname.includes("realmonitor")
      ? "realmonitor"
      : "video_live";

    const rtsp_url = buildCpPlusRtspUrl({
      host,
      rtspPort: port,
      channel,
      subtype,
      pathStyle,
      embedCredentials: false,
    });

    const rtsp_stream_url =
      username && password
        ? injectRtspCredentials(rtsp_url, username, password)
        : rtspUrlHasEmbeddedAuth(raw)
          ? raw
          : injectRtspCredentials(rtsp_url, username, password);

    return {
      camera_ip: host,
      port,
      rtsp_username: username,
      rtsp_password: password,
      rtsp_channel: channel,
      rtsp_subtype: subtype,
      rtsp_url,
      rtsp_stream_url,
    };
  } catch {
    return null;
  }
}

export function resolveRtspStreamUrlFromDirectOrFields(
  camera: CameraRtspFields & { rtsp_direct_url?: string | null },
  decryptedPassword?: string | null
): string | null {
  if (camera.rtsp_direct_url?.trim()) {
    const parsed = parseDirectRtspUrl(camera.rtsp_direct_url);
    if (parsed) return parsed.rtsp_stream_url;
  }

  return resolveRtspStreamUrlWithAuth(camera, decryptedPassword);
}
