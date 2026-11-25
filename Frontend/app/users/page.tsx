"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Eye,
  KeyRound,
  Plus,
  Shield,
  Trash2,
  UserCog,
  UserMinus,
  UserPlus,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { useToast } from "@/providers/ToastProvider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canDeleteRecords } from "@/utils/permissions";
import { AuditLog, PermissionRecord, RoleRecord, UserAccount } from "@/types/admin";
import { Employee } from "@/types/employee";
import { Location } from "@/types/location";
import { ALL_ROLES, ROLE_LABELS, UserRole } from "@/types/roles";
import { PERMISSION_ACTIONS } from "@/constants/permissions";

interface UserFormState {
  username: string;
  password: string;
  confirmPassword: string;
  full_name: string;
  email: string;
  mobile: string;
  department: string;
  role: UserRole;
  status: "ACTIVE" | "INACTIVE";
  employee_id: string;
  location_id: string;
  force_password_change: boolean;
}

const emptyForm: UserFormState = {
  username: "",
  password: "",
  confirmPassword: "",
  full_name: "",
  email: "",
  mobile: "",
  department: "",
  role: UserRole.EMPLOYEE,
  status: "ACTIVE",
  employee_id: "",
  location_id: "",
  force_password_change: false,
};

export default function UsersPage() {
  const { showToast } = useToast();
  const { user: currentUser } = useCurrentUser();
  const canDelete = canDeleteRecords(currentUser?.role || "");
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.HR);
  const [rolePermissionCodes, setRolePermissionCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [resetTarget, setResetTarget] = useState<UserAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserAccount | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [generateTemp, setGenerateTemp] = useState(true);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [activeTab, setActiveTab] = useState<"users" | "permissions">("users");

  const loadData = useCallback(async () => {
    setLoading(true);
    const [usersRes, employeesRes, locationsRes, auditRes, rolesRes, permsRes] =
      await Promise.all([
        fetch("/api/users"),
        fetch("/api/employees?limit=100"),
        fetch("/api/locations"),
        fetch("/api/audit-logs?limit=25"),
        fetch("/api/roles"),
        fetch("/api/permissions"),
      ]);

    const [usersData, employeesData, locationsData, auditData, rolesData, permsData] =
      await Promise.all([
        usersRes.json(),
        employeesRes.json(),
        locationsRes.json(),
        auditRes.json(),
        rolesRes.json(),
        permsRes.json(),
      ]);

    if (usersData.success) setUsers(usersData.data);
    else showToast(usersData.message || "Failed to load users", "error");

    if (employeesData.success) setEmployees(employeesData.data);
    if (locationsData.success) setLocations(locationsData.data);
    if (auditData.success) setAuditLogs(auditData.data);
    if (rolesData.success) setRoles(rolesData.data);
    if (permsData.success) setPermissions(permsData.data);
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const role = roles.find((item) => item.code === selectedRole);
    if (role) {
      setRolePermissionCodes(role.permissions.map((p) => p.code));
    }
  }, [selectedRole, roles]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(user: UserAccount) {
    setEditing(user);
    setForm({
      username: user.username,
      password: "",
      confirmPassword: "",
      full_name: user.full_name || "",
      email: user.email || "",
      mobile: user.mobile || "",
      department: user.department || "",
      role: user.role,
      status: user.status,
      employee_id: user.employee_id ? String(user.employee_id) : "",
      location_id: user.location_id ? String(user.location_id) : "",
      force_password_change: user.password_reset_required,
    });
    setModalOpen(true);
  }

  function resetFormFields() {
    setForm(editing ? form : emptyForm);
  }

  async function saveUser() {
    if (!editing && form.password !== form.confirmPassword) {
      showToast("Passwords do not match", "error");
      return;
    }

    setSaving(true);
    const payload = {
      username: form.username,
      ...(editing ? {} : { password: form.password, confirmPassword: form.confirmPassword }),
      full_name: form.full_name || null,
      email: form.email || null,
      mobile: form.mobile || null,
      department: form.department || null,
      role: form.role,
      status: form.status,
      employee_id: form.employee_id ? Number(form.employee_id) : null,
      location_id: form.location_id ? Number(form.location_id) : null,
      force_password_change: form.force_password_change,
    };

    const response = await fetch(
      editing ? `/api/users/${editing.id}` : "/api/users",
      {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const data = await response.json();

    if (data.success) {
      showToast(editing ? "User updated" : "User created", "success");
      setModalOpen(false);
      loadData();
    } else {
      showToast(data.message || "Failed to save user", "error");
    }
    setSaving(false);
  }

  async function toggleStatus(user: UserAccount) {
    const nextStatus = user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const response = await fetch(`/api/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const data = await response.json();
    if (data.success) {
      showToast(`User ${nextStatus === "ACTIVE" ? "activated" : "deactivated"}`, "success");
      loadData();
    } else {
      showToast(data.message || "Status update failed", "error");
    }
  }

  async function resetUserPassword() {
    if (!resetTarget) return;
    setSaving(true);
    const response = await fetch(
      `/api/users/${resetTarget.id}/reset-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword: generateTemp ? undefined : resetPassword,
          generateTemporary: generateTemp,
          requireChange: true,
        }),
      }
    );
    const data = await response.json();

    if (data.success) {
      showToast(
        data.temporaryPassword
          ? `Password reset. Temporary: ${data.temporaryPassword}`
          : "Password reset",
        "success"
      );
      setResetOpen(false);
      setResetPassword("");
      loadData();
    } else {
      showToast(data.message || "Password reset failed", "error");
    }
    setSaving(false);
  }

  async function deleteUser() {
    if (!deleteTarget) return;
    setSaving(true);
    const response = await fetch(`/api/users/${deleteTarget.id}`, {
      method: "DELETE",
    });
    const data = await response.json();

    if (data.success) {
      showToast("User deleted", "success");
      setDeleteOpen(false);
      loadData();
    } else {
      showToast(data.message || "Delete failed", "error");
    }
    setSaving(false);
  }

  async function saveRolePermissions() {
    setSaving(true);
    const response = await fetch(`/api/roles/${selectedRole}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissionCodes: rolePermissionCodes }),
    });
    const data = await response.json();

    if (data.success) {
      showToast("Role permissions updated", "success");
      setRoles(data.data);
    } else {
      showToast(data.message || "Failed to update permissions", "error");
    }
    setSaving(false);
  }

  function togglePermission(code: string) {
    setRolePermissionCodes((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code]
    );
  }

  return (
    <DashboardLayout
      title="User Management"
      module="users"
      actions={
        activeTab === "users" ? (
          <Button onClick={openCreate}>
            <Plus size={16} className="mr-2" />
            Create User
          </Button>
        ) : undefined
      }
    >
      <div className="mb-4 flex gap-2">
        <Button
          variant={activeTab === "users" ? "primary" : "secondary"}
          onClick={() => setActiveTab("users")}
        >
          Users
        </Button>
        <Button
          variant={activeTab === "permissions" ? "primary" : "secondary"}
          onClick={() => setActiveTab("permissions")}
        >
          Permission Matrix
        </Button>
      </div>

      {activeTab === "permissions" ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5"
        >
          <div className="mb-4 grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
            <Select
              label="Role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as UserRole)}
              options={ALL_ROLES.map((role) => ({
                label: ROLE_LABELS[role],
                value: role,
              }))}
            />
            <div className="flex items-end">
              <Button onClick={saveRolePermissions} disabled={saving}>
                Save Permissions
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">Module</th>
                  <th className="px-4 py-3">Permissions</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(PERMISSION_ACTIONS).map(([module, actions]) => (
                  <tr key={module} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3 capitalize font-medium">{module}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        {actions.map((action) => {
                          const code = `${module}.${action}`;
                          const permission = permissions.find((p) => p.code === code);
                          if (!permission) return null;
                          return (
                            <label key={code} className="inline-flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={rolePermissionCodes.includes(code)}
                                onChange={() => togglePermission(code)}
                              />
                              <span className="capitalize">{action.replace("_", " ")}</span>
                            </label>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      ) : (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="xl:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md overflow-hidden"
        >
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <UserCog size={18} />
            <h3 className="font-semibold">Accounts</h3>
          </div>

          {loading ? (
            <div className="p-6 text-slate-500">Loading users...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Username</th>
                    <th className="px-4 py-3">Full Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last Login</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-t border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-4 py-3 font-medium">{user.username}</td>
                      <td className="px-4 py-3">{user.full_name || "—"}</td>
                      <td className="px-4 py-3">{user.email || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="info">{user.role}</Badge>
                      </td>
                      <td className="px-4 py-3">{user.department || "—"}</td>
                      <td className="px-4 py-3">{user.location_name || "Global"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={user.status === "ACTIVE" ? "success" : "danger"}>
                          {user.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {user.last_login_at
                          ? new Date(user.last_login_at).toLocaleString()
                          : "Never"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1 flex-wrap">
                          <Link href={`/users/${user.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye size={15} />
                            </Button>
                          </Link>
                          <Button variant="secondary" size="sm" onClick={() => openEdit(user)}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => toggleStatus(user)}>
                            {user.status === "ACTIVE" ? (
                              <UserMinus size={15} />
                            ) : (
                              <UserPlus size={15} />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setResetTarget(user);
                              setResetOpen(true);
                            }}
                          >
                            <KeyRound size={15} />
                          </Button>
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDeleteTarget(user);
                                setDeleteOpen(true);
                              }}
                            >
                              <Trash2 size={15} className="text-rose-500" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Shield size={18} />
            <h3 className="font-semibold">Activity Feed</h3>
          </div>
          <div className="space-y-3 max-h-[640px] overflow-y-auto">
            {auditLogs.map((log) => (
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
        </motion.div>
      </div>
      )}

      <Modal
        open={modalOpen}
        title={editing ? "Edit User" : "Create User"}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="ghost" onClick={resetFormFields}>
              Reset Form
            </Button>
            <Button onClick={saveUser} disabled={saving}>
              {saving ? "Saving..." : "Save User"}
            </Button>
          </>
        }
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <Input
            label="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          {!editing && (
            <>
              <Input
                label="Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <Input
                label="Confirm Password"
                type="password"
                value={form.confirmPassword}
                onChange={(e) =>
                  setForm({ ...form, confirmPassword: e.target.value })
                }
              />
            </>
          )}
          <Input
            label="Full Name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              label="Mobile Number"
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
            />
          </div>
          <Input
            label="Department"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Role"
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as UserRole })
              }
              options={ALL_ROLES.map((role) => ({
                label: ROLE_LABELS[role],
                value: role,
              }))}
            />
            <Select
              label="Status"
              value={form.status}
              onChange={(e) =>
                setForm({
                  ...form,
                  status: e.target.value as "ACTIVE" | "INACTIVE",
                })
              }
              options={[
                { label: "Active", value: "ACTIVE" },
                { label: "Inactive", value: "INACTIVE" },
              ]}
            />
          </div>
          <Select
            label="Employee Mapping"
            value={form.employee_id}
            onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
            options={[
              { label: "No employee profile", value: "" },
              ...employees.map((employee) => ({
                label: `${employee.first_name} ${employee.last_name} (${employee.employee_code})`,
                value: String(employee.id),
              })),
            ]}
          />
          <Select
            label="Location"
            value={form.location_id}
            onChange={(e) => setForm({ ...form, location_id: e.target.value })}
            options={[
              { label: "Global / none", value: "" },
              ...locations.map((location) => ({
                label: location.location_name,
                value: String(location.id),
              })),
            ]}
          />
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.force_password_change}
              onChange={(e) =>
                setForm({ ...form, force_password_change: e.target.checked })
              }
            />
            Force password change on first login
          </label>
        </div>
      </Modal>

      <Modal
        open={resetOpen}
        title={`Reset Password${resetTarget ? `: ${resetTarget.username}` : ""}`}
        onClose={() => setResetOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={resetUserPassword} disabled={saving}>
              Reset Password
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={generateTemp}
              onChange={(e) => setGenerateTemp(e.target.checked)}
            />
            Generate secure temporary password
          </label>
          {!generateTemp && (
            <Input
              label="New temporary password"
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
            />
          )}
          <p className="text-xs text-slate-500">
            User will receive: &quot;Your password has been reset.&quot; and must change password on next login.
          </p>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        title={`Delete User${deleteTarget ? `: ${deleteTarget.username}` : ""}`}
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={deleteUser} disabled={saving}>
              Delete User
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This action permanently removes the user account. This cannot be undone.
        </p>
      </Modal>
    </DashboardLayout>
  );
}
