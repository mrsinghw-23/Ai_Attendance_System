"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import {
  Bell,
  Building2,
  Camera,
  Palette,
  Save,
  ScanFace,
  Timer,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useToast } from "@/providers/ToastProvider";

type SettingsState = Record<string, Record<string, Record<string, unknown>>>;

const DEFAULT_SETTINGS: SettingsState = {
  company: {
    profile: {
      companyName: "AI Attendance System",
      timezone: "Asia/Kolkata",
      locale: "en-IN",
    },
  },
  attendance: {
    rules: {
      shiftStart: "09:55",
      shiftEnd: "18:55",
      lateGraceMinutes: 5,
      standardWorkHours: 8,
    },
  },
  camera: {
    defaults: {
      healthCheckIntervalSeconds: 60,
      recordingRetentionDays: 30,
      rtspTimeoutSeconds: 10,
    },
  },
  notification: {
    preferences: {
      emailAlerts: false,
      cameraOfflineAlerts: true,
      lateArrivalAlerts: true,
    },
  },
  branding: {
    theme: {
      primaryColor: "#2563eb",
      logoUrl: "",
      darkModeDefault: false,
    },
  },
  ai: {
    recognition: {
      confidenceThreshold: 0.65,
      motionSensitivity: 25,
      frameSamplingIntervalMs: 500,
      embeddingModel: "buffalo_l",
      embeddingSyncIntervalMinutes: 30,
      unknownFaceCooldownSeconds: 60,
      recognitionCooldownSeconds: 30,
      storeUnknownFaces: false,
    },
  },
};

export default function SettingsPage() {
  const { showToast } = useToast();
  const [settings, setSettings] =
    useState<SettingsState>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearingUnknown, setClearingUnknown] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/settings");
    const data = await response.json();

    if (data.success) {
      setSettings({
        ...DEFAULT_SETTINGS,
        ...data.data,
      });
    } else {
      showToast(data.message || "Failed to load settings", "error");
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function updateSetting(
    category: string,
    key: string,
    field: string,
    value: unknown
  ) {
    setSettings((current) => ({
      ...current,
      [category]: {
        ...current[category],
        [key]: {
          ...current[category]?.[key],
          [field]: value,
        },
      },
    }));
  }

  async function saveSettings() {
    setSaving(true);
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        settings,
      }),
    });
    const data = await response.json();

    if (data.success) {
      showToast("Settings saved", "success");
      setSettings(data.data);
    } else {
      showToast(data.message || "Failed to save settings", "error");
    }
    setSaving(false);
  }

  async function clearAllUnknownFaces() {
    setClearingUnknown(true);
    const response = await fetch("/api/ai/unknown-faces/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_all", scope: "all" }),
    });
    const data = await response.json();

    if (data.success) {
      showToast(data.message || "Unknown face records cleared", "success");
    } else {
      showToast(data.message || "Could not clear unknown face records", "error");
    }
    setClearingUnknown(false);
  }

  const company = settings.company?.profile || {};
  const attendance = settings.attendance?.rules || {};
  const camera = settings.camera?.defaults || {};
  const notification = settings.notification?.preferences || {};
  const branding = settings.branding?.theme || {};
  const aiRecognition = settings.ai?.recognition || {};

  return (
    <DashboardLayout
      title="System Settings"
      module="settings"
      actions={
        <Button onClick={saveSettings} disabled={saving}>
          <Save size={16} className="mr-2" />
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      }
    >
      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-64 rounded-2xl bg-slate-200/70 dark:bg-slate-800 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <SettingsCard icon={<Building2 />} title="Company Settings">
            <Input
              label="Company Name"
              value={String(company.companyName || "")}
              onChange={(e) =>
                updateSetting("company", "profile", "companyName", e.target.value)
              }
            />
            <Input
              label="Timezone"
              value={String(company.timezone || "")}
              onChange={(e) =>
                updateSetting("company", "profile", "timezone", e.target.value)
              }
            />
            <Input
              label="Locale"
              value={String(company.locale || "")}
              onChange={(e) =>
                updateSetting("company", "profile", "locale", e.target.value)
              }
            />
          </SettingsCard>

          <SettingsCard icon={<Timer />} title="Attendance Rules">
            <Input
              label="Shift Start"
              type="time"
              value={String(attendance.shiftStart || "09:00")}
              onChange={(e) =>
                updateSetting("attendance", "rules", "shiftStart", e.target.value)
              }
            />
            <Input
              label="Shift End"
              type="time"
              value={String(attendance.shiftEnd || "18:00")}
              onChange={(e) =>
                updateSetting("attendance", "rules", "shiftEnd", e.target.value)
              }
            />
            <Input
              label="Late Grace Minutes"
              type="number"
              value={String(attendance.lateGraceMinutes || 15)}
              onChange={(e) =>
                updateSetting(
                  "attendance",
                  "rules",
                  "lateGraceMinutes",
                  Number(e.target.value)
                )
              }
            />
            <Input
              label="Standard Work Hours"
              type="number"
              value={String(attendance.standardWorkHours || 8)}
              onChange={(e) =>
                updateSetting(
                  "attendance",
                  "rules",
                  "standardWorkHours",
                  Number(e.target.value)
                )
              }
            />
          </SettingsCard>

          <SettingsCard icon={<Camera />} title="Camera Settings">
            <Input
              label="Health Check Interval (seconds)"
              type="number"
              value={String(camera.healthCheckIntervalSeconds || 60)}
              onChange={(e) =>
                updateSetting(
                  "camera",
                  "defaults",
                  "healthCheckIntervalSeconds",
                  Number(e.target.value)
                )
              }
            />
            <Input
              label="Recording Retention (days)"
              type="number"
              value={String(camera.recordingRetentionDays || 30)}
              onChange={(e) =>
                updateSetting(
                  "camera",
                  "defaults",
                  "recordingRetentionDays",
                  Number(e.target.value)
                )
              }
            />
            <Input
              label="RTSP Timeout (seconds)"
              type="number"
              value={String(camera.rtspTimeoutSeconds || 10)}
              onChange={(e) =>
                updateSetting(
                  "camera",
                  "defaults",
                  "rtspTimeoutSeconds",
                  Number(e.target.value)
                )
              }
            />
          </SettingsCard>

          <SettingsCard icon={<ScanFace />} title="AI Face Recognition">
            <Input
              label="Recognition Confidence Threshold"
              type="number"
              step="0.01"
              min="0.1"
              max="1"
              value={String(aiRecognition.confidenceThreshold ?? 0.65)}
              onChange={(e) =>
                updateSetting(
                  "ai",
                  "recognition",
                  "confidenceThreshold",
                  Number(e.target.value)
                )
              }
            />
            <Input
              label="Motion Sensitivity (1-100)"
              type="number"
              min="1"
              max="100"
              value={String(aiRecognition.motionSensitivity ?? 25)}
              onChange={(e) =>
                updateSetting(
                  "ai",
                  "recognition",
                  "motionSensitivity",
                  Number(e.target.value)
                )
              }
            />
            <Input
              label="Frame Sampling Interval (ms)"
              type="number"
              min="100"
              max="10000"
              value={String(aiRecognition.frameSamplingIntervalMs ?? 500)}
              onChange={(e) =>
                updateSetting(
                  "ai",
                  "recognition",
                  "frameSamplingIntervalMs",
                  Number(e.target.value)
                )
              }
            />
            <Input
              label="Embedding Sync Interval (minutes)"
              type="number"
              min="5"
              max="1440"
              value={String(aiRecognition.embeddingSyncIntervalMinutes ?? 30)}
              onChange={(e) =>
                updateSetting(
                  "ai",
                  "recognition",
                  "embeddingSyncIntervalMinutes",
                  Number(e.target.value)
                )
              }
            />
            <Input
              label="Recognition Cooldown (seconds)"
              type="number"
              min="5"
              max="600"
              value={String(aiRecognition.recognitionCooldownSeconds ?? 30)}
              onChange={(e) =>
                updateSetting(
                  "ai",
                  "recognition",
                  "recognitionCooldownSeconds",
                  Number(e.target.value)
                )
              }
            />
            <Input
              label="Unknown Face Cooldown (seconds)"
              type="number"
              min="10"
              max="600"
              value={String(aiRecognition.unknownFaceCooldownSeconds ?? 60)}
              onChange={(e) =>
                updateSetting(
                  "ai",
                  "recognition",
                  "unknownFaceCooldownSeconds",
                  Number(e.target.value)
                )
              }
            />
            <Toggle
              label="Store unknown faces in database (CCTV security only)"
              checked={Boolean(aiRecognition.storeUnknownFaces)}
              onChange={(checked) =>
                updateSetting("ai", "recognition", "storeUnknownFaces", checked)
              }
            />
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  Clear old unknown face records
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Removes all saved unknown face snapshots from the database. Attendance
                  scanning does not use these records.
                </p>
              </div>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={clearingUnknown}
                onClick={() => void clearAllUnknownFaces()}
              >
                {clearingUnknown ? "Clearing…" : "Clear all unknown faces"}
              </Button>
            </div>
          </SettingsCard>

          <SettingsCard icon={<Bell />} title="Notification Settings">
            <Toggle
              label="Email Alerts"
              checked={Boolean(notification.emailAlerts)}
              onChange={(checked) =>
                updateSetting("notification", "preferences", "emailAlerts", checked)
              }
            />
            <Toggle
              label="Camera Offline Alerts"
              checked={Boolean(notification.cameraOfflineAlerts)}
              onChange={(checked) =>
                updateSetting(
                  "notification",
                  "preferences",
                  "cameraOfflineAlerts",
                  checked
                )
              }
            />
            <Toggle
              label="Late Arrival Alerts"
              checked={Boolean(notification.lateArrivalAlerts)}
              onChange={(checked) =>
                updateSetting(
                  "notification",
                  "preferences",
                  "lateArrivalAlerts",
                  checked
                )
              }
            />
          </SettingsCard>

          <SettingsCard icon={<Palette />} title="Branding Configuration">
            <Input
              label="Primary Color"
              type="color"
              value={String(branding.primaryColor || "#2563eb")}
              onChange={(e) =>
                updateSetting("branding", "theme", "primaryColor", e.target.value)
              }
            />
            <Input
              label="Logo URL"
              value={String(branding.logoUrl || "")}
              onChange={(e) =>
                updateSetting("branding", "theme", "logoUrl", e.target.value)
              }
            />
            <Select
              label="Dark Mode Default"
              value={String(Boolean(branding.darkModeDefault))}
              onChange={(e) =>
                updateSetting(
                  "branding",
                  "theme",
                  "darkModeDefault",
                  e.target.value === "true"
                )
              }
              options={[
                { label: "Light", value: "false" },
                { label: "Dark", value: "true" },
              ]}
            />
          </SettingsCard>
        </div>
      )}
    </DashboardLayout>
  );
}

function SettingsCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-6 space-y-4"
    >
      <div className="flex items-center gap-2 text-slate-900 dark:text-white">
        <span className="rounded-xl bg-blue-50 dark:bg-blue-900/30 p-2 text-blue-600 dark:text-blue-300">
          {icon}
        </span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      {children}
    </motion.div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition ${
          checked ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </button>
    </label>
  );
}
