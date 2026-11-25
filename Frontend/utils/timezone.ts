export const COMPANY_TIMEZONE = "Asia/Kolkata";

export function toDateOnlyInTimezone(
  date: Date | string,
  timeZone = COMPANY_TIMEZONE
): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function getTodayInTimezone(timeZone = COMPANY_TIMEZONE): string {
  return toDateOnlyInTimezone(new Date(), timeZone);
}

export function minutesOfDayInTimezone(
  date: Date | string,
  timeZone = COMPANY_TIMEZONE
): number {
  const value = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(value);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0
  );
  return hour * 60 + minute;
}

export function formatDateTimeIST(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-IN", {
    timeZone: COMPANY_TIMEZONE,
    ...options,
  });
}

export function formatTimeIST(value: string | Date): string {
  return formatDateTimeIST(value, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function formatRelativeTimeIST(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  return formatDateTimeIST(date, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function nowIsoInTimezone(timeZone = COMPANY_TIMEZONE): string {
  return new Date().toLocaleString("sv-SE", { timeZone }).replace(" ", "T");
}
