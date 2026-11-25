"use client";



import { useCallback, useMemo, useRef, useState } from "react";

import Link from "next/link";

import {

  ArrowLeft,

  Monitor,

  ScanFace,

  Video,

  Wifi,

} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";

import Badge from "@/components/ui/Badge";

import Button from "@/components/ui/Button";

import PcWebcamFeed, {

  type PcWebcamDeviceInfo,

} from "@/components/cameras/PcWebcamFeed";

import PcWebcamConfigFields from "@/components/cameras/PcWebcamConfigFields";
import PcWebcamSettingsForm from "@/components/cameras/PcWebcamSettingsForm";

import LiveAttendanceScanner, {

  type GateScanReport,

  type LiveMarkResult,

  type LiveScanPhase,

  type LiveAttendanceScannerHandle,

} from "@/components/attendance/LiveAttendanceScanner";

import type { CameraStreamStatus } from "@/components/cameras/CctvLiveImage";

import { usePcWebcamConfig } from "@/hooks/usePcWebcamConfig";



interface PcWebcamPanelProps {

  variant?: "compact" | "full";

  showScanner?: boolean;

  cameraId?: number | null;

  locationId?: number | null;

  onAttendanceMarked?: (result: LiveMarkResult) => void;

  showHeader?: boolean;

  showDetailsLink?: boolean;

  showSettings?: boolean;

}



function streamBadge(status: CameraStreamStatus) {

  if (status === "live") {

    return (

      <Badge variant="success">

        <Wifi size={11} className="mr-1" />

        Live

      </Badge>

    );

  }

  if (status === "offline") {

    return <Badge variant="danger">Offline</Badge>;

  }

  if (status === "reconnecting") {

    return <Badge variant="warning">Reconnecting</Badge>;

  }

  return <Badge variant="warning">Connecting</Badge>;

}



export default function PcWebcamPanel({

  variant = "full",

  showScanner = true,

  cameraId = null,

  locationId = null,

  onAttendanceMarked,

  showHeader = true,

  showDetailsLink = false,

  showSettings = true,

}: PcWebcamPanelProps) {

  const { config, saving, save } = usePcWebcamConfig();

  const imgRef = useRef<HTMLImageElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  const scannerRef = useRef<LiveAttendanceScannerHandle>(null);

  const [streamStatus, setStreamStatus] =

    useState<CameraStreamStatus>("connecting");

  const [scanPhase, setScanPhase] = useState<LiveScanPhase>("idle");

  const [device, setDevice] = useState<PcWebcamDeviceInfo | null>(null);

  const [lastFrameAt, setLastFrameAt] = useState<Date | null>(null);

  const [gateReports, setGateReports] = useState<GateScanReport[]>([]);



  const effectiveLocationId = locationId ?? config.location_id;

  const webcamContext = useMemo(

    () => ({

      branch_name: config.branch_name,

      entrance: config.entrance,

      entry_exit_type: config.entry_exit_type,

      display_name: config.display_name,

    }),

    [config]

  );



  const handleFrame = useCallback((at: Date) => {

    setLastFrameAt(at);

    scannerRef.current?.onNewFrame();

  }, []);



  const handleReport = useCallback((report: GateScanReport) => {
    if (!report.marked) return;
    setGateReports((prev) => [report, ...prev].slice(0, 8));
  }, []);



  const feedHeight =

    variant === "compact" ? "aspect-video max-h-52" : "aspect-video max-h-[420px]";



  return (

    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md overflow-hidden">

      {showHeader && (

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 px-5 py-4">

          <div className="flex items-center gap-3">

            <div className="rounded-xl bg-indigo-500/10 p-2.5 text-indigo-500">

              <Monitor size={20} />

            </div>

            <div>

              <h4 className="font-semibold text-slate-900 dark:text-white">

                {config.display_name || "PC Webcam"}

              </h4>

              <p className="text-xs text-slate-500">

                Local browser camera · always-on face scan &amp; attendance

              </p>

            </div>

          </div>

          <div className="flex flex-wrap items-center gap-2">

            {streamBadge(streamStatus)}

            <Badge variant="info">

              <ScanFace size={11} className="mr-1" />

              {scanPhase === "idle" ? "READY" : scanPhase.replace("_", " ").toUpperCase()}

            </Badge>

            {showDetailsLink && variant === "compact" && (

              <Link href="/cameras/pc-webcam">

                <Button variant="secondary" size="sm">

                  Open

                </Button>

              </Link>

            )}

          </div>

        </div>

      )}



      <div className={`relative overflow-hidden bg-black ${feedHeight}`}>

        <PcWebcamFeed

          enabled

          videoRef={videoRef}

          imgRef={imgRef}

          syncToImage={false}

          hdMode

          className="absolute inset-0 h-full w-full object-contain"

          onStreamStatusChange={setStreamStatus}

          onFrameReceived={handleFrame}

          onDeviceReady={setDevice}

          frameIntervalMs={16}

        />

        {showScanner && (

          <LiveAttendanceScanner

            ref={scannerRef}

            cameraId={cameraId}

            locationId={effectiveLocationId}

            enabled

            imageRef={imgRef}

            videoRef={videoRef}

            liteMode

            webcamMode

            webcamContext={webcamContext}

            cameraLabel={webcamContext.display_name || "PC Webcam"}

            onMarked={onAttendanceMarked}

            onScanPhaseChange={setScanPhase}

            onReport={handleReport}

            showBadge={false}

          />

        )}

      </div>



      <div className="grid gap-3 border-t border-slate-100 dark:border-slate-800 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">

        <DetailItem label="Device" value={device?.label || "—"} />

        <DetailItem

          label="Resolution"

          value={

            device?.width && device?.height

              ? `${device.width} × ${device.height}`

              : "—"

          }

        />

        <DetailItem

          label="Frame rate"

          value={device?.frameRate ? `${Math.round(device.frameRate)} fps` : "—"}

        />

        <DetailItem

          label="Last frame"

          value={

            lastFrameAt

              ? lastFrameAt.toLocaleTimeString("en-IN", {

                  timeZone: "Asia/Kolkata",

                })

              : "—"

          }

        />

        <DetailItem label="Source" value="Browser getUserMedia" />

        <DetailItem label="AI mode" value="PC webcam face scan" />

        <PcWebcamConfigFields
          config={config}
          saving={saving}
          onSave={save}
          inline
          autoSaveOnSelect
          showCameraName={false}
          showNotes={false}
          showSaveButton={false}
        />

        <DetailItem

          label="Attendance"

          value={cameraId ? `Linked to camera #${cameraId}` : "Webcam only"}

        />

      </div>



      {showSettings && (

        <PcWebcamSettingsForm

          config={config}

          saving={saving}

          onSave={save}

          compact={variant === "compact"}

          showPlacementFields={false}

        />

      )}



      {variant === "full" && gateReports.length > 0 && (

        <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-4">

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">

            Recent scan results

          </p>

          <div className="space-y-2">

            {gateReports.slice(0, 5).map((report, index) => (

              <div

                key={`${report.at}-${index}`}

                className={`rounded-xl border px-3 py-2 text-xs ${

                  report.marked

                    ? "border-emerald-500/30 bg-emerald-500/10"

                    : "border-slate-200 dark:border-slate-700"

                }`}

              >

                <p className="font-medium text-slate-900 dark:text-white">

                  {report.employee_name || "Unknown face"}

                </p>

                <p className="text-slate-500">{report.message}</p>

              </div>

            ))}

          </div>

        </div>

      )}

    </div>

  );

}



function DetailItem({ label, value }: { label: string; value: string }) {

  return (

    <div>

      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">

        {label}

      </p>

      <p className="mt-0.5 truncate text-sm font-medium text-slate-800 dark:text-slate-200">

        {value}

      </p>

    </div>

  );

}



export function PcWebcamPageShell() {

  return (

    <DashboardLayout title="PC Webcam" module="cameras">

      <div className="space-y-6">

        <div className="flex flex-wrap items-center justify-between gap-3">

          <Link

            href="/cameras"

            className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"

          >

            <ArrowLeft size={16} className="mr-2" />

            Back to Cameras

          </Link>

        </div>



        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 text-sm text-slate-600 dark:text-slate-300">

          <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">

            <Video size={16} className="text-indigo-500" />

            PC Webcam is your active attendance camera

          </p>

          <p className="mt-1 text-xs text-slate-500">

            Set location, branch, and entrance below — then stand in front of your

            PC camera for automatic face scan and attendance.

          </p>

        </div>



        <PcWebcamPanel variant="full" showScanner showHeader={false} />

      </div>

    </DashboardLayout>

  );

}


