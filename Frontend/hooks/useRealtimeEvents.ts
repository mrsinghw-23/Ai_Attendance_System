"use client";

import { useEffect, useRef } from "react";

export type RealtimeEvent = {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export function useRealtimeEvents(
  types: string[],
  onEvent: (event: RealtimeEvent) => void
) {
  const lastIdRef = useRef(0);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const typesKey = types.join("|");

  useEffect(() => {
    if (typeof window === "undefined" || !window.EventSource) return;

    const source = new EventSource("/api/realtime/stream");

    source.addEventListener("message", (message) => {
      try {
        const events = JSON.parse(message.data) as RealtimeEvent[];
        for (const event of events) {
          if (event.id <= lastIdRef.current) continue;
          lastIdRef.current = Math.max(lastIdRef.current, event.id);
          if (types.length === 0 || types.includes(event.type)) {
            onEventRef.current(event);
          }
        }
      } catch {
        // Ignore malformed payloads.
      }
    });

    source.onerror = () => {
      source.close();
    };

    return () => {
      source.close();
    };
  }, [typesKey]);
}
