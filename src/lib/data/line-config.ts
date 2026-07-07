import { authDbClient } from '@/lib/auth-db';

const DEFAULT_TIMEZONE = 'Asia/Bangkok';

export interface LineNotificationTarget {
  userId: string;
  enabled: boolean;
  timezone: string;
  branches?: string[];
}

let lineConfigReady: Promise<void> | null = null;

function toBoolean(value: unknown, fallback = true) {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  return fallback;
}

function readTimezone(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return DEFAULT_TIMEZONE;
}

function normalizeBranches(branches: string[]) {
  const cleaned = [...new Set(branches.map((item) => item.trim()).filter(Boolean))];
  return cleaned;
}

async function ensureLineConfigTables() {
  lineConfigReady ??= (async () => {
    await authDbClient.execute(`
      CREATE TABLE IF NOT EXISTS line_user_config (
        user_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        timezone TEXT NOT NULL DEFAULT '${DEFAULT_TIMEZONE}',
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL
      )
    `);

    await authDbClient.execute(`
      CREATE TABLE IF NOT EXISTS line_user_branch (
        user_id TEXT NOT NULL,
        branch_sync TEXT NOT NULL,
        PRIMARY KEY (user_id, branch_sync)
      )
    `);

    await authDbClient.execute(`
      CREATE TABLE IF NOT EXISTS line_user_draft (
        user_id TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL
      )
    `);

    await authDbClient.execute(`
      CREATE TABLE IF NOT EXISTS line_user_draft_branch (
        user_id TEXT NOT NULL,
        branch_sync TEXT NOT NULL,
        PRIMARY KEY (user_id, branch_sync)
      )
    `);
  })();

  await lineConfigReady;
}

export async function ensureLineUserConfig(userId: string, updatedBy: string) {
  await ensureLineConfigTables();

  const now = new Date().toISOString();
  await authDbClient.execute({
    sql: `
      INSERT INTO line_user_config (user_id, enabled, timezone, updated_at, updated_by)
      VALUES (?, 1, ?, ?, ?)
      ON CONFLICT(user_id) DO NOTHING
    `,
    args: [userId, DEFAULT_TIMEZONE, now, updatedBy],
  });
}

export async function getLineUserTarget(userId: string): Promise<LineNotificationTarget> {
  await ensureLineConfigTables();

  const configResult = await authDbClient.execute({
    sql: 'SELECT user_id, enabled, timezone FROM line_user_config WHERE user_id = ? LIMIT 1',
    args: [userId],
  });

  const configRow = configResult.rows[0] as Record<string, unknown> | undefined;
  const branchResult = await authDbClient.execute({
    sql: 'SELECT branch_sync FROM line_user_branch WHERE user_id = ? ORDER BY branch_sync',
    args: [userId],
  });

  const branches = branchResult.rows
    .map((row) => String((row as Record<string, unknown>).branch_sync || '').trim())
    .filter(Boolean);

  return {
    userId,
    enabled: toBoolean(configRow?.enabled, true),
    timezone: readTimezone(configRow?.timezone),
    branches: branches.length > 0 ? branches : undefined,
  };
}

export async function listLineNotificationTargets(): Promise<LineNotificationTarget[]> {
  await ensureLineConfigTables();

  const configResult = await authDbClient.execute(
    'SELECT user_id, enabled, timezone FROM line_user_config WHERE enabled = 1 ORDER BY user_id'
  );

  const rows = configResult.rows as Array<Record<string, unknown>>;
  const targets: LineNotificationTarget[] = [];

  for (const row of rows) {
    const userId = String(row.user_id || '').trim();
    if (!userId) continue;

    const branchesResult = await authDbClient.execute({
      sql: 'SELECT branch_sync FROM line_user_branch WHERE user_id = ? ORDER BY branch_sync',
      args: [userId],
    });
    const branches = branchesResult.rows
      .map((branchRow) => String((branchRow as Record<string, unknown>).branch_sync || '').trim())
      .filter(Boolean);

    targets.push({
      userId,
      enabled: toBoolean(row.enabled, true),
      timezone: readTimezone(row.timezone),
      branches: branches.length > 0 ? branches : undefined,
    });
  }

  return targets;
}

export async function resetLineUserDraft(userId: string, updatedBy: string) {
  await ensureLineConfigTables();

  const current = await getLineUserTarget(userId);
  const currentBranches = current.branches ?? [];
  const now = new Date().toISOString();

  await authDbClient.execute({
    sql: `
      INSERT INTO line_user_draft (user_id, updated_at, updated_by)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `,
    args: [userId, now, updatedBy],
  });

  await authDbClient.execute({
    sql: 'DELETE FROM line_user_draft_branch WHERE user_id = ?',
    args: [userId],
  });

  for (const branchSync of currentBranches) {
    await authDbClient.execute({
      sql: 'INSERT INTO line_user_draft_branch (user_id, branch_sync) VALUES (?, ?)',
      args: [userId, branchSync],
    });
  }
}

export async function getLineUserDraftBranches(userId: string) {
  await ensureLineConfigTables();

  const draftResult = await authDbClient.execute({
    sql: 'SELECT branch_sync FROM line_user_draft_branch WHERE user_id = ? ORDER BY branch_sync',
    args: [userId],
  });

  return draftResult.rows
    .map((row) => String((row as Record<string, unknown>).branch_sync || '').trim())
    .filter(Boolean);
}

export async function setLineUserDraftBranches(userId: string, branches: string[], updatedBy: string) {
  await ensureLineConfigTables();
  const normalized = normalizeBranches(branches);
  const now = new Date().toISOString();

  await authDbClient.execute({
    sql: `
      INSERT INTO line_user_draft (user_id, updated_at, updated_by)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `,
    args: [userId, now, updatedBy],
  });

  await authDbClient.execute({
    sql: 'DELETE FROM line_user_draft_branch WHERE user_id = ?',
    args: [userId],
  });

  for (const branchSync of normalized) {
    await authDbClient.execute({
      sql: 'INSERT INTO line_user_draft_branch (user_id, branch_sync) VALUES (?, ?)',
      args: [userId, branchSync],
    });
  }
}

export async function applyLineUserDraft(userId: string, updatedBy: string) {
  await ensureLineConfigTables();
  const branches = await getLineUserDraftBranches(userId);
  const now = new Date().toISOString();

  await authDbClient.execute({
    sql: `
      INSERT INTO line_user_config (user_id, enabled, timezone, updated_at, updated_by)
      VALUES (?, 1, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET enabled = 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `,
    args: [userId, DEFAULT_TIMEZONE, now, updatedBy],
  });

  await authDbClient.execute({
    sql: 'DELETE FROM line_user_branch WHERE user_id = ?',
    args: [userId],
  });

  for (const branchSync of branches) {
    await authDbClient.execute({
      sql: 'INSERT INTO line_user_branch (user_id, branch_sync) VALUES (?, ?)',
      args: [userId, branchSync],
    });
  }
}
