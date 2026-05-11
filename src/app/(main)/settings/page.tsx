"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, Save, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";

type AppRole = "admin" | "user";

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  enabled: boolean;
  allowed_branches: string[];
}

interface BranchInfo {
  key: string;
  name: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

const ROLE_OPTIONS: Array<{ value: AppRole; label: string }> = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

function normalizeBranchSelection(branches: string[]) {
  return branches.includes("*") ? ["*"] : [...new Set(branches)];
}

export default function SettingsPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingEmail, setSavingEmail] = useState<string | null>(null);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("user");
  const [newBranches, setNewBranches] = useState<string[]>([]);

  const branchOptions = useMemo(
    () => branches.filter((branch) => branch.key !== "ALL"),
    [branches]
  );

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [usersResponse, branchesResponse] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/branches"),
      ]);

      if (!usersResponse.ok) {
        throw new Error(usersResponse.status === 403 ? "ไม่มีสิทธิ์เข้าใช้งานหน้านี้" : "โหลดข้อมูลผู้ใช้ไม่สำเร็จ");
      }

      const usersJson = await usersResponse.json() as ApiResponse<ManagedUser[]>;
      const branchesJson = await branchesResponse.json() as BranchInfo[];

      setUsers(usersJson.data ?? []);
      setBranches(Array.isArray(branchesJson) ? branchesJson : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดระหว่างโหลดข้อมูล");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function toggleBranch(current: string[], branchKey: string) {
    if (branchKey === "*") {
      return current.includes("*") ? [] : ["*"];
    }

    const withoutAll = current.filter((key) => key !== "*");
    return withoutAll.includes(branchKey)
      ? withoutAll.filter((key) => key !== branchKey)
      : [...withoutAll, branchKey];
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingEmail(newEmail);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          role: newRole,
          allowed_branches: newRole === "admin" ? ["*"] : normalizeBranchSelection(newBranches),
          enabled: true,
        }),
      });
      const json = await response.json() as ApiResponse<ManagedUser>;

      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.error || "เพิ่มผู้ใช้ไม่สำเร็จ");
      }

      setUsers((current) => [json.data!, ...current]);
      setNewEmail("");
      setNewRole("user");
      setNewBranches([]);
      setMessage("เพิ่มผู้ใช้เรียบร้อย");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มผู้ใช้ไม่สำเร็จ");
    } finally {
      setSavingEmail(null);
    }
  }

  async function updateUser(user: ManagedUser, patch: Partial<ManagedUser>) {
    const nextUser = {
      ...user,
      ...patch,
      allowed_branches: normalizeBranchSelection(patch.allowed_branches ?? user.allowed_branches),
    };

    setSavingEmail(user.email);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentEmail: user.email,
          email: nextUser.email,
          name: nextUser.name,
          role: nextUser.role,
          enabled: nextUser.enabled,
          allowed_branches: nextUser.role === "admin" ? ["*"] : nextUser.allowed_branches,
        }),
      });
      const json = await response.json() as ApiResponse<ManagedUser>;

      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.error || "บันทึกข้อมูลไม่สำเร็จ");
      }

      setUsers((current) => current.map((item) => (item.email === user.email ? json.data! : item)));
      setMessage("บันทึกข้อมูลเรียบร้อย");
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกข้อมูลไม่สำเร็จ");
    } finally {
      setSavingEmail(null);
    }
  }

  async function deleteUser(user: ManagedUser) {
    const confirmed = window.confirm(`ลบผู้ใช้ ${user.email} ออกจากระบบใช่หรือไม่?`);
    if (!confirmed) return;

    setDeletingEmail(user.email);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      const json = await response.json() as ApiResponse<{ email: string }>;

      if (!response.ok || !json.success) {
        throw new Error(json.error || "ลบผู้ใช้ไม่สำเร็จ");
      }

      setUsers((current) => current.filter((item) => item.email !== user.email));
      setMessage("ลบผู้ใช้เรียบร้อย");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบผู้ใช้ไม่สำเร็จ");
    } finally {
      setDeletingEmail(null);
    }
  }

  return (
    <main className="space-y-6">
      <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--primary))]">
              <ShieldCheck className="h-4 w-4" />
              Admin settings
            </div>
            <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">จัดการผู้ใช้และสิทธิ์ข้อมูล</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              เพิ่มอีเมลที่เข้าใช้งานได้ กำหนด role และจำกัดสาขาที่ผู้ใช้เห็นใน dashboard
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-[hsl(var(--border))] px-4 py-3">
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Users</p>
              <p className="mt-1 text-xl font-bold">{users.length}</p>
            </div>
            <div className="rounded-lg border border-[hsl(var(--border))] px-4 py-3">
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Admins</p>
              <p className="mt-1 text-xl font-bold">{users.filter((user) => user.role === "admin").length}</p>
            </div>
            <div className="rounded-lg border border-[hsl(var(--border))] px-4 py-3">
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Branches</p>
              <p className="mt-1 text-xl font-bold">{branchOptions.length}</p>
            </div>
          </div>
        </div>
      </section>

      {(message || error) && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            error
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          )}
        >
          {error || message}
        </div>
      )}

      <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
        <form className="grid gap-4 lg:grid-cols-[1fr_160px_1.5fr_auto]" onSubmit={createUser}>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Email</span>
            <input
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder="user@example.com"
              required
              className="h-11 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Role</span>
            <select
              value={newRole}
              onChange={(event) => setNewRole(event.target.value as AppRole)}
              className="h-11 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
          </label>
          <div className="space-y-2">
            <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Allowed branches</span>
            <BranchPicker
              branches={branchOptions}
              selected={newRole === "admin" ? ["*"] : newBranches}
              disabled={newRole === "admin"}
              onToggle={(branchKey) => setNewBranches((current) => toggleBranch(current, branchKey))}
            />
          </div>
          <button
            type="submit"
            disabled={savingEmail === newEmail}
            className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-lg bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-[hsl(var(--primary))]/90 disabled:opacity-60"
          >
            {savingEmail === newEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            เพิ่มผู้ใช้
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
        {loading ? (
          <div className="flex h-40 items-center justify-center gap-3 text-sm text-[hsl(var(--muted-foreground))]">
            <Loader2 className="h-5 w-5 animate-spin" />
            กำลังโหลดข้อมูล
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Allowed branches</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border))]">
                {users.map((user) => (
                  <UserRow
                    key={user.id || user.email}
                    user={user}
                    branches={branchOptions}
                    saving={savingEmail === user.email}
                    deleting={deletingEmail === user.email}
                    onSave={updateUser}
                    onDelete={deleteUser}
                    toggleBranch={toggleBranch}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function BranchPicker({
  branches,
  selected,
  disabled,
  onToggle,
}: {
  branches: BranchInfo[];
  selected: string[];
  disabled?: boolean;
  onToggle: (branchKey: string) => void;
}) {
  return (
    <div className="flex min-h-11 flex-wrap gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onToggle("*")}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition",
          selected.includes("*")
            ? "bg-[hsl(var(--primary))] text-white"
            : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
          disabled && "cursor-not-allowed opacity-80"
        )}
      >
        {selected.includes("*") && <Check className="h-3 w-3" />}
        ทุกสาขา
      </button>
      {branches.map((branch) => (
        <button
          key={branch.key}
          type="button"
          disabled={disabled || selected.includes("*")}
          onClick={() => onToggle(branch.key)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition",
            selected.includes(branch.key)
              ? "bg-indigo-100 text-indigo-700"
              : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
            (disabled || selected.includes("*")) && "cursor-not-allowed opacity-60"
          )}
        >
          {selected.includes(branch.key) && <Check className="h-3 w-3" />}
          {branch.key}
        </button>
      ))}
    </div>
  );
}

function UserRow({
  user,
  branches,
  saving,
  deleting,
  onSave,
  onDelete,
  toggleBranch,
}: {
  user: ManagedUser;
  branches: BranchInfo[];
  saving: boolean;
  deleting: boolean;
  onSave: (user: ManagedUser, patch: Partial<ManagedUser>) => Promise<void>;
  onDelete: (user: ManagedUser) => Promise<void>;
  toggleBranch: (current: string[], branchKey: string) => string[];
}) {
  const [draft, setDraft] = useState(user);

  useEffect(() => {
    setDraft(user);
  }, [user]);

  const isAdmin = draft.role === "admin";

  return (
    <tr>
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
            <UserCog className="h-5 w-5" />
          </div>
          <div className="grid min-w-[250px] gap-2">
            <input
              type="text"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Name"
              className="h-9 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
            <input
              type="email"
              value={draft.email}
              onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
              placeholder="email@example.com"
              className="h-9 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-xs outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <select
          value={draft.role}
          onChange={(event) => {
            const role = event.target.value as AppRole;
            setDraft((current) => ({
              ...current,
              role,
              allowed_branches: role === "admin" ? ["*"] : current.allowed_branches.filter((branch) => branch !== "*"),
            }));
          }}
          className="h-9 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
        >
          {ROLE_OPTIONS.map((role) => (
            <option key={role.value} value={role.value}>{role.label}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-4">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
            className="h-4 w-4 rounded border-[hsl(var(--border))]"
          />
          {draft.enabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}
        </label>
      </td>
      <td className="px-4 py-4">
        <BranchPicker
          branches={branches}
          selected={isAdmin ? ["*"] : draft.allowed_branches}
          disabled={isAdmin}
          onToggle={(branchKey) =>
            setDraft((current) => ({
              ...current,
              allowed_branches: toggleBranch(current.allowed_branches, branchKey),
            }))
          }
        />
      </td>
      <td className="px-4 py-4">
        <div className="flex justify-end gap-2">
          {/* ปุ่มบันทึก */}
          <div className="relative group">
            <button
              type="button"
              disabled={saving || deleting}
              onClick={() => onSave(user, draft)}
              aria-label="บันทึก"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition hover:bg-[hsl(var(--accent))] disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </button>
            <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
              บันทึก
            </span>
          </div>

          {/* ปุ่มลบ */}
          <div className="relative group">
            <button
              type="button"
              disabled={saving || deleting}
              onClick={() => onDelete(user)}
              aria-label="ลบ"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
            <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
              ลบ
            </span>
          </div>
        </div>
      </td>
    </tr>
  );
}
