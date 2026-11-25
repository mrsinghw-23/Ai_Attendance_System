interface BadgeProps {
  children: React.ReactNode;
  variant?:
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "neutral";
}

const styles = {
  success:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  warning:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  danger:
    "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  info:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  neutral:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export default function Badge({
  children,
  variant = "neutral",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

export function getStatusBadgeVariant(
  status: string
): BadgeProps["variant"] {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "INACTIVE":
      return "danger";
    case "ON_LEAVE":
      return "warning";
    case "REGISTERED":
      return "success";
    case "PENDING":
      return "warning";
    case "NOT_REGISTERED":
      return "neutral";
    default:
      return "neutral";
  }
}

export function formatStatusLabel(
  status: string
) {
  return status
    .toLowerCase()
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}
