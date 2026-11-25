"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Camera, ChevronDown, ChevronRight, MapPin } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { CameraMapLocation } from "@/types/camera";

export default function CameraMapView() {
  const [map, setMap] = useState<CameraMapLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetch("/api/cameras/operations/map")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setMap(data.data);
          const initial: Record<number, boolean> = {};
          data.data.forEach((location: CameraMapLocation) => {
            initial[location.location_id] = true;
          });
          setExpanded(initial);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-500">
        Loading camera map...
      </div>
    );
  }

  if (map.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-slate-500">
        No locations with cameras yet. Add locations and assign cameras to see the map view.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {map.map((location) => (
        <div
          key={location.location_id}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 overflow-hidden"
        >
          <button
            type="button"
            onClick={() =>
              setExpanded((current) => ({
                ...current,
                [location.location_id]: !current[location.location_id],
              }))
            }
            className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
          >
            {expanded[location.location_id] ? (
              <ChevronDown size={18} />
            ) : (
              <ChevronRight size={18} />
            )}
            <MapPin size={18} className="text-cyan-500" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">
                {location.location_name}
              </p>
              <p className="text-xs text-slate-500">
                {location.zones.reduce((sum, zone) => sum + zone.cameras.length, 0)} cameras ·{" "}
                {location.zones.length} zones
              </p>
            </div>
          </button>

          {expanded[location.location_id] && (
            <div className="border-t border-slate-200 dark:border-slate-800 px-5 py-4 space-y-4">
              {location.zones.length === 0 ? (
                <p className="text-sm text-slate-500">No cameras in this location.</p>
              ) : (
                location.zones.map((zone) => (
                  <div key={`${location.location_id}-${zone.zone_id || zone.zone_name}`}>
                    <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      ├── {zone.zone_name}
                      {zone.floor ? ` (${zone.floor})` : ""}
                    </p>
                    <div className="ml-6 space-y-2">
                      {zone.cameras.map((camera) => (
                        <Link
                          key={camera.id}
                          href={`/cameras/${camera.id}`}
                          className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                          <div className="flex items-center gap-2">
                            <Camera size={15} className="text-slate-400" />
                            <span className="font-medium text-slate-900 dark:text-white">
                              {camera.camera_name}
                            </span>
                            {camera.camera_code && (
                              <span className="text-xs text-slate-500">
                                ({camera.camera_code})
                              </span>
                            )}
                          </div>
                          <Badge
                            variant={
                              camera.health_status === "ONLINE"
                                ? "success"
                                : camera.health_status === "WARNING"
                                  ? "warning"
                                  : "danger"
                            }
                          >
                            {camera.health_status}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
