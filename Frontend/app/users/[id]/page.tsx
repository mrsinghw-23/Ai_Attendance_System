"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Clock, Shield, UserCog } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { useToast } from "@/providers/ToastProvider";
import { AuditLog, LoginHistoryEntry, UserAccount } from "@/types/admin";

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const userId = params.id as string;

  const [user, setUser] = useState<UserAccount | null>(null);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([]);
  const [activityLogs, setActivityLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [userRes, historyRes, activityRes] = await Promise.all([
      fetch(`/api/users/${userId}`),
      fetch(`/api/users/${userId}/login-history`),
      fetch(`/api/users/${userId}/activity`),
    ]);

    const [userData, historyData, activityData] = await Promise.all([
      userRes.json(),
      historyRes.json(),
      activityRes.json(),
    ]);

    if (userData.success) setUser(userData.data);
    else showToast(userData.message || "User not found", "error");

    if (historyData.success) setLoginHistory(historyData.data);
    if (activityData.success) setActivityLogs(activityData.data);
    setLoading(false);
  }, [showToast, userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <DashboardLayout title="User Profile" module="users">
      <div className="mb-4">
        <Button variant="secondary" onClick={() => router.push("/users")}>
          <ArrowLeft size={16} className="mr-2" />
          Back to Users
        </Button>
      </div>

      {loading ? (
        <div className="text-slate-500">Loading profile...</div>
      ) : !user ? (
        <div className="text-slate-500">User not found.</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="rounded-2xl bg-blue-500/10 p-3 text-blue-500">
                <UserCog size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold">{user.full_name || user.username}</h2>
                <p className="text-sm text-slate-500">@{user.username}</p>
              </div>
            </div>

            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Email</dt>
                <dd>{user.email || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Mobile</dt>
                <dd>{user.mobile || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Department</dt>
                <dd>{user.department || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Role</dt>
                <dd><Badge variant="info">{user.role}</Badge></dd>
              </div>
              <div>
                <dt className="text-slate-500">Location</dt>
                <dd>{user.location_name || "Global"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Employee</dt>
                <dd>{user.employee_name || "Not mapped"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <Badge variant={user.status === "ACTIVE" ? "success" : "danger"}>
                    {user.status}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Last Login</dt>
                <dd>
                  {user.last_login_at
                    ? new Date(user.last_login_at).toLocaleString()
                    : "Never"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Created</dt>
                <dd>{new Date(user.created_at).toLocaleString()}</dd>
              </div>
            </dl>
          </div>

          <div className="xl:col-span-2 space-y-6">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock size={18} />
                <h3 className="font-semibold">Login History</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Event</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">IP</th>
                      <th className="px-3 py-2">Browser</th>
                      <th className="px-3 py-2">Device</th>
                      <th className="px-3 py-2">Date/Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loginHistory.map((entry) => (
                      <tr key={entry.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2">{entry.event_type}</td>
                        <td className="px-3 py-2">{entry.status}</td>
                        <td className="px-3 py-2">{entry.ip_address || "—"}</td>
                        <td className="px-3 py-2">{entry.browser || "—"}</td>
                        <td className="px-3 py-2">{entry.device || "—"}</td>
                        <td className="px-3 py-2">
                          {new Date(entry.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5">
              <div className="flex items-center gap-2 mb-4">
                <Shield size={18} />
                <h3 className="font-semibold">User Activity Logs</h3>
              </div>
              <div className="space-y-3">
                {activityLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3"
                  >
                    <p className="text-sm font-medium">{log.action}</p>
                    <p className="text-xs text-slate-500">
                      {log.username || "System"} ·{" "}
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
