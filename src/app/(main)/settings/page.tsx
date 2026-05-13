"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Loader2, Mail, Pencil, Plus, Search, ShieldCheck, SlidersHorizontal, Trash2, UserPlus, Users, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
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

interface ToastState {
  type: "success" | "error";
  message: string;
}

const ROLE_OPTIONS: Array<{ value: AppRole; label: string }> = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

const ROLE_FILTER_OPTIONS: Array<{ value: "all" | AppRole; label: string }> = [
  { value: "all", label: "All roles" },
  ...ROLE_OPTIONS,
];

const STATUS_FILTER_OPTIONS: Array<{ value: "all" | "enabled" | "disabled"; label: string }> = [
  { value: "all", label: "All status" },
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
];

const AVATAR_COLORS = [
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-cyan-100 text-cyan-700",
];

function normalizeBranchSelection(branches: string[]) {
  return branches.includes("*") ? ["*"] : [...new Set(branches)];
}

function getInitials(user: ManagedUser) {
  const source = (user.name || user.email.split("@")[0] || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const initials = parts.length > 1
    ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`
    : source.slice(0, 2);

  return initials.toUpperCase();
}

function getBranchLabel(user: ManagedUser, branches: BranchInfo[]) {
  if (user.role === "admin" || user.allowed_branches.includes("*")) {
    return "ทุกกิจการ";
  }

  const selected = branches
    .filter((branch) => user.allowed_branches.includes(branch.key))
    .map((branch) => branch.name);

  if (selected.length === 0) return "ยังไม่เลือกกิจการ";
  if (selected.length === 1) return selected[0];
  return `เลือกแล้ว ${selected.length} กิจการ`;
}

export default function SettingsPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingEmail, setSavingEmail] = useState<string | null>(null);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("user");
  const [newBranches, setNewBranches] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AppRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<ManagedUser | null>(null);

  const branchOptions = useMemo(
    () => branches.filter((branch) => branch.key !== "ALL"),
    [branches]
  );

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch = !normalizedSearch
        || user.name.toLowerCase().includes(normalizedSearch)
        || user.email.toLowerCase().includes(normalizedSearch);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "enabled" ? user.enabled : !user.enabled);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [roleFilter, searchTerm, statusFilter, users]);

  const showToast = useCallback((type: ToastState["type"], message: string) => {
    setToast({ type, message });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);

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
      showToast("error", err instanceof Error ? err.message : "เกิดข้อผิดพลาดระหว่างโหลดข้อมูล");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!toast) return;

    const timeout = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

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
      showToast("success", "เพิ่มผู้ใช้งานแล้ว");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "เพิ่มผู้ใช้งานไม่สำเร็จ");
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
      showToast("success", "บันทึกข้อมูลแล้ว");
      return true;
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "บันทึกข้อมูลไม่สำเร็จ");
      return false;
    } finally {
      setSavingEmail(null);
    }
  }

  async function deleteUser(user: ManagedUser) {
    setConfirmDeleteUser(user);
  }

  async function executeDeleteUser() {
    if (!confirmDeleteUser) return;
    const user = confirmDeleteUser;
    setConfirmDeleteUser(null);
    setDeletingEmail(user.email);

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
      showToast("success", "ลบผู้ใช้งานแล้ว");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "ลบผู้ใช้งานไม่สำเร็จ");
    } finally {
      setDeletingEmail(null);
    }
  }

  return (
    <main className="space-y-6">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <section className="space-x-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--primary))]">
              <ShieldCheck className="h-4 w-4" />
              Admin settings
            </div>
            <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">จัดการผู้ใช้และสิทธิ์ข้อมูล</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              เพิ่มอีเมลที่เข้าใช้งานได้ กำหนดบทบาท และจำกัดสาขาที่ผู้ใช้เห็นใน Dashboard
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
      <section className = "space-y-7">
           <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_160px_160px] xl:w-[680px]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="ค้นหาชื่อหรืออีเมล"
                  className="h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                />
              </label>
              <label className="relative">
                <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
                <select
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value as "all" | AppRole)}
                  className="h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                >
                  {ROLE_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "all" | "enabled" | "disabled")}
                className="h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              >
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
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
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border))]">
                {filteredUsers.map((user, index) => (
                  <UserRow
                    key={user.id || user.email}
                    user={user}
                    avatarClassName={AVATAR_COLORS[index % AVATAR_COLORS.length]}
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
            {filteredUsers.length === 0 && (
              <div className="flex h-32 items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
                ไม่พบผู้ใช้ที่ตรงกับเงื่อนไข
              </div>
            )}
          </div>
        )}
      </section>
      {confirmDeleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-[380px] max-w-[calc(100vw-2rem)] rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-500/10">
                <Trash2 className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <p className="font-semibold text-[hsl(var(--foreground))]">ยืนยันการลบ</p>
                <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">การกระทำนี้ไม่สามารถย้อนกลับได้</p>
              </div>
            </div>
            <p className="mb-6 text-sm text-[hsl(var(--muted-foreground))]">
              ต้องการลบผู้ใช้{" "}
              <span className="font-semibold text-[hsl(var(--foreground))]">{confirmDeleteUser.email}</span>{" "}
              ออกจากระบบ?
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteUser(null)}
                className="rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium transition hover:bg-[hsl(var(--muted))]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void executeDeleteUser()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-500/20 transition hover:bg-rose-700"
              >
                ลบผู้ใช้
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Toast({
  toast,
  onClose,
}: {
  toast: ToastState | null;
  onClose: () => void;
}) {
  if (!toast) return null;

  const isError = toast.type === "error";

  return (
    <div className="fixed right-4 top-4 z-[100] w-[calc(100vw-2rem)] max-w-sm">
      <div
        className={cn(
          "flex items-start gap-3 rounded-lg border-2 p-4 text-sm text-white shadow-2xl",
          isError
            ? "border-rose-700 bg-rose-600 shadow-rose-950/25"
            : "border-emerald-700 bg-emerald-600 shadow-emerald-950/25"
        )}
      >
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            isError ? "bg-white/20 text-white" : "bg-white/20 text-white"
          )}
        >
          {isError ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white">
            {isError ? "เกิดข้อผิดพลาด" : "สำเร็จ"}
          </p>
          <p className="mt-1 leading-5 text-white/90">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-white/80 transition hover:bg-white/15 hover:text-white"
          aria-label="ปิดข้อความแจ้งเตือน"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
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
  const [open, setOpen] = useState(false);
  const selectedBranchNames = branches
    .filter((branch) => selected.includes(branch.key))
    .map((branch) => branch.name);
  const label = selected.includes("*")
    ? "ทุกกิจการ"
    : selectedBranchNames.length === 1
      ? selectedBranchNames[0]
      : selectedBranchNames.length > 1
        ? `เลือกแล้ว ${selectedBranchNames.length} กิจการ`
        : "เลือกกิจการ";

  return (
    <div className="relative min-w-[260px]">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-left text-sm outline-none transition focus:ring-2 focus:ring-[hsl(var(--ring))]",
          disabled && "cursor-not-allowed opacity-80"
        )}
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition", open && "rotate-180")} />
      </button>

      {open && !disabled && (
        <div className="absolute left-0 top-full z-50 mt-2 w-full min-w-[320px] overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--popover))] shadow-xl">
          <div className="max-h-72 overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => onToggle("*")}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition hover:bg-[hsl(var(--muted))]"
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  selected.includes("*") ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-white" : "border-[hsl(var(--border))]"
                )}
              >
                {selected.includes("*") && <Check className="h-3 w-3" />}
              </span>
              <span className="font-semibold">ทุกกิจการ</span>
            </button>

            <div className="my-2 h-px bg-[hsl(var(--border))]" />

            {branches.map((branch) => {
              const checked = selected.includes(branch.key);
              const branchDisabled = selected.includes("*");

              return (
                <button
                  key={branch.key}
                  type="button"
                  disabled={branchDisabled}
                  onClick={() => onToggle(branch.key)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition hover:bg-[hsl(var(--muted))]",
                    branchDisabled && "cursor-not-allowed opacity-50"
                  )}
                  title={branch.name}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      checked ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-white" : "border-[hsl(var(--border))]"
                    )}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{branch.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


function UserRow({
  user,
  avatarClassName,
  branches,
  saving,
  deleting,
  onSave,
  onDelete,
  toggleBranch,
}: {
  user: ManagedUser;
  avatarClassName: string;
  branches: BranchInfo[];
  saving: boolean;
  deleting: boolean;
  onSave: (user: ManagedUser, patch: Partial<ManagedUser>) => Promise<boolean>;
  onDelete: (user: ManagedUser) => Promise<void>;
  toggleBranch: (current: string[], branchKey: string) => string[];
}) {
  const [draft, setDraft] = useState(user);
  const [editing, setEditing] = useState(false);

  const isAdmin = draft.role === "admin";
  const branchLabel = getBranchLabel(user, branches);

  async function saveDraft() {
    const saved = await onSave(user, draft);
    if (saved) {
      setEditing(false);
    }
  }

  return (
    <tr className={cn("align-top transition", editing && "bg-[hsl(var(--muted))]/20")}>
      <td className="px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold", avatarClassName)}>
            {getInitials(user)}
          </div>
          {editing ? (
            <div className="grid min-w-[260px] max-w-[360px] flex-1 gap-2">
              <input
                type="text"
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Name"
                className="h-9 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              />
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
                <input
                  type="email"
                  value={draft.email}
                  onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                  placeholder="email@example.com"
                  className="h-9 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                />
              </div>
            </div>
          ) : (
            <div className="min-w-0 max-w-[360px]">
              <p className="truncate font-semibold text-[hsl(var(--foreground))]" title={user.name || user.email}>
                {user.name || user.email.split("@")[0]}
              </p>
              <p className="truncate text-xs text-[hsl(var(--muted-foreground))]" title={user.email}>
                {user.email}
              </p>
            </div>
          )}
        </div>
      </td>
      <td className="px-4 py-4">
        {editing ? (
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
        ) : (
          <span className="inline-flex rounded-full bg-[hsl(var(--muted))] px-2.5 py-1 text-xs font-semibold capitalize text-[hsl(var(--foreground))]">
            {user.role}
          </span>
        )}
      </td>
      <td className="px-4 py-4">
        {editing ? (
          <div className="inline-flex items-center gap-3 text-sm">
            <Switch
              checked={draft.enabled}
              disabled={saving || deleting}
              onCheckedChange={(checked) => setDraft((current) => ({ ...current, enabled: checked }))}
              aria-label="เปลี่ยนสถานะผู้ใช้"
            />
            <span>{draft.enabled ? "Enabled" : "Disabled"}</span>
          </div>
        ) : (
          <span className="inline-flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
            <span className={cn("h-2.5 w-2.5 rounded-full", user.enabled ? "bg-emerald-500" : "bg-slate-300")} />
            {user.enabled ? "Enabled" : "Disabled"}
          </span>
        )}
      </td>
      <td className="px-4 py-4">
        {editing ? (
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
        ) : (
          <p className="max-w-[280px] truncate text-sm text-[hsl(var(--foreground))]" title={branchLabel}>
            {branchLabel}
          </p>
        )}
      </td>
      <td className="px-4 py-4">
        <div className="flex justify-end gap-2">
          {editing ? (
            <>
              <TooltipButton label="บันทึก" disabled={saving || deleting} onClick={saveDraft} className="text-emerald-700 hover:bg-emerald-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </TooltipButton>
              <TooltipButton
                label="ยกเลิก"
                disabled={saving || deleting}
                onClick={() => {
                  setDraft(user);
                  setEditing(false);
                }}
              >
                <X className="h-4 w-4" />
              </TooltipButton>
            </>
          ) : (
            <TooltipButton label="แก้ไข" disabled={saving || deleting} onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
            </TooltipButton>
          )}
          <TooltipButton label="ลบ" disabled={saving || deleting} onClick={() => onDelete(user)} className="text-rose-600 hover:bg-rose-50">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </TooltipButton>
        </div>
      </td>
    </tr>
  );
}

function TooltipButton({
  label,
  children,
  disabled,
  onClick,
  className,
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-label={label}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold transition hover:bg-[hsl(var(--accent))] disabled:opacity-60",
          className
        )}
      >
        {children}
      </button>
      <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
        {label}
      </span>
    </div>
  );
}
