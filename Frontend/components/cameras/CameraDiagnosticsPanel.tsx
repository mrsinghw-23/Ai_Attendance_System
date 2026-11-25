"use client";

import { CameraDiagnostics } from "@/types/camera";
import { formatProbeErrorCode } from "@/utils/camera-probe-errors";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

function StatusDot({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
  ) : (
    <XCircle size={16} className="text-rose-500 shrink-0" />
  );
}

function CheckRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <StatusDot ok={ok} />
        <span className="text-slate-700 dark:text-slate-200">{label}</span>
      </div>
      <Badge variant={ok ? "success" : "danger"}>{ok ? "Green" : "Red"}</Badge>
    </div>
  );
}

type CameraDiagnosticsPanelProps = {
  diagnostics: CameraDiagnostics | null;
  testing?: boolean;
  onTest?: () => void;
  showTestButton?: boolean;
};

export default function CameraDiagnosticsPanel({
  diagnostics,
  testing = false,
  onTest,
  showTestButton = true,
}: CameraDiagnosticsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold text-slate-900 dark:text-white">
            Camera Diagnostics
          </h4>
          <p className="text-xs text-slate-500">
            Ping, TCP, RTSP auth, OpenCV frame capture, and backend services
          </p>
        </div>
        {showTestButton && onTest && (
          <Button variant="secondary" disabled={testing} onClick={onTest}>
            {testing ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              "Run Diagnostics"
            )}
          </Button>
        )}
      </div>

      {!diagnostics ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-sm text-slate-500">
          Run diagnostics to verify camera connectivity before going live.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <CheckRow label="Ping / network" ok={diagnostics.ping_ok} />
            <CheckRow label="TCP (RTSP port)" ok={diagnostics.tcp_rtsp_ok} />
            <CheckRow label="RTSP stream" ok={diagnostics.rtsp_connected} />
            <CheckRow label="Authentication" ok={diagnostics.auth_success} />
            <CheckRow label="Frame captured (OpenCV)" ok={diagnostics.frame_captured} />
            <CheckRow label="Python AI service" ok={Boolean(diagnostics.python_service_ok)} />
            <CheckRow label="PostgreSQL" ok={Boolean(diagnostics.database_ok)} />
            <CheckRow label="Attendance engine" ok={Boolean(diagnostics.attendance_engine_ok)} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Metric label="Resolution" value={diagnostics.resolution || "—"} />
            <Metric label="FPS" value={diagnostics.fps != null ? String(diagnostics.fps) : "—"} />
            <Metric label="Codec" value={diagnostics.codec || "—"} />
            <Metric label="Latency" value={diagnostics.latency_ms != null ? `${diagnostics.latency_ms} ms` : "—"} />
            <Metric label="Firmware" value={diagnostics.firmware || "—"} />
            <Metric label="ONVIF" value={diagnostics.onvif_version || "—"} />
            <Metric label="Health" value={diagnostics.health_status} />
            <Metric
              label="Last check"
              value={
                diagnostics.checked_at
                  ? new Date(diagnostics.checked_at).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })
                  : "—"
              }
            />
          </div>

          {!diagnostics.frame_captured && diagnostics.error_code && (
            <p className="text-sm text-rose-600">
              {formatProbeErrorCode(diagnostics.error_code)}
              {diagnostics.error ? ` — ${diagnostics.error}` : ""}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-2">
      <p className="text-slate-500">{label}</p>
      <p className="font-semibold text-slate-900 dark:text-white truncate">{value}</p>
    </div>
  );
}
