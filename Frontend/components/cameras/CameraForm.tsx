"use client";

import { useEffect, useMemo, useState } from "react";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import {
  createCameraSchema,
  updateCameraSchema,
  CreateCameraInput,
  UpdateCameraInput,
} from "@/schemas/camera.schema";
import { Location } from "@/types/location";
import { Camera, CameraDiagnostics, CameraZone } from "@/types/camera";
import { formatProbeErrorCode } from "@/utils/camera-probe-errors";
import { parseDirectRtspUrl } from "@/utils/rtsp-url";
import {
  applyDirectUrlToFormValues,
  buildConnectionPayload,
  buildManualRtspPreview,
  CameraConnectionMode,
  prepareSubmitData,
} from "@/utils/camera-connection-form";
import { CheckCircle2, Link2, Loader2, Radio, Settings2, WifiOff } from "lucide-react";

interface CameraFormProps {
  initialData?: Camera | null;
  locations: Location[];
  loading?: boolean;
  onSubmit: (data: CreateCameraInput | UpdateCameraInput) => Promise<void>;
  onCancel: () => void;
}

const defaultValues: CreateCameraInput = {
  camera_name: "",
  camera_code: "",
  brand: "CP Plus",
  model: "CP-UNC-DA41L3C-D-LQ",
  serial_number: "",
  camera_ip: "",
  http_port: 80,
  port: 554,
  rtsp_channel: 1,
  rtsp_subtype: 0,
  rtsp_username: "admin",
  rtsp_password: "",
  rtsp_direct_url: "",
  firmware: "V2.860.00AT002.0.R",
  onvif_version: "24.12",
  location_id: null,
  zone_id: null,
  floor: "",
  entry_exit_type: "ENTRY",
  status: "ACTIVE",
  motion_enabled: true,
  motion_sensitivity: 50,
};

function DiagnosticRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      <span className={ok ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>
        {ok ? "OK" : "Failed"}
      </span>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
        active
          ? "border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300"
          : "border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:border-slate-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export default function CameraForm({
  initialData,
  locations,
  loading = false,
  onSubmit,
  onCancel,
}: CameraFormProps) {
  const [values, setValues] = useState<CreateCameraInput>(defaultValues);
  const [connectionMode, setConnectionMode] = useState<CameraConnectionMode>("manual");
  const [zones, setZones] = useState<CameraZone[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [diagnostics, setDiagnostics] = useState<CameraDiagnostics | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setValues({
        camera_name: initialData.camera_name,
        camera_code: initialData.camera_code || "",
        brand: initialData.brand || "CP Plus",
        model: initialData.model || "",
        serial_number: initialData.serial_number || "",
        camera_ip: initialData.camera_ip || "",
        http_port: initialData.http_port ?? 80,
        port: initialData.port ?? 554,
        rtsp_channel: initialData.rtsp_channel ?? 1,
        rtsp_subtype: initialData.rtsp_subtype ?? 0,
        rtsp_username: initialData.rtsp_username || "admin",
        rtsp_password: "",
        rtsp_direct_url: "",
        firmware: initialData.firmware || "",
        onvif_version: initialData.onvif_version || "",
        location_id: initialData.location_id,
        zone_id: initialData.zone_id,
        floor: initialData.floor || "",
        entry_exit_type: initialData.entry_exit_type,
        status: initialData.status,
        motion_enabled: initialData.motion_enabled,
        motion_sensitivity: initialData.motion_sensitivity,
      });
      setConnectionMode("manual");
      if (initialData.last_diagnostics) {
        setDiagnostics(initialData.last_diagnostics);
      }
    }
  }, [initialData]);

  useEffect(() => {
    const params = values.location_id ? `?location_id=${values.location_id}` : "";
    fetch(`/api/camera-zones${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setZones(data.data);
      });
  }, [values.location_id]);

  function update(key: keyof CreateCameraInput, value: unknown) {
    setValues((current) => ({ ...current, [key]: value }));
    setDiagnostics(null);
    setTestMessage(null);
    setErrors((current) => {
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  function handleDirectUrlChange(url: string) {
    setValues((current) => applyDirectUrlToFormValues(current, url));
    setDiagnostics(null);
    setTestMessage(null);
    setErrors((current) => {
      const next = { ...current };
      delete next.rtsp_direct_url;
      return next;
    });
  }

  function switchMode(mode: CameraConnectionMode) {
    setConnectionMode(mode);
    setDiagnostics(null);
    setTestMessage(null);
    setErrors({});
    if (mode === "manual") {
      setValues((current) => ({ ...current, rtsp_direct_url: "" }));
    }
  }

  const directParsed = useMemo(
    () =>
      values.rtsp_direct_url?.trim()
        ? parseDirectRtspUrl(values.rtsp_direct_url)
        : null,
    [values.rtsp_direct_url]
  );

  const previewRtsp =
    connectionMode === "direct" && directParsed
      ? directParsed.rtsp_url
      : buildManualRtspPreview(values);

  const canTest =
    connectionMode === "direct"
      ? Boolean(directParsed?.rtsp_password)
      : Boolean(values.camera_ip?.trim() && values.rtsp_username?.trim());

  async function handleTestConnection() {
    setTesting(true);
    setTestMessage(null);
    setDiagnostics(null);

    const payload = buildConnectionPayload(values, connectionMode, {
      hasStoredPassword: initialData?.has_rtsp_password,
    });

    if (!payload.ok) {
      setTestMessage(payload.error);
      if (payload.field) {
        setErrors({ [payload.field]: payload.error });
      }
      setTesting(false);
      return;
    }

    try {
      const url = initialData?.id
        ? `/api/cameras/${initialData.id}/test`
        : "/api/cameras/test";

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.data),
      });
      const data = await response.json();

      if (data.data) setDiagnostics(data.data);
      setTestMessage(
        data.message ||
          (data.success ? "Camera test passed" : formatProbeErrorCode(data.data?.error_code))
      );
    } catch {
      setTestMessage("Camera test failed — check network and credentials");
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    const prepared = prepareSubmitData(values, connectionMode, {
      hasStoredPassword: initialData?.has_rtsp_password,
    });

    if (!prepared.ok) {
      setErrors({ [prepared.field || "rtsp_password"]: prepared.error });
      return;
    }

    const schema = initialData ? updateCameraSchema : createCameraSchema;
    const parsed = schema.safeParse(prepared.data);

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0];
        if (typeof field === "string") fieldErrors[field] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    const submitData = { ...parsed.data } as CreateCameraInput | UpdateCameraInput;

    if (
      initialData?.has_rtsp_password &&
      connectionMode === "manual" &&
      !submitData.rtsp_password
    ) {
      delete (submitData as { rtsp_password?: string }).rtsp_password;
    }

    await onSubmit(submitData);
  }

  const testPassed = diagnostics?.frame_captured === true;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-h-[75vh] overflow-y-auto pr-1">
      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Camera Details
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Camera Name"
            placeholder="Main Entrance CCTV"
            value={values.camera_name}
            error={errors.camera_name}
            onChange={(e) => update("camera_name", e.target.value)}
          />
          <Input
            label="Brand"
            placeholder="CP Plus"
            value={values.brand}
            error={errors.brand}
            onChange={(e) => update("brand", e.target.value)}
          />
          <Input
            label="Model"
            placeholder="CP-UNC-DA41L3C-D-LQ"
            value={values.model}
            onChange={(e) => update("model", e.target.value)}
          />
          <Input
            label="Camera Code (optional)"
            placeholder="CAM-001"
            value={values.camera_code}
            onChange={(e) => update("camera_code", e.target.value)}
          />
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/40 dark:bg-cyan-950/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Camera Connection
          </h4>
          {testPassed && (
            <Badge variant="success">
              <CheckCircle2 size={12} className="mr-1" />
              Test passed
            </Badge>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <ModeButton
            active={connectionMode === "direct"}
            onClick={() => switchMode("direct")}
            icon={<Link2 size={16} />}
            label="Paste Direct RTSP URL"
          />
          <ModeButton
            active={connectionMode === "manual"}
            onClick={() => switchMode("manual")}
            icon={<Settings2 size={16} />}
            label="Enter Details Manually"
          />
        </div>

        {connectionMode === "direct" ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Copy the RTSP URL from your CP Plus camera web UI (Port settings) or VLC.
              Username and password are extracted automatically.
            </p>
            <Input
              label="Direct RTSP URL"
              placeholder="rtsp://admin:Admin%40123@192.168.29.23:554/video/live?channel=1&subtype=0"
              value={values.rtsp_direct_url || ""}
              error={errors.rtsp_direct_url}
              onChange={(e) => handleDirectUrlChange(e.target.value)}
            />
            {directParsed ? (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p className="font-medium text-emerald-700 dark:text-emerald-400">URL parsed successfully</p>
                <p>IP: {directParsed.camera_ip} · RTSP Port: {directParsed.port}</p>
                <p>
                  Channel: {directParsed.rtsp_channel} · Substream: {directParsed.rtsp_subtype} · User:{" "}
                  {directParsed.rtsp_username}
                </p>
              </div>
            ) : values.rtsp_direct_url?.trim() ? (
              <p className="text-xs text-rose-600">
                Invalid RTSP URL format. Use: rtsp://user:pass@ip:554/video/live?channel=1&subtype=0
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Enter IP, ports, and credentials. RTSP URL is built automatically using your camera brand
              (CP Plus → <code>/video/live</code>).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="IP Address"
                placeholder="192.168.29.23"
                value={values.camera_ip}
                error={errors.camera_ip}
                onChange={(e) => update("camera_ip", e.target.value)}
              />
              <Input
                label="HTTP Port"
                type="number"
                value={values.http_port ?? 80}
                onChange={(e) => update("http_port", Number(e.target.value))}
              />
              <Input
                label="RTSP Port"
                type="number"
                value={values.port ?? 554}
                onChange={(e) => update("port", Number(e.target.value))}
              />
              <Input
                label="RTSP Channel"
                type="number"
                min={1}
                max={32}
                value={values.rtsp_channel ?? 1}
                onChange={(e) => update("rtsp_channel", Number(e.target.value))}
              />
              <Input
                label="Substream (0=main, 1=sub)"
                type="number"
                min={0}
                max={1}
                value={values.rtsp_subtype ?? 0}
                onChange={(e) => update("rtsp_subtype", Number(e.target.value))}
              />
              <Input
                label="RTSP Username"
                value={values.rtsp_username}
                error={errors.rtsp_username}
                onChange={(e) => update("rtsp_username", e.target.value)}
              />
              <Input
                label="RTSP Password"
                type="password"
                placeholder={
                  initialData?.has_rtsp_password
                    ? "Leave blank to keep existing password"
                    : "Required"
                }
                value={values.rtsp_password}
                error={errors.rtsp_password}
                onChange={(e) => update("rtsp_password", e.target.value)}
              />
              <Input
                label="Firmware (optional)"
                value={values.firmware || ""}
                onChange={(e) => update("firmware", e.target.value)}
              />
              <Input
                label="ONVIF Version (optional)"
                value={values.onvif_version || ""}
                onChange={(e) => update("onvif_version", e.target.value)}
              />
            </div>
          </div>
        )}

        {previewRtsp && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70 p-3">
            <p className="text-xs font-medium text-slate-500 mb-1">Stored RTSP URL (no credentials)</p>
            <code className="text-xs text-slate-700 dark:text-slate-300 break-all">{previewRtsp}</code>
          </div>
        )}

        <Button
          type="button"
          variant="secondary"
          disabled={testing || !canTest}
          onClick={() => void handleTestConnection()}
        >
          {testing ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              Testing connection...
            </>
          ) : (
            <>
              <Radio size={16} className="mr-2" />
              Test Camera Connection
            </>
          )}
        </Button>

        {testMessage && (
          <p className={`text-xs ${testPassed ? "text-emerald-600" : "text-rose-600"}`}>
            {testMessage}
          </p>
        )}

        {diagnostics && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 p-3 space-y-2">
            <DiagnosticRow label="Camera reachable" ok={diagnostics.camera_reachable} />
            <DiagnosticRow label="TCP port 554" ok={diagnostics.tcp_rtsp_ok} />
            <DiagnosticRow label="RTSP connected" ok={diagnostics.rtsp_connected} />
            <DiagnosticRow label="Authentication" ok={diagnostics.auth_success} />
            <DiagnosticRow label="Frame captured" ok={diagnostics.frame_captured} />
            {diagnostics.resolution && (
              <p className="text-xs text-slate-500">
                Resolution: {diagnostics.resolution}
                {diagnostics.fps ? ` · ${diagnostics.fps} FPS` : ""}
                {diagnostics.codec ? ` · ${diagnostics.codec}` : ""}
                {diagnostics.latency_ms != null ? ` · ${diagnostics.latency_ms}ms latency` : ""}
              </p>
            )}
            {!testPassed && diagnostics.error_code && (
              <p className="text-xs text-rose-600 flex items-center gap-1">
                <WifiOff size={12} />
                {formatProbeErrorCode(diagnostics.error_code)}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Location & Role
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Location"
            value={values.location_id ?? ""}
            onChange={(e) =>
              update("location_id", e.target.value ? Number(e.target.value) : null)
            }
            options={[
              { label: "Unassigned", value: "" },
              ...locations.map((location) => ({
                label: location.location_name,
                value: location.id,
              })),
            ]}
          />
          <Select
            label="Zone"
            value={values.zone_id ?? ""}
            onChange={(e) =>
              update("zone_id", e.target.value ? Number(e.target.value) : null)
            }
            options={[
              { label: "Unassigned", value: "" },
              ...zones.map((zone) => ({
                label: zone.zone_name,
                value: zone.id,
              })),
            ]}
          />
          <Select
            label="Entry / Exit"
            value={values.entry_exit_type}
            onChange={(e) => update("entry_exit_type", e.target.value)}
            options={[
              { label: "Entry (check-in)", value: "ENTRY" },
              { label: "Exit (check-out)", value: "EXIT" },
              { label: "Both", value: "BOTH" },
              { label: "None", value: "NONE" },
            ]}
          />
          <Select
            label="Status"
            value={values.status}
            onChange={(e) => update("status", e.target.value)}
            options={[
              { label: "Active", value: "ACTIVE" },
              { label: "Inactive", value: "INACTIVE" },
            ]}
          />
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end sticky bottom-0 bg-white dark:bg-slate-900 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : initialData ? "Update Camera" : "Save Camera"}
        </Button>
      </div>
    </form>
  );
}
