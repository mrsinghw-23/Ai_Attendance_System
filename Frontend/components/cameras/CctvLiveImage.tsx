"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendCacheBust,
  cctvLiveStreamUrl,
  cctvSnapshotUrl,
  resolveDirectStreamUrls,
} from "@/lib/cctv-live-stream";
import { formatProbeErrorCode } from "@/utils/camera-probe-errors";
import type { CameraStreamInput } from "@/utils/camera-stream";
import { isRtspCamera } from "@/utils/camera-stream";
import { Loader2, VideoOff } from "lucide-react";

export type CameraStreamStatus =
  | "connecting"
  | "live"
  | "offline"
  | "reconnecting";

type FeedMode =
  | "direct-mjpeg"
  | "proxy-mjpeg"
  | "direct-snapshot"
  | "proxy-snapshot";

interface CctvLiveImageProps {
  cameraId: number;
  enabled?: boolean;
  streamConfig?: CameraStreamInput | null;
  className?: string;
  alt?: string;
  imgRef?: React.RefObject<HTMLImageElement | null>;
  onStreamReady?: () => void;
  onStreamStatusChange?: (status: CameraStreamStatus) => void;
  onFrameReceived?: (at: Date) => void;
  targetFps?: number;
  /** Snapshot poll interval for RTSP/ONVIF cameras (default 500ms). */
  pollIntervalMs?: number;
  /** Lighter substream snapshot for live face scan (faster). */
  preview?: boolean;
  reconnectMs?: number;
}

const LIVE_IMAGE_CLASS =
  "h-full w-full object-cover [transform:translateZ(0)] [backface-visibility:hidden]";

function pickInitialMode(
  directMjpeg: string | null,
  directSnapshot: string | null,
  streamConfig?: CameraStreamInput | null
): FeedMode {
  if (streamConfig && isRtspCamera(streamConfig)) return "proxy-snapshot";
  if (directMjpeg) return "direct-mjpeg";
  if (directSnapshot) return "direct-snapshot";
  return "proxy-snapshot";
}

function resolveMjpegSrc(
  mode: FeedMode,
  cameraId: number,
  directMjpeg: string | null,
  session = Date.now()
): string | undefined {
  if (mode === "direct-mjpeg") return directMjpeg ?? undefined;
  if (mode === "proxy-mjpeg") return cctvLiveStreamUrl(cameraId, session);
  return undefined;
}

function nextFallback(
  mode: FeedMode,
  directSnapshot: string | null
): FeedMode | null {
  switch (mode) {
    case "direct-mjpeg":
      return directSnapshot ? "direct-snapshot" : "proxy-mjpeg";
    case "proxy-mjpeg":
      return "proxy-snapshot";
    case "direct-snapshot":
      return "proxy-snapshot";
    default:
      return null;
  }
}

function createFeedState(
  cameraId: number,
  streamConfig: CameraStreamInput | null | undefined
) {
  const { mjpeg: directMjpeg, snapshot: directSnapshot } =
    resolveDirectStreamUrls(streamConfig);
  const session = Date.now();
  const mode = pickInitialMode(directMjpeg, directSnapshot, streamConfig);

  return {
    mode,
    mjpegSrc: resolveMjpegSrc(mode, cameraId, directMjpeg, session),
    session,
    directMjpeg,
    directSnapshot,
  };
}

export default function CctvLiveImage({
  cameraId,
  enabled = true,
  streamConfig = null,
  className,
  alt = "Live CCTV feed",
  imgRef,
  onStreamReady,
  onStreamStatusChange,
  onFrameReceived,
  targetFps = 15,
  pollIntervalMs = 500,
  preview = false,
  reconnectMs = 5000,
}: CctvLiveImageProps) {
  const layer0Ref = useRef<HTMLImageElement>(null);
  const layer1Ref = useRef<HTMLImageElement>(null);
  const activeLayerRef = useRef(0);
  const objectUrlsRef = useRef<[string | null, string | null]>([null, null]);
  const failCountRef = useRef(0);
  const hasFirstFrameRef = useRef(false);
  const lastFrameAtRef = useRef(0);
  const layersMountedRef = useRef(0);

  const onStreamReadyRef = useRef(onStreamReady);
  const onFrameReceivedRef = useRef(onFrameReceived);
  const onStreamStatusChangeRef = useRef(onStreamStatusChange);
  onStreamReadyRef.current = onStreamReady;
  onFrameReceivedRef.current = onFrameReceived;
  onStreamStatusChangeRef.current = onStreamStatusChange;

  const emitStatus = useCallback((status: CameraStreamStatus) => {
    onStreamStatusChangeRef.current?.(status);
  }, []);

  const markFrameReceived = useCallback(() => {
    const now = Date.now();
    lastFrameAtRef.current = now;
    onFrameReceivedRef.current?.(new Date(now));
    emitStatus("live");
  }, [emitStatus]);

  const syncExternalRef = useCallback(
    (layer: number) => {
      const img = layer === 0 ? layer0Ref.current : layer1Ref.current;
      if (imgRef && "current" in imgRef && img) {
        (imgRef as React.MutableRefObject<HTMLImageElement | null>).current =
          img;
      }
    },
    [imgRef]
  );

  const [layersMounted, setLayersMounted] = useState(false);
  const [feed, setFeed] = useState(() => createFeedState(cameraId, streamConfig));
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
  const [activeLayer, setActiveLayer] = useState(0);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const { mode, mjpegSrc } = feed;

  const setLayer0Ref = useCallback(
    (node: HTMLImageElement | null) => {
      layer0Ref.current = node;
      const next =
        (layer0Ref.current ? 1 : 0) + (layer1Ref.current ? 1 : 0);
      if (layersMountedRef.current !== next) {
        layersMountedRef.current = next;
        setLayersMounted(next >= 1);
      }
      if (node && activeLayerRef.current === 0) {
        syncExternalRef(0);
      }
    },
    [syncExternalRef]
  );

  const setLayer1Ref = useCallback(
    (node: HTMLImageElement | null) => {
      layer1Ref.current = node;
      const next =
        (layer0Ref.current ? 1 : 0) + (layer1Ref.current ? 1 : 0);
      if (layersMountedRef.current !== next) {
        layersMountedRef.current = next;
        setLayersMounted(next >= 1);
      }
      if (node && activeLayerRef.current === 1) {
        syncExternalRef(1);
      }
    },
    [syncExternalRef]
  );

  const bumpFailover = useCallback(() => {
    failCountRef.current += 1;

    if (failCountRef.current < 2) {
      const session = Date.now();
      setFeed((current) => ({
        ...current,
        session,
        mjpegSrc: resolveMjpegSrc(
          current.mode,
          cameraId,
          current.directMjpeg,
          session
        ),
      }));
      return;
    }

    setFeed((current) => {
      const next = nextFallback(current.mode, current.directSnapshot);
      if (!next || next === current.mode) return current;

      failCountRef.current = 0;
      const session = Date.now();
      return {
        ...current,
        mode: next,
        session,
        mjpegSrc: resolveMjpegSrc(next, cameraId, current.directMjpeg, session),
      };
    });
  }, [cameraId]);

  const revokeLayerUrls = useCallback(() => {
    objectUrlsRef.current.forEach((url, index) => {
      if (url) {
        URL.revokeObjectURL(url);
        objectUrlsRef.current[index] = null;
      }
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    failCountRef.current = 0;
    hasFirstFrameRef.current = false;
    activeLayerRef.current = 0;
    setActiveLayer(0);
    setHasFirstFrame(false);
    setStreamError(null);
    setReconnecting(false);
    lastFrameAtRef.current = 0;
    emitStatus("connecting");
    revokeLayerUrls();
    setFeed(createFeedState(cameraId, streamConfig));
  }, [
    enabled,
    cameraId,
    streamConfig?.camera_ip,
    streamConfig?.port,
    streamConfig?.rtsp_url,
    emitStatus,
    revokeLayerUrls,
  ]);

  useEffect(() => {
    if (!enabled || !hasFirstFrame) return;

    const staleMs = Math.max(pollIntervalMs * 4, 3500);
    const timer = window.setInterval(() => {
      if (!lastFrameAtRef.current) return;
      if (Date.now() - lastFrameAtRef.current > staleMs) {
        emitStatus("offline");
      }
    }, 1500);

    return () => window.clearInterval(timer);
  }, [enabled, hasFirstFrame, pollIntervalMs, emitStatus]);

  useEffect(() => {
    if (!enabled || !layersMounted) return;
    if (mode !== "direct-snapshot" && mode !== "proxy-snapshot") return;

    let cancelled = false;
    let inflight = false;
    let pendingLoad = false;
    let retryTimer: number | undefined;
    const minIntervalMs = Math.max(700, pollIntervalMs);
    let lastFetchAt = 0;

    const baseUrl = cctvSnapshotUrl(cameraId, { preview });
    if (!baseUrl) return;

    const schedule = (delay = minIntervalMs) => {
      retryTimer = window.setTimeout(() => {
        if (!cancelled && !inflight) void loadFrame();
      }, delay);
    };

    const assignFrame = (src: string, isObjectUrl = false) => {
      const inactiveLayer = activeLayerRef.current === 0 ? 1 : 0;
      const targetImg =
        inactiveLayer === 0 ? layer0Ref.current : layer1Ref.current;
      if (!targetImg) return;

      pendingLoad = true;
      targetImg.onload = () => {
        if (cancelled) return;
        pendingLoad = false;

        if (isObjectUrl) {
          const previous = objectUrlsRef.current[inactiveLayer];
          if (previous && previous !== src) {
            URL.revokeObjectURL(previous);
          }
          objectUrlsRef.current[inactiveLayer] = src;
        }

        activeLayerRef.current = inactiveLayer;
        setActiveLayer(inactiveLayer);
        syncExternalRef(inactiveLayer);

        failCountRef.current = 0;
        lastFetchAt = Date.now();
        hasFirstFrameRef.current = true;
        setHasFirstFrame(true);
        setStreamError(null);
        setReconnecting(false);
        onStreamReadyRef.current?.();
        markFrameReceived();
      };
      targetImg.onerror = () => {
        pendingLoad = false;
        if (isObjectUrl) {
          URL.revokeObjectURL(src);
        }
        if (!hasFirstFrameRef.current) {
          setStreamError(formatProbeErrorCode("NO_FRAMES_RECEIVED"));
        }
      };
      targetImg.src = src;
    };

    const loadFrame = async () => {
      if (cancelled || inflight) return;
      if (pendingLoad) {
        schedule(Math.max(120, minIntervalMs / 2));
        return;
      }

      const elapsed = Date.now() - lastFetchAt;
      if (elapsed < minIntervalMs && hasFirstFrameRef.current) {
        schedule(minIntervalMs - elapsed);
        return;
      }

      inflight = true;
      const tick = Date.now();

      try {
        if (mode === "direct-snapshot") {
          const url = appendCacheBust(baseUrl, tick);
          if (cancelled) return;
          assignFrame(url, false);
        } else {
          const response = await fetch(appendCacheBust(baseUrl, tick), {
            cache: "no-store",
            credentials: "include",
          });

          const contentType = response.headers.get("content-type") || "";
          if (!response.ok) {
            let message = `Camera stream error (${response.status})`;
            if (contentType.includes("application/json")) {
              const payload = (await response.json()) as {
                message?: string;
                error_code?: string;
              };
              message =
                payload.message ||
                formatProbeErrorCode(payload.error_code) ||
                message;
            }
            throw new Error(message);
          }

          if (!contentType.includes("image")) {
            throw new Error(formatProbeErrorCode("NO_FRAMES_RECEIVED"));
          }

          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          if (cancelled) {
            URL.revokeObjectURL(objectUrl);
            return;
          }

          assignFrame(objectUrl, true);
        }

        lastFetchAt = tick;
        schedule(Math.max(0, minIntervalMs - (Date.now() - tick)));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : formatProbeErrorCode("NO_FRAMES_RECEIVED");
        setStreamError(message);
        if (!hasFirstFrameRef.current) {
          setReconnecting(true);
          emitStatus("offline");
        } else {
          emitStatus("reconnecting");
        }
        bumpFailover();
        schedule(reconnectMs);
      } finally {
        inflight = false;
      }
    };

    void loadFrame();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [
    enabled,
    layersMounted,
    mode,
    cameraId,
    feed.directSnapshot,
    pollIntervalMs,
    preview,
    reconnectMs,
    bumpFailover,
    markFrameReceived,
    syncExternalRef,
    emitStatus,
  ]);

  useEffect(() => revokeLayerUrls, [revokeLayerUrls]);

  if (!enabled) return null;

  const isMjpeg = mode === "direct-mjpeg" || mode === "proxy-mjpeg";
  const imageClass = className
    ? `${LIVE_IMAGE_CLASS} ${className}`
    : LIVE_IMAGE_CLASS;
  const snapshotClass = `${imageClass} absolute inset-0 transition-none`;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {isMjpeg && mjpegSrc ? (
        <img
          ref={(node) => {
            layer0Ref.current = node;
            if (node) syncExternalRef(0);
          }}
          src={mjpegSrc}
          alt={alt}
          className={imageClass}
          decoding="async"
          loading="eager"
          fetchPriority="high"
          onLoad={() => {
            failCountRef.current = 0;
            hasFirstFrameRef.current = true;
            setHasFirstFrame(true);
            setStreamError(null);
            onStreamReadyRef.current?.();
            markFrameReceived();
          }}
          onError={() => {
            setStreamError("Live stream disconnected");
            bumpFailover();
          }}
        />
      ) : (
        <>
          <img
            ref={setLayer0Ref}
            alt={alt}
            className={snapshotClass}
            style={{
              opacity: activeLayer === 0 ? 1 : 0,
              zIndex: activeLayer === 0 ? 2 : 1,
            }}
            decoding="async"
            loading="eager"
            fetchPriority="high"
          />
          <img
            ref={setLayer1Ref}
            alt=""
            aria-hidden
            className={snapshotClass}
            style={{
              opacity: activeLayer === 1 ? 1 : 0,
              zIndex: activeLayer === 1 ? 2 : 1,
            }}
            decoding="async"
            loading="eager"
            fetchPriority="high"
          />
        </>
      )}

      {!hasFirstFrame && (
        <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-2 bg-slate-950/80 px-4 text-center">
          {reconnecting ? (
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          ) : (
            <VideoOff className="h-8 w-8 text-slate-500" />
          )}
          <p className="text-xs text-slate-300">
            {streamError || "Connecting to camera..."}
          </p>
        </div>
      )}

      {hasFirstFrame && streamError && (
        <div className="absolute right-3 top-3 z-[4] rounded-full bg-amber-500/90 px-2 py-1 text-[10px] font-semibold text-white">
          Reconnecting…
        </div>
      )}
    </div>
  );
}
