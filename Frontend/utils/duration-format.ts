/** e.g. 390 → "6 hr 30 min", 45 → "45 min", 0 → "—" */
export function formatDurationMinutes(totalMinutes: number | null | undefined): string {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  if (minutes === 0) return "—";

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

export function formatReportColumnLabel(column: string): string {
  const labels: Record<string, string> = {
    late: "Late",
    late_minutes: "Late",
    working_hours: "Working Hours",
    overtime_hours: "Overtime Hours",
    employee_code: "Employee Code",
    location_name: "Location",
    attendance_date: "Date",
    check_in: "Check In",
    check_out: "Check Out",
    attendance_status: "Status",
  };

  return labels[column] ?? column.replace(/_/g, " ");
}
