"use client";



import { useCallback, useEffect, useRef, useState } from "react";

import { Loader2, VideoOff } from "lucide-react";

import type { CameraStreamStatus } from "@/components/cameras/CctvLiveImage";



export interface PcWebcamDeviceInfo {

  width: number;

  height: number;

  label: string;

  frameRate: number;

}



interface PcWebcamFeedProps {

  enabled?: boolean;

  className?: string;

  imgRef?: React.RefObject<HTMLImageElement | null>;

  videoRef?: React.RefObject<HTMLVideoElement | null>;

  onStreamStatusChange?: (status: CameraStreamStatus) => void;

  onFrameReceived?: (at: Date) => void;

  onDeviceReady?: (info: PcWebcamDeviceInfo) => void;

  /** Target frame delivery interval (~30fps default). */

  frameIntervalMs?: number;

  /** When false, skips JPEG img sync — scanner reads video directly (smoother HD). */

  syncToImage?: boolean;

  hdMode?: boolean;

}



const HD_VIDEO_CONSTRAINTS: MediaTrackConstraints = {

  facingMode: "user",

  width: { ideal: 1920, min: 1280 },

  height: { ideal: 1080, min: 720 },

  frameRate: { ideal: 30, min: 24 },

  aspectRatio: { ideal: 16 / 9 },

};



async function applyBestHdConstraints(track: MediaStreamTrack) {

  const capabilities = track.getCapabilities?.();

  if (!capabilities?.width?.max || !capabilities.height?.max) return;



  const targetWidth = Math.min(1920, capabilities.width.max);

  const targetHeight = Math.min(1080, capabilities.height.max);

  const maxFrameRate = capabilities.frameRate?.max ?? 30;



  try {

    await track.applyConstraints({

      width: { ideal: targetWidth },

      height: { ideal: targetHeight },

      frameRate: { ideal: Math.min(30, maxFrameRate) },

    });

  } catch {

    // keep browser-selected profile

  }

}



export default function PcWebcamFeed({

  enabled = true,

  className,

  imgRef,

  videoRef,

  onStreamStatusChange,

  onFrameReceived,

  onDeviceReady,

  frameIntervalMs = 33,

  syncToImage = false,

  hdMode = true,

}: PcWebcamFeedProps) {

  const localVideoRef = useRef<HTMLVideoElement>(null);

  const streamRef = useRef<MediaStream | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const lastSyncRef = useRef(0);

  const onFrameRef = useRef(onFrameReceived);

  const onStatusRef = useRef(onStreamStatusChange);

  const onDeviceRef = useRef(onDeviceReady);

  onFrameRef.current = onFrameReceived;

  onStatusRef.current = onStreamStatusChange;

  onDeviceRef.current = onDeviceReady;



  const [ready, setReady] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);

  const publishDeviceInfo = useCallback(

    (video: HTMLVideoElement, stream: MediaStream) => {

      const track = stream.getVideoTracks()[0];

      const settings = track?.getSettings();

      onDeviceRef.current?.({

        width: settings?.width || video.videoWidth || 0,

        height: settings?.height || video.videoHeight || 0,

        label: track?.label || "PC Webcam",

        frameRate: settings?.frameRate || 0,

      });

    },

    []

  );



  const attachStream = useCallback(

    async (video: HTMLVideoElement, stream: MediaStream) => {

      video.srcObject = stream;

      try {

        await video.play();

        const track = stream.getVideoTracks()[0];

        if (hdMode && track) {

          await applyBestHdConstraints(track);

        }

        setReady(true);

        setError(null);

        onStatusRef.current?.("live");

        publishDeviceInfo(video, stream);

      } catch {

        onStatusRef.current?.("offline");

        setError("Could not start video playback");

      }

    },

    [hdMode, publishDeviceInfo]

  );



  const bindVideoRef = useCallback(

    (node: HTMLVideoElement | null) => {

      localVideoRef.current = node;

      if (videoRef && "current" in videoRef) {

        (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current =

          node;

      }

      if (node && streamRef.current) {

        void attachStream(node, streamRef.current);

      }

    },

    [attachStream, videoRef]

  );

  const stopStream = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = localVideoRef.current;
    if (video) video.srcObject = null;
    setReady(false);
  }, []);

  const scheduleReconnect = useCallback(
    (delayMs: number) => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        stopStream();
        startStreamRef.current();
      }, delayMs);
    },
    [stopStream]
  );

  const startStreamRef = useRef<() => void>(() => {});

  const startStream = useCallback(() => {
    if (!enabled) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera API not supported in this browser");
      onStatusRef.current?.("offline");
      return;
    }

    setError(null);
    onStatusRef.current?.(
      reconnectAttemptRef.current > 0 ? "reconnecting" : "connecting"
    );

    navigator.mediaDevices
      .getUserMedia({
        video: hdMode ? HD_VIDEO_CONSTRAINTS : { facingMode: "user" },
        audio: false,
      })
      .then((stream) => {
        reconnectAttemptRef.current = 0;
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        if (track) {
          track.onended = () => {
            setReady(false);
            onStatusRef.current?.("reconnecting");
            reconnectAttemptRef.current += 1;
            scheduleReconnect(
              Math.min(8000, 1500 + reconnectAttemptRef.current * 500)
            );
          };
        }
        const video = localVideoRef.current;
        if (video) void attachStream(video, stream);
      })
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : "Could not access PC camera";
        setError(message);
        setReady(false);
        onStatusRef.current?.("offline");
        reconnectAttemptRef.current += 1;
        scheduleReconnect(
          Math.min(10000, 2000 + reconnectAttemptRef.current * 800)
        );
      });
  }, [attachStream, enabled, hdMode, scheduleReconnect]);

  startStreamRef.current = startStream;

  useEffect(() => {
    if (!enabled) {
      stopStream();
      setError(null);
      onStatusRef.current?.("connecting");
      reconnectAttemptRef.current = 0;
      return;
    }

    startStream();

    return () => {
      stopStream();
      reconnectAttemptRef.current = 0;
    };
  }, [enabled, hdMode, startStream, stopStream]);



  useEffect(() => {

    if (!enabled || !ready) return;



    let cancelled = false;

    let raf = 0;

    let videoFrameHandle = 0;

    const canvas = document.createElement("canvas");

    canvasRef.current = canvas;



    const deliverFrame = (now: number) => {

      if (cancelled) return;

      if (now - lastSyncRef.current < frameIntervalMs) return;



      const video = localVideoRef.current;

      if (!video || video.readyState < 2 || !video.videoWidth) return;



      lastSyncRef.current = now;



      const hiddenImg = imgRef?.current;

      if (syncToImage && hiddenImg) {

        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {

          canvas.width = video.videoWidth;

          canvas.height = video.videoHeight;

        }

        const ctx = canvas.getContext("2d");

        if (!ctx) return;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        hiddenImg.onload = () => onFrameRef.current?.(new Date());

        hiddenImg.src = canvas.toDataURL("image/jpeg", 0.92);

      } else {

        onFrameRef.current?.(new Date(now));

      }

    };



    const video = localVideoRef.current;

    const supportsVideoFrameCallback =

      video &&

      "requestVideoFrameCallback" in HTMLVideoElement.prototype;



    if (supportsVideoFrameCallback && video) {

      const onVideoFrame = (_now: number, _metadata: VideoFrameCallbackMetadata) => {

        if (cancelled) return;

        deliverFrame(performance.now());

        videoFrameHandle = video.requestVideoFrameCallback(onVideoFrame);

      };

      videoFrameHandle = video.requestVideoFrameCallback(onVideoFrame);

    } else {

      const tick = (now: number) => {

        if (cancelled) return;

        raf = requestAnimationFrame(tick);

        deliverFrame(now);

      };

      raf = requestAnimationFrame(tick);

    }



    return () => {

      cancelled = true;

      cancelAnimationFrame(raf);

      if (video && videoFrameHandle && "cancelVideoFrameCallback" in video) {

        video.cancelVideoFrameCallback(videoFrameHandle);

      }

    };

  }, [enabled, frameIntervalMs, imgRef, ready, syncToImage]);



  if (!enabled) return null;



  const videoClass =

    className ||

    "absolute inset-0 h-full w-full object-contain [transform:translateZ(0)]";



  return (

    <div className="relative h-full w-full overflow-hidden bg-black">

      <video

        ref={bindVideoRef}

        className={videoClass}

        playsInline

        muted

        autoPlay

      />

      {syncToImage && imgRef && (

        <img

          ref={imgRef}

          alt=""

          aria-hidden

          className="pointer-events-none absolute h-0 w-0 opacity-0"

        />

      )}



      {!ready && (

        <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-2 bg-slate-950/80 px-4 text-center">

          {error ? (

            <VideoOff className="h-8 w-8 text-rose-400" />

          ) : (

            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />

          )}

          <p className="text-xs text-slate-300">

            {error || "Starting HD camera…"}

          </p>

          {error && (

            <p className="text-[10px] text-slate-500">

              Allow camera permission in your browser, then refresh.

            </p>

          )}

        </div>

      )}

    </div>

  );

}


