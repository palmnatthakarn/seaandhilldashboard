import { authDbClient, ensureAuthUserPolicyColumns } from "@/lib/auth-db";

function parseEmailList(value?: string) {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

const allowedEmailSet = new Set(parseEmailList(process.env.ALLOWED_EMAILS));
const adminEmailSet = new Set(parseEmailList(process.env.ADMIN_EMAILS));

export function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? "";
}

export function isBootstrapAdminEmail(email?: string | null) {
  const normalized = normalizeEmail(email);
  return Boolean(normalized && adminEmailSet.has(normalized));
}

export async function isEmailAllowed(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (allowedEmailSet.has(normalized) || adminEmailSet.has(normalized)) return true;

  await ensureAuthUserPolicyColumns();

  const result = await authDbClient.execute({
    sql: 'SELECT enabled FROM "user" WHERE email = ? LIMIT 1',
    args: [normalized],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  return Boolean(row && (row.enabled === true || row.enabled === 1 || row.enabled === "1"));
}
