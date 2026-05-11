import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { authDbClient, ensureAuthUserPolicyColumns } from "@/lib/auth-db";

export type AppRole = "admin" | "user";

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  enabled: boolean;
  allowed_branches: string[];
  createdAt?: string;
  updatedAt?: string;
}

function parseEmailList(value?: string) {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

const legacyAllowedEmails = new Set(parseEmailList(process.env.ALLOWED_EMAILS));
const adminEmails = new Set(parseEmailList(process.env.ADMIN_EMAILS));

export function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? "";
}

export function isBootstrapAdmin(email?: string | null) {
  const normalized = normalizeEmail(email);
  return Boolean(normalized && adminEmails.has(normalized));
}

export function isAdminUser(user?: { email?: string | null; role?: string | null } | null) {
  return Boolean(user && (isBootstrapAdmin(user.email) || user.role === "admin"));
}

export function parseBranches(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((branch): branch is string => typeof branch === "string" && branch.length > 0);
  }

  if (typeof value !== "string" || value.trim() === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((branch): branch is string => typeof branch === "string" && branch.length > 0)
      : [];
  } catch {
    return [];
  }
}

export function normalizeBranches(branches: string[]) {
  const cleaned = [...new Set(branches.map((branch) => branch.trim()).filter(Boolean))];
  return cleaned.includes("*") ? ["*"] : cleaned;
}

function readString(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : "";
}

function rowToManagedUser(row: Record<string, unknown>): ManagedUser {
  const email = readString(row, "email");
  const role = row.role === "admin" || isBootstrapAdmin(email) ? "admin" : "user";
  const enabled = isBootstrapAdmin(email) || row.enabled === true || row.enabled === 1 || row.enabled === "1";

  return {
    id: readString(row, "id"),
    name: readString(row, "name") || email.split("@")[0],
    email,
    role,
    enabled,
    allowed_branches: isBootstrapAdmin(email) ? ["*"] : normalizeBranches(parseBranches(row.allowed_branches)),
    createdAt: readString(row, "createdAt"),
    updatedAt: readString(row, "updatedAt"),
  };
}

export async function findManagedUserByEmail(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  await ensureAuthUserPolicyColumns();

  const result = await authDbClient.execute({
    sql: 'SELECT * FROM "user" WHERE email = ? LIMIT 1',
    args: [normalized],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? rowToManagedUser(row) : null;
}

export async function isEmailAllowed(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (isBootstrapAdmin(normalized) || legacyAllowedEmails.has(normalized)) return true;

  const user = await findManagedUserByEmail(normalized);
  return Boolean(user?.enabled);
}

export async function getCurrentSessionUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user ?? null;
}

export async function requireAdminUser() {
  const user = await getCurrentSessionUser();

  if (!user || !isAdminUser(user)) {
    return null;
  }

  return user;
}

export async function getCurrentBranchPolicy() {
  const user = await getCurrentSessionUser();
  if (!user) {
    return { user: null, isAdmin: false, branches: [] as string[] };
  }

  if (isAdminUser(user)) {
    return { user, isAdmin: true, branches: ["*"] };
  }

  const persistedUser = await findManagedUserByEmail(user.email);
  const branches = normalizeBranches(parseBranches(persistedUser?.allowed_branches ?? (user as { allowed_branches?: unknown }).allowed_branches));
  return { user, isAdmin: false, branches };
}

export async function filterBranchesForCurrentUser(requestedBranches: string[]) {
  const policy = await getCurrentBranchPolicy();
  const requested = normalizeBranches(requestedBranches.length > 0 ? requestedBranches : ["ALL"]);

  if (!policy.user) {
    throw new Error("Unauthorized");
  }

  if (policy.isAdmin || policy.branches.includes("*")) {
    return requested;
  }

  if (policy.branches.length === 0) {
    return ["__NO_ACCESS__"];
  }

  if (requested.includes("ALL")) {
    return policy.branches;
  }

  const allowed = requested.filter((branch) => policy.branches.includes(branch));
  return allowed.length > 0 ? allowed : ["__NO_ACCESS__"];
}

export function parseRequestedBranches(searchParams: URLSearchParams) {
  const branches = searchParams.getAll("branch");
  if (branches.length === 0) return ["ALL"];
  if (branches.length === 1 && branches[0].includes(",")) {
    return branches[0].split(",");
  }
  return branches;
}
