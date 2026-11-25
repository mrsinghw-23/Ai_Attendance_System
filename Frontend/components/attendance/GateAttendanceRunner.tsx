"use client";

import { useEffect, useRef } from "react";

/** CCTV background gate scan disabled — live attendance uses PC webcam on dashboard. */
const CCTV_BACKGROUND_SCAN_ENABLED = false;
const SCAN_INTERVAL_MS = 4000;

/**
 * Background AI gate scanner — runs while the app is open.
 * Captures frames server-side, matches faces, marks attendance, stores reports.
 */
export default function GateAttendanceRunner() {
  const inflightRef = useRef(false);

  useEffect(() => {
    if (!CCTV_BACKGROUND_SCAN_ENABLED) return;

    let active = true;

    const tick = async () => {
      if (!active || inflightRef.current) return;
      inflightRef.current = true;
      try {
        await fetch("/api/ai/gate-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      } catch {
        // ignore network errors; next tick retries
      } finally {
        inflightRef.current = false;
      }
    };

    const kickoff = window.setTimeout(tick, 2000);
    const timer = window.setInterval(tick, SCAN_INTERVAL_MS);

    return () => {
      active = false;
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
