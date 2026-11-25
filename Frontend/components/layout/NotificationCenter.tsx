"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell, Camera, Clock, Shield, X } from "lucide-react";
import { Notification, NotificationType } from "@/types/phase6";
import { formatRelativeTimeIST } from "@/utils/timezone";

type NotificationCenterProps = {
  variant?: "light" | "dark";
};

type PanelPosition = {
  top: number;
  right: number;
};

function typeIcon(type: NotificationType) {
  switch (type) {
    case "CAMERA":
      return Camera;
    case "ATTENDANCE":
      return Clock;
    case "SECURITY":
      return Shield;
    default:
      return Bell;
  }
}

function typeLabel(type: NotificationType) {
  switch (type) {
    case "CAMERA":
      return "Camera";
    case "ATTENDANCE":
      return "Attendance";
    case "SECURITY":
      return "Security";
    default:
      return "System";
  }
}

function resolveNotificationHref(item: Notification): string | null {
  if (!item.entity_type || !item.entity_id) {
    if (item.type === "CAMERA") return "/cameras";
    if (item.type === "ATTENDANCE") return "/attendance";
    return null;
  }

  switch (item.entity_type) {
    case "camera":
      return `/cameras/${item.entity_id}`;
    case "attendance_record":
      return "/attendance";
    case "employee":
      return `/employees/${item.entity_id}`;
    case "location":
      return `/locations`;
    default:
      return null;
  }
}

function priorityClass(
  priority: Notification["priority"],
  variant: "light" | "dark"
) {
  if (priority === "HIGH") {
    return variant === "dark" ? "text-rose-300" : "text-rose-600";
  }
  if (priority === "LOW") {
    return variant === "dark" ? "text-slate-400" : "text-slate-500";
  }
  return variant === "dark" ? "text-cyan-200" : "text-blue-600";
}

export default function NotificationCenter({
  variant = "light",
}: NotificationCenterProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [panelPos, setPanelPos] = useState<PanelPosition>({ top: 64, right: 16 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((item) => !item.read_at).length;

  const updatePanelPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    setPanelPos({
      top: rect.bottom + 10,
      right: Math.max(12, window.innerWidth - rect.right),
    });
  }, []);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const data = await response.json();
      if (data.success) {
        setNotifications(data.data || []);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    loadNotifications();
    const timer = setInterval(loadNotifications, 30000);
    return () => clearInterval(timer);
  }, [loadNotifications]);

  useEffect(() => {
    if (!open) return;

    updatePanelPosition();
    loadNotifications();

    function handleResize() {
      updatePanelPosition();
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    document.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, loadNotifications, updatePanelPosition]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function markRead(id: number) {
    try {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
      });
      const data = await response.json();
      if (data.success) {
        setNotifications((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  read_at: data.data.read_at || new Date().toISOString(),
                }
              : item
          )
        );
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function markAllRead() {
    try {
      const response = await fetch("/api/notifications/read-all", {
        method: "PATCH",
      });
      const data = await response.json();
      if (data.success) {
        setNotifications((current) =>
          current.map((item) => ({
            ...item,
            read_at: item.read_at || new Date().toISOString(),
          }))
        );
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function handleNotificationClick(item: Notification) {
    if (!item.read_at) {
      await markRead(item.id);
    }

    const href = resolveNotificationHref(item);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  }

  const triggerClass =
    variant === "dark"
      ? "relative rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-300 transition hover:bg-white/10"
      : "relative rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-slate-500 hover:text-blue-600 hover:shadow-sm transition";

  const panelClass =
    variant === "dark"
      ? "overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220] shadow-2xl shadow-black/50 ring-1 ring-white/10"
      : "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 dark:ring-white/10";

  const overlay = open && mounted
    ? createPortal(
        <>
          <div
            className="fixed inset-0 z-[9998] bg-black/20 backdrop-blur-[1px]"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            className={`fixed z-[9999] w-[min(24rem,calc(100vw-1.5rem))] ${panelClass}`}
            style={{ top: panelPos.top, right: panelPos.right }}
            role="dialog"
            aria-label="Notifications"
          >
            <div
              className={
                variant === "dark"
                  ? "flex items-center justify-between border-b border-white/10 px-4 py-3"
                  : "flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700"
              }
            >
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Notifications
                </p>
                <p className="text-xs text-slate-500">
                  {unreadCount > 0
                    ? `${unreadCount} unread`
                    : "You are all caught up"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="rounded-lg px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:text-cyan-300 dark:hover:bg-white/10"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="Close notifications"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="max-h-[min(24rem,calc(100vh-8rem))] overflow-y-auto">
              {loading && notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  Loading notifications...
                </p>
              ) : notifications.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    No notifications yet
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Camera alerts, late attendance, and system events will appear here.
                  </p>
                </div>
              ) : (
                notifications.map((item) => {
                  const Icon = typeIcon(item.type);
                  const unread = !item.read_at;
                  const href = resolveNotificationHref(item);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void handleNotificationClick(item)}
                      className={`flex w-full gap-3 border-b px-4 py-3 text-left transition last:border-b-0 ${
                        variant === "dark"
                          ? unread
                            ? "border-white/5 bg-cyan-400/5 hover:bg-white/5"
                            : "border-white/5 hover:bg-white/5"
                          : unread
                            ? "border-slate-100 bg-blue-50/70 hover:bg-slate-50 dark:border-slate-800 dark:bg-blue-950/20 dark:hover:bg-slate-800/60"
                            : "border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          variant === "dark"
                            ? "bg-white/10"
                            : "bg-slate-100 dark:bg-slate-800"
                        } ${priorityClass(item.priority, variant)}`}
                      >
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {item.title}
                          </p>
                          {unread && (
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                          )}
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                          {item.message}
                        </p>
                        <p className="mt-2 text-[11px] text-slate-500">
                          {formatRelativeTimeIST(item.created_at)} ·{" "}
                          {typeLabel(item.type)}
                          {item.priority === "HIGH" ? " · High priority" : ""}
                          {href ? " · Tap to open" : ""}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title="Notifications"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => {
          updatePanelPosition();
          setOpen((current) => !current);
        }}
        className={triggerClass}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {overlay}
    </>
  );
}
