import pool from "@/lib/db";
import { AttendanceEngineConfig } from "@/types/phase9";
import {
  getTodayInTimezone,
  minutesOfDayInTimezone,
  toDateOnlyInTimezone,
} from "@/utils/timezone";

const DEFAULT_CONFIG: AttendanceEngineConfig = {
  onTimeStartHour: 9,
  onTimeStartMinute: 55,
  onTimeEndHour: 10,
  onTimeEndMinute: 0,
  checkOutAfterHour: 17,
  checkOutAfterMinute: 55,
  presenceGapMinutes: 30,
  halfDayCutoffHour: 15,
  halfDayCutoffMinute: 0,
  standardWorkHours: 8,
  minConfidence: 0.65,
};

type AttendanceRulesSettings = {
  shiftStart?: string;
  shiftEnd?: string;
  lateGraceMinutes?: number;
  standardWorkHours?: number;
};

function parseTimeParts(value?: string | null) {
  if (!value?.trim()) return null;
  const [hourRaw, minuteRaw] = value.trim().split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw ?? 0);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

async function getAttendanceRulesSettings(): Promise<AttendanceRulesSettings | null> {
  const result = await pool.query(
    `
    SELECT setting_value
    FROM system_settings
    WHERE category = 'attendance' AND setting_key = 'rules'
    `
  );
  return (result.rows[0]?.setting_value as AttendanceRulesSettings) || null;
}

function applyRulesToConfig(
  config: AttendanceEngineConfig,
  rules: AttendanceRulesSettings | null
): AttendanceEngineConfig {
  if (!rules) return config;

  const shiftStart = parseTimeParts(rules.shiftStart);
  if (shiftStart) {
    config.onTimeStartHour = shiftStart.hour;
    config.onTimeStartMinute = shiftStart.minute;
    const grace = Number(rules.lateGraceMinutes ?? 5);
    const startMinutes = shiftStart.hour * 60 + shiftStart.minute;
    const endMinutes = startMinutes + Math.max(1, grace);
    config.onTimeEndHour = Math.floor(endMinutes / 60) % 24;
    config.onTimeEndMinute = endMinutes % 60;
  }

  const shiftEnd = parseTimeParts(rules.shiftEnd);
  if (shiftEnd) {
    config.checkOutAfterHour = shiftEnd.hour;
    config.checkOutAfterMinute = shiftEnd.minute;
  }

  if (rules.standardWorkHours) {
    config.standardWorkHours = Number(rules.standardWorkHours);
  }

  return config;
}

export function isAfterShiftStart(
  eventTime: Date,
  config: AttendanceEngineConfig
) {
  const eventMinutes = minutesOfDay(eventTime);
  const startMinutes =
    config.onTimeStartHour * 60 + config.onTimeStartMinute;
  return eventMinutes >= startMinutes;
}

export function isWithinCheckInWindow(
  eventTime: Date,
  config: AttendanceEngineConfig
) {
  const eventMinutes = minutesOfDay(eventTime);
  const endMinutes =
    config.checkOutAfterHour * 60 + config.checkOutAfterMinute;
  // Allow first check-in any time before the official checkout cutoff.
  // Late/on-time status is calculated separately at check-in.
  return eventMinutes <= endMinutes;
}

export function isCheckOutWindow(
  eventTime: Date,
  config: AttendanceEngineConfig
) {
  const eventMinutes = minutesOfDay(eventTime);
  const cutoff =
    config.checkOutAfterHour * 60 + config.checkOutAfterMinute;
  return eventMinutes >= cutoff;
}

export async function getAttendanceEngineConfig(): Promise<AttendanceEngineConfig> {
  const [engineResult, rules] = await Promise.all([
    pool.query(
      `
    SELECT setting_value
    FROM system_settings
    WHERE category = 'attendance' AND setting_key = 'engine'
    `
    ),
    getAttendanceRulesSettings(),
  ]);

  const value = engineResult.rows[0]?.setting_value;
  const merged = { ...DEFAULT_CONFIG, ...(value || {}) };
  return applyRulesToConfig(merged, rules);
}

export function minutesOfDay(date: Date) {
  return minutesOfDayInTimezone(date);
}

export function dateOnly(date: Date) {
  return toDateOnlyInTimezone(date);
}

export function todayDateOnly() {
  return getTodayInTimezone();
}

export function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
}

export function timeOnDate(
  baseDate: Date,
  hour: number,
  minute = 0
) {
  const d = new Date(baseDate);
  d.setHours(hour, minute, 0, 0);
  return d;
}
