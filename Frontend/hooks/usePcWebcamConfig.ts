"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_PC_WEBCAM_CONFIG,
  type PcWebcamConfig,
} from "@/types/pc-webcam";

export type PcWebcamConfigView = PcWebcamConfig & {
  location_name?: string | null;
};

export function usePcWebcamConfig() {
  const [config, setConfig] = useState<PcWebcamConfigView>(DEFAULT_PC_WEBCAM_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/cameras/pc-webcam");
      const payload = await response.json();
      if (payload.success && payload.data) {
        setConfig(payload.data);
      }
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (next: PcWebcamConfig) => {
    setSaving(true);
    try {
      const response = await fetch("/api/cameras/pc-webcam", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const payload = await response.json();
      if (payload.success && payload.data) {
        setConfig(payload.data);
        return { ok: true as const, message: payload.message as string };
      }
      return {
        ok: false as const,
        message: (payload.message as string) || "Failed to save settings",
      };
    } catch {
      return { ok: false as const, message: "Failed to save settings" };
    } finally {
      setSaving(false);
    }
  }, []);

  return { config, loading, saving, refresh, save, setConfig };
}
