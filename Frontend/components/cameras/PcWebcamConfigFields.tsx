"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import Button from "@/components/ui/Button";
import {
  DEFAULT_PC_WEBCAM_CONFIG,
  type PcWebcamConfig,
} from "@/types/pc-webcam";
import type { PcWebcamConfigView } from "@/hooks/usePcWebcamConfig";

export interface PcWebcamFieldOptions {
  locations: Array<{
    id: number;
    location_name: string;
    city: string | null;
    state: string | null;
  }>;
  branches: string[];
  entrances: string[];
  floors: string[];
}

interface PcWebcamConfigFieldsProps {
  config: PcWebcamConfigView;
  saving?: boolean;
  onSave: (config: PcWebcamConfig) => Promise<{ ok: boolean; message: string }>;
  compact?: boolean;
  inline?: boolean;
  autoSaveOnSelect?: boolean;
  showCameraName?: boolean;
  showNotes?: boolean;
  showSaveButton?: boolean;
  showPlacementFields?: boolean;
}

const inputClass =
  "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500";

const inlineSelectClass =
  "w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500";

function ensureOption(options: string[], current: string) {
  const trimmed = current.trim();
  if (!trimmed) return options;
  return options.includes(trimmed) ? options : [trimmed, ...options];
}

export default function PcWebcamConfigFields({
  config,
  saving = false,
  onSave,
  compact = false,
  inline = false,
  autoSaveOnSelect = false,
  showCameraName = true,
  showNotes = true,
  showSaveButton = true,
  showPlacementFields = true,
}: PcWebcamConfigFieldsProps) {
  const [values, setValues] = useState<PcWebcamConfig>(DEFAULT_PC_WEBCAM_CONFIG);
  const [options, setOptions] = useState<PcWebcamFieldOptions>({
    locations: [],
    branches: [],
    entrances: [],
    floors: [],
  });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setValues({
      display_name: config.display_name,
      location_id: config.location_id,
      branch_name: config.branch_name,
      entrance: config.entrance,
      entry_exit_type: config.entry_exit_type,
      floor: config.floor,
      notes: config.notes,
    });
  }, [config]);

  const loadOptions = useCallback(async (locationId?: number | null) => {
    const query = locationId ? `?location_id=${locationId}` : "";
    try {
      const response = await fetch(`/api/cameras/pc-webcam/options${query}`);
      const payload = await response.json();
      if (payload.success && payload.data) {
        setOptions(payload.data);
      }
    } catch {
      // keep previous options
    }
  }, []);

  useEffect(() => {
    void loadOptions(values.location_id);
  }, [loadOptions, values.location_id]);

  const branchOptions = useMemo(
    () => ensureOption(options.branches, values.branch_name),
    [options.branches, values.branch_name]
  );
  const entranceOptions = useMemo(
    () => ensureOption(options.entrances, values.entrance),
    [options.entrances, values.entrance]
  );
  const floorOptions = useMemo(
    () => ensureOption(options.floors, values.floor),
    [options.floors, values.floor]
  );

  const persist = async (next: PcWebcamConfig) => {
    const result = await onSave(next);
    setMessage(result.message);
    return result;
  };

  const update = async <K extends keyof PcWebcamConfig>(
    key: K,
    value: PcWebcamConfig[K],
    autoSave = false
  ) => {
    const next = { ...values, [key]: value };
    setValues(next);
    setMessage(null);
    if (autoSave && autoSaveOnSelect) {
      await persist(next);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await persist(values);
  };

  const selectClass = inline ? inlineSelectClass : inputClass;
  const FieldWrap = inline ? InlineField : Field;

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className={
        inline
          ? "contents"
          : "border-t border-slate-100 dark:border-slate-800 px-5 py-4"
      }
    >
      {!inline && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Manual settings
          </p>
          {showSaveButton && (
            <Button type="submit" size="sm" disabled={saving}>
              <Save size={14} className="mr-1" />
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
        </div>
      )}

      <div
        className={
          inline
            ? "contents"
            : `grid gap-3 ${
                compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"
              }`
        }
      >
        {showCameraName && !inline && (
          <Field label="Camera name">
            <input
              className={inputClass}
              value={values.display_name}
              onChange={(e) => void update("display_name", e.target.value)}
              placeholder="PC Webcam"
            />
          </Field>
        )}

        {showPlacementFields && (
          <>
            <FieldWrap label="Location">
              <select
                className={selectClass}
                value={values.location_id ?? ""}
                disabled={saving}
                onChange={(e) => {
                  const locationId = e.target.value ? Number(e.target.value) : null;
                  const selected = options.locations.find((loc) => loc.id === locationId);
                  const next = {
                    ...values,
                    location_id: locationId,
                    branch_name: selected?.location_name || values.branch_name,
                  };
                  setValues(next);
                  setMessage(null);
                  if (autoSaveOnSelect) void persist(next);
                }}
              >
                <option value="">Select location</option>
                {options.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.location_name}
                    {location.city ? ` · ${location.city}` : ""}
                  </option>
                ))}
              </select>
            </FieldWrap>

            <FieldWrap label="Branch">
              <select
                className={selectClass}
                value={values.branch_name}
                disabled={saving || !values.location_id}
                onChange={(e) => void update("branch_name", e.target.value, true)}
              >
                <option value="">Select branch</option>
                {branchOptions.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
            </FieldWrap>

            <FieldWrap label="Entrance / gate">
              <select
                className={selectClass}
                value={values.entrance}
                disabled={saving}
                onChange={(e) => void update("entrance", e.target.value, true)}
              >
                <option value="">Select entrance</option>
                {entranceOptions.map((entrance) => (
                  <option key={entrance} value={entrance}>
                    {entrance}
                  </option>
                ))}
              </select>
            </FieldWrap>

            <FieldWrap label="Entry / exit type">
              <select
                className={selectClass}
                value={values.entry_exit_type}
                disabled={saving}
                onChange={(e) =>
                  void update(
                    "entry_exit_type",
                    e.target.value as PcWebcamConfig["entry_exit_type"],
                    true
                  )
                }
              >
                <option value="ENTRY">Entry (check-in)</option>
                <option value="EXIT">Exit (check-out)</option>
                <option value="BOTH">Both</option>
                <option value="NONE">None</option>
              </select>
            </FieldWrap>

            <FieldWrap label="Floor">
              <select
                className={selectClass}
                value={values.floor}
                disabled={saving}
                onChange={(e) => void update("floor", e.target.value, true)}
              >
                <option value="">Select floor</option>
                {floorOptions.map((floor) => (
                  <option key={floor} value={floor}>
                    {floor}
                  </option>
                ))}
              </select>
            </FieldWrap>
          </>
        )}

        {showNotes && !compact && !inline && (
          <Field label="Notes" className="sm:col-span-2 lg:col-span-3">
            <textarea
              className={`${inputClass} min-h-[72px] resize-y`}
              value={values.notes}
              onChange={(e) => void update("notes", e.target.value)}
              placeholder="Optional notes for this webcam point"
            />
          </Field>
        )}
      </div>

      {message && !inline && (
        <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">{message}</p>
      )}
    </form>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function InlineField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
