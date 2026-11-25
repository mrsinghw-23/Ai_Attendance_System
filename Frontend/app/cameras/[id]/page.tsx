"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Camera as CameraIcon,
  Clock,
  MapPin,
  Network,
  Power,
  Radio,
  Shield,
  Video,
  Wifi,
  WifiOff,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import CctvLiveImage from "@/components/cameras/CctvLiveImage";
import CameraDiagnosticsPanel from "@/components/cameras/CameraDiagnosticsPanel";
import { useToast } from "@/providers/ToastProvider";
import {
  Camera,
  CameraEvent,
  CameraHealthLog,
  CameraPipelineArchitecture,
  CameraDiagnostics,
} from "@/types/camera";

export default function CameraDetailPage() {
  const params = useParams();
  const { showToast } = useToast();
  const cameraId = Number(params.id);

  const [camera, setCamera] = useState<Camera | null>(null);
  const [events, setEvents] = useState<CameraEvent[]>([]);
  const [healthLogs, setHealthLogs] = useState<CameraHealthLog[]>([]);
  const [pipeline, setPipeline] =
    useState<CameraPipelineArchitecture | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [diagnostics, setDiagnostics] = useState<CameraDiagnostics | null>(null);

  const runDiagnostics = useCallback(async () => {
    if (Number.isNaN(cameraId)) return;
    setTesting(true);
    try {
      const response = await fetch(`/api/cameras/${cameraId}/test`, {
        method: "POST",
      });
      const data = await response.json();
      if (data.data) {
        setDiagnostics(data.data);
        if (data.success && data.data.health_status) {
          setCamera((current) =>
            current
              ? { ...current, health_status: data.data.health_status, last_diagnostics: data.data }
              : current
          );
        }
      }
      showToast(data.message || (data.success ? "Diagnostics passed" : "Diagnostics failed"), data.success ? "success" : "error");
    } catch {
      showToast("Diagnostics failed", "error");
    } finally {
      setTesting(false);
    }
  }, [cameraId, showToast]);

  const toggleCameraStatus = useCallback(async () => {
    if (!camera) return;
    const next = camera.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const response = await fetch(`/api/cameras/${camera.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const data = await response.json();
    if (data.success) {
      setCamera(data.data);
      showToast(`Camera ${next === "ACTIVE" ? "enabled" : "disabled"}`, "success");
    } else {
      showToast(data.message || "Failed to update camera", "error");
    }
  }, [camera, showToast]);

  useEffect(() => {
    async function load() {
      if (Number.isNaN(cameraId)) {
        setLoading(false);
        return;
      }

      const [cameraRes, eventsRes, healthRes, pipelineRes] =
        await Promise.all([
          fetch(`/api/cameras/${cameraId}`),
          fetch(`/api/cameras/events?camera_id=${cameraId}&limit=20`),
          fetch(`/api/cameras/health?camera_id=${cameraId}`),
          fetch("/api/cameras/pipeline"),
        ]);

      const cameraData = await cameraRes.json();
      const eventsData = await eventsRes.json();
      const healthData = await healthRes.json();
      const pipelineData = await pipelineRes.json();

      if (cameraData.success) {
        setCamera(cameraData.data);
        if (cameraData.data.last_diagnostics) {
          setDiagnostics(cameraData.data.last_diagnostics);
        }
      } else showToast(cameraData.message || "Camera not found", "error");

      if (eventsData.success) setEvents(eventsData.data);
      if (healthData.success) setHealthLogs(healthData.data);
      if (pipelineData.success) setPipeline(pipelineData.data);

      setLoading(false);
    }
    load();
  }, [cameraId, showToast]);

  if (loading) {
    return (
      <DashboardLayout title="Camera Details" module="cameras">
        <div className="space-y-4">
          <div className="h-32 rounded-2xl bg-slate-200/70 dark:bg-slate-800 animate-pulse" />
          <div className="h-72 rounded-2xl bg-slate-200/70 dark:bg-slate-800 animate-pulse" />
        </div>
      </DashboardLayout>
    );
  }

  if (!camera) {
    return (
      <DashboardLayout title="Camera Details" module="cameras">
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
          <p className="text-slate-500">Camera not found.</p>
          <Link href="/cameras" className="inline-block mt-4">
            <Button variant="secondary">Back to Cameras</Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const isOnline = camera.health_status === "ONLINE";
  const isActive = camera.status === "ACTIVE";
  const liveReady =
    isActive &&
    (isOnline || diagnostics?.frame_captured || camera.last_diagnostics?.frame_captured);
  const lastDiag = diagnostics || camera.last_diagnostics;

  return (
    <DashboardLayout title="Camera Details" module="cameras">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/cameras"
            className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            <ArrowLeft size={16} className="mr-2" />
            Back to Cameras
          </Link>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={testing} onClick={() => void runDiagnostics()}>
              {testing ? "Running diagnostics..." : "Test Camera Connection"}
            </Button>
            <Button variant="secondary" onClick={() => void toggleCameraStatus()}>
              <Power size={16} className="mr-2" />
              {camera?.status === "ACTIVE" ? "Disable Camera" : "Enable Camera"}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-slate-100 dark:bg-slate-800 p-3 text-slate-600 dark:text-slate-300">
                <CameraIcon size={26} />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {camera.camera_name}
                </h3>
                <p className="text-sm text-slate-500">
                  {camera.camera_code || "No code"} · {camera.brand || "—"} ·{" "}
                  {camera.model || "—"}
                </p>
                <p className="flex items-center gap-1 text-slate-500 mt-1">
                  <MapPin size={14} />
                  {camera.location_name || "Unassigned"}
                  {camera.zone_name ? ` · ${camera.zone_name}` : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={camera.status === "ACTIVE" ? "success" : "neutral"}>
                {camera.status}
              </Badge>
              <Badge variant={isOnline ? "success" : "warning"}>
                {camera.health_status}
              </Badge>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-6">
          <h4 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Video size={16} />
            Live Camera Preview
          </h4>
          <div className="relative overflow-hidden rounded-xl bg-black aspect-video max-h-[420px]">
            {liveReady ? (
              <CctvLiveImage
                cameraId={camera.id}
                enabled={isActive}
                streamConfig={{
                  camera_ip: camera.camera_ip,
                  port: camera.port,
                  rtsp_url: camera.rtsp_url,
                  rtsp_channel: camera.rtsp_channel,
                  rtsp_subtype: camera.rtsp_subtype,
                  brand: camera.brand,
                }}
                pollIntervalMs={700}
                className="h-full w-full object-contain"
                alt={`Live feed ${camera.camera_name}`}
              />
            ) : (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-sm text-slate-400">
                {!isActive ? (
                  <>
                    <p className="font-medium text-slate-300">Camera is disabled</p>
                    <p className="text-xs">Enable the camera to start live preview</p>
                  </>
                ) : (
                  <p>Run diagnostics to enable live preview</p>
                )}
              </div>
            )}
            <div className="absolute left-3 top-3 flex gap-2">
              {!isActive ? (
                <Badge variant="neutral">DISABLED</Badge>
              ) : (
                <Badge variant={liveReady ? "success" : "warning"}>
                  {liveReady ? "LIVE" : "OFFLINE"}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-6">
          <CameraDiagnosticsPanel
            diagnostics={lastDiag}
            testing={testing}
            onTest={() => void runDiagnostics()}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Section title="Health Monitoring" icon={<Activity size={16} />}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Metric
                icon={isOnline ? <Wifi size={15} /> : <WifiOff size={15} />}
                label="Health"
                value={camera.health_status}
              />
              <Metric
                icon={<Clock size={15} />}
                label="Last Seen"
                value={
                  camera.last_seen
                    ? new Date(camera.last_seen).toLocaleString()
                    : "Never"
                }
              />
              <Metric
                icon={<Video size={15} />}
                label="Recording"
                value={camera.recording_status === "RECORDING" ? "On" : "Off"}
              />
            </div>
            <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
              {healthLogs.length === 0 ? (
                <p className="text-sm text-slate-500">No health logs yet.</p>
              ) : (
                healthLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs text-slate-500"
                  >
                    {log.health_status} · RTSP {log.rtsp_reachable ? "OK" : "Fail"} ·{" "}
                    {new Date(log.checked_at).toLocaleString()}
                  </div>
                ))
              )}
            </div>
          </Section>

          <Section title="Stream & Network Status" icon={<Network size={16} />}>
            <InfoRow
              label="RTSP Status"
              value={lastDiag?.rtsp_connected ? "Connected" : "Disconnected"}
            />
            <InfoRow
              label="ONVIF"
              value={camera.onvif_version || lastDiag?.onvif_version || "—"}
            />
            <InfoRow
              label="Network (Ping)"
              value={lastDiag?.ping_ok ? "Reachable" : "Unreachable"}
            />
            <InfoRow label="Bitrate" value={lastDiag?.bitrate_kbps != null ? `${lastDiag.bitrate_kbps} Kbps` : "4096 Kbps (configured)"} />
            <InfoRow
              label="Last Ping / Probe"
              value={
                lastDiag?.checked_at
                  ? new Date(lastDiag.checked_at).toLocaleString()
                  : "—"
              }
            />
            <InfoRow
              label="Packet Loss"
              value={
                lastDiag?.packet_loss_pct != null
                  ? `${lastDiag.packet_loss_pct}%`
                  : "0%"
              }
            />
            <InfoRow
              label="Uptime"
              value={
                lastDiag?.uptime_seconds != null
                  ? `${Math.floor(lastDiag.uptime_seconds / 3600)}h ${Math.floor(
                      (lastDiag.uptime_seconds % 3600) / 60
                    )}m`
                  : "—"
              }
            />
            <InfoRow
              label="AI Status"
              value={lastDiag?.ai_status || "Waiting for Python service"}
            />
          </Section>

          <Section title="Connection & Security" icon={<Shield size={16} />}>
            <InfoRow label="IP Address" value={camera.camera_ip || "Not configured"} />
            <InfoRow label="HTTP Port" value={String(camera.http_port ?? 80)} />
            <InfoRow label="RTSP Port" value={String(camera.port ?? 554)} />
            <InfoRow label="RTSP URL (auto)" value={camera.rtsp_url || "Generated on save"} mono />
            <InfoRow label="RTSP Username" value={camera.rtsp_username || "—"} />
            <InfoRow
              label="RTSP Password"
              value={camera.has_rtsp_password ? "Encrypted (stored securely)" : "Not set"}
            />
            <InfoRow label="Channel / Substream" value={`${camera.rtsp_channel ?? 1} / ${camera.rtsp_subtype ?? 0}`} />
            <InfoRow label="Firmware" value={camera.firmware || lastDiag?.firmware || "—"} />
            <InfoRow label="ONVIF" value={camera.onvif_version || lastDiag?.onvif_version || "—"} />
            <InfoRow label="Resolution" value={lastDiag?.resolution || "—"} />
            <InfoRow label="Codec / FPS" value={`${lastDiag?.codec || "—"} / ${lastDiag?.fps ?? "—"}`} />
            <InfoRow label="Latency" value={lastDiag?.latency_ms != null ? `${lastDiag.latency_ms} ms` : "—"} />
            <InfoRow label="Entry/Exit" value={camera.entry_exit_type} />
            <InfoRow label="Reconnect count" value={String(camera.reconnect_count ?? 0)} />
          </Section>

          <Section title="Recent Camera Events" icon={<Radio size={16} />}>
            {events.length === 0 ? (
              <p className="text-sm text-slate-500">No events recorded yet.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{event.event_type.replace(/_/g, " ")}</span>
                      <span className="text-xs text-slate-500">
                        {new Date(event.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{event.message}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="AI Camera Pipeline" icon={<Network size={16} />}>
            {pipeline ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">{pipeline.description}</p>
                {pipeline.stages.map((stage, index) => (
                  <div
                    key={stage.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm"
                  >
                    <p className="font-medium">
                      {index + 1}. {stage.name}
                    </p>
                    <p className="text-xs text-slate-500">{stage.description}</p>
                    <Badge variant="info">{stage.status}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Pipeline architecture unavailable.</p>
            )}
          </Section>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow label="Installation Date" value={camera.installation_date || "—"} />
          <InfoRow label="Warranty Date" value={camera.warranty_date || "—"} />
          <InfoRow label="Serial Number" value={camera.serial_number || "—"} />
          <InfoRow label="Floor" value={camera.floor || "—"} />
        </div>
      </div>
    </DashboardLayout>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-6">
      <h4 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        {icon}
        {title}
      </h4>
      {children}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4">
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-base font-semibold text-slate-900 dark:text-white break-all">
        {value}
      </p>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-1 text-slate-900 dark:text-white font-medium break-all ${
          mono ? "font-mono text-sm" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
