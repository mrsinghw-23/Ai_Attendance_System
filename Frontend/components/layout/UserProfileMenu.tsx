"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Camera, KeyRound, Loader2, Mail, MapPin, Phone, User } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import { useToast } from "@/providers/ToastProvider";
import { UserProfile } from "@/types/user-profile";
import { ROLE_LABELS, UserRole } from "@/types/roles";
import { formatDateTimeIST } from "@/utils/timezone";

type UserProfileMenuProps = {
  username: string;
  variant?: "light" | "dark";
};

function displayName(profile: UserProfile | null, username: string) {
  return profile?.full_name?.trim() || username;
}

function avatarInitial(profile: UserProfile | null, username: string) {
  const source = displayName(profile, username);
  return source.charAt(0).toUpperCase();
}

export default function UserProfileMenu({
  username,
  variant = "light",
}: UserProfileMenuProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    mobile: "",
    department: "",
  });

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/auth/profile", { cache: "no-store" });
      const data = await response.json();
      if (data.success) {
        setProfile(data.data);
        setForm({
          full_name: data.data.full_name || "",
          email: data.data.email || "",
          mobile: data.data.mobile || "",
          department: data.data.department || "",
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/profile", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setProfile(data.data);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (open) {
      loadProfile();
    }
  }, [open, loadProfile]);

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name,
          email: form.email || null,
          mobile: form.mobile || null,
          department: form.department || null,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setProfile(data.data);
        showToast("Profile updated", "success");
      } else {
        showToast(data.message || "Failed to update profile", "error");
      }
    } catch (error) {
      console.error(error);
      showToast("Failed to update profile", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/auth/profile/avatar", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (data.success) {
        setProfile(data.data);
        showToast("Profile photo updated", "success");
      } else {
        showToast(data.message || "Failed to upload photo", "error");
      }
    } catch (error) {
      console.error(error);
      showToast("Failed to upload photo", "error");
    } finally {
      setUploading(false);
    }
  }

  const desktopTriggerClass =
    variant === "dark"
      ? "hidden items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 transition hover:bg-white/10 md:flex"
      : "hidden items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 md:flex";

  const mobileTriggerClass =
    variant === "dark"
      ? "flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 transition hover:bg-white/10 md:hidden"
      : "flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 md:hidden";

  const name = displayName(profile, username);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={mobileTriggerClass}
        title="My profile"
        aria-label={`My profile, ${name}`}
      >
        <ProfileAvatar
          image={profile?.profile_image}
          initial={avatarInitial(profile, username)}
          size="sm"
          variant={variant}
        />
      </button>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className={desktopTriggerClass}
        title="My profile"
      >
        <ProfileAvatar
          image={profile?.profile_image}
          initial={avatarInitial(profile, username)}
          size="sm"
          variant={variant}
        />
        <div className="text-left">
          <p
            className={
              variant === "dark"
                ? "text-xs text-slate-400"
                : "text-xs text-slate-500 dark:text-slate-400"
            }
          >
            Welcome,
          </p>
          <p
            className={
              variant === "dark"
                ? "text-sm font-semibold text-white"
                : "text-sm font-semibold text-slate-900 dark:text-white"
            }
          >
            {name}
          </p>
        </div>
      </button>

      <Modal
        open={open}
        title="My Profile"
        onClose={() => setOpen(false)}
        size="lg"
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/change-password"
              className="inline-flex items-center justify-center gap-2 text-sm text-blue-600 hover:underline dark:text-cyan-300 sm:justify-start"
              onClick={() => setOpen(false)}
            >
              <KeyRound size={15} />
              Change password
            </Link>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving || loading}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        }
      >
        {loading && !profile ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="mr-2 animate-spin" size={18} />
            Loading profile...
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <ProfileAvatar
                    image={profile?.profile_image}
                    initial={avatarInitial(profile, username)}
                    size="lg"
                    variant={variant}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    title="Upload profile photo"
                    aria-label="Upload profile photo"
                  >
                    {uploading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Camera size={16} />
                    )}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? "Uploading..." : "Upload photo"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleAvatarChange(file);
                    event.target.value = "";
                  }}
                />
              </div>

              <div className="flex-1 text-center sm:text-left">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  {name}
                </h3>
                <p className="text-sm text-slate-500">@{profile?.username || username}</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <Badge variant="info">
                    {ROLE_LABELS[(profile?.role as UserRole) || UserRole.EMPLOYEE]}
                  </Badge>
                  <Badge variant={profile?.status === "ACTIVE" ? "success" : "warning"}>
                    {profile?.status || "ACTIVE"}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Full name"
                value={form.full_name}
                onChange={(e) =>
                  setForm((current) => ({ ...current, full_name: e.target.value }))
                }
              />
              <Input label="Username" value={profile?.username || username} disabled />
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((current) => ({ ...current, email: e.target.value }))
                }
              />
              <Input
                label="Mobile"
                value={form.mobile}
                onChange={(e) =>
                  setForm((current) => ({ ...current, mobile: e.target.value }))
                }
              />
              <Input
                label="Department"
                value={form.department}
                onChange={(e) =>
                  setForm((current) => ({ ...current, department: e.target.value }))
                }
              />
              <Input
                label="Role"
                value={ROLE_LABELS[(profile?.role as UserRole) || UserRole.EMPLOYEE]}
                disabled
              />
            </div>

            <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-800/40 md:grid-cols-2">
              <DetailRow
                icon={<MapPin size={15} />}
                label="Location"
                value={profile?.location_name || "Not assigned"}
              />
              <DetailRow
                icon={<User size={15} />}
                label="Linked employee"
                value={
                  profile?.employee_name
                    ? `${profile.employee_name}${profile.employee_code ? ` (${profile.employee_code})` : ""}`
                    : "Not linked"
                }
              />
              <DetailRow
                icon={<Mail size={15} />}
                label="Last login"
                value={
                  profile?.last_login_at
                    ? formatDateTimeIST(profile.last_login_at, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })
                    : "Never"
                }
              />
              <DetailRow
                icon={<Phone size={15} />}
                label="Member since"
                value={
                  profile?.created_at
                    ? formatDateTimeIST(profile.created_at, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"
                }
              />
            </div>

            <p className="text-xs text-slate-500">
              Upload a JPG, PNG, or WebP photo up to 2 MB. Your profile photo appears in the header.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-slate-400">{icon}</div>
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <p className="font-medium text-slate-800 dark:text-slate-100">{value}</p>
      </div>
    </div>
  );
}

function ProfileAvatar({
  image,
  initial,
  size,
  variant,
}: {
  image?: string | null;
  initial: string;
  size: "sm" | "lg";
  variant: "light" | "dark";
}) {
  const dimension = size === "lg" ? "h-24 w-24 text-3xl" : "h-9 w-9 text-sm";

  if (image) {
    return (
      <img
        src={image}
        alt="Profile"
        className={`${dimension} rounded-full object-cover ring-2 ring-white/20`}
      />
    );
  }

  return (
    <div
      className={`grid ${dimension} place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 font-bold text-white ${
        variant === "light" ? "ring-2 ring-slate-200 dark:ring-slate-700" : ""
      }`}
    >
      {initial}
    </div>
  );
}
