import { authDbClient } from '@/lib/auth-db';

const DEFAULT_TIMEZONE = 'Asia/Bangkok';

export interface TelegramNotificationTarget {
  chatId: string;
  enabled: boolean;
  timezone: string;
  branches?: string[];
}

let telegramConfigReady: Promise<void> | null = null;

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

export async function ensureTelegramConfigTables() {
  telegramConfigReady ??= (async () => {
    await authDbClient.execute(`
      CREATE TABLE IF NOT EXISTS telegram_chat_config (
        chat_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        timezone TEXT NOT NULL DEFAULT '${DEFAULT_TIMEZONE}',
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL
      )
    `);

    await authDbClient.execute(`
      CREATE TABLE IF NOT EXISTS telegram_chat_branch (
        chat_id TEXT NOT NULL,
        branch_sync TEXT NOT NULL,
        PRIMARY KEY (chat_id, branch_sync)
      )
    `);

    await authDbClient.execute(`
      CREATE TABLE IF NOT EXISTS telegram_chat_draft (
        chat_id TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL
      )
    `);

    await authDbClient.execute(`
      CREATE TABLE IF NOT EXISTS telegram_chat_draft_branch (
        chat_id TEXT NOT NULL,
        branch_sync TEXT NOT NULL,
        PRIMARY KEY (chat_id, branch_sync)
      )
    `);
  })();

  await telegramConfigReady;
}

export async function ensureTelegramChatConfig(chatId: string, updatedBy: string) {
  await ensureTelegramConfigTables();

  const now = new Date().toISOString();
  await authDbClient.execute({
    sql: `
      INSERT INTO telegram_chat_config (chat_id, enabled, timezone, updated_at, updated_by)
      VALUES (?, 1, ?, ?, ?)
      ON CONFLICT(chat_id) DO NOTHING
    `,
    args: [chatId, DEFAULT_TIMEZONE, now, updatedBy],
  });
}

export async function getTelegramChatTarget(chatId: string): Promise<TelegramNotificationTarget> {
  await ensureTelegramConfigTables();

  const configResult = await authDbClient.execute({
    sql: 'SELECT chat_id, enabled, timezone FROM telegram_chat_config WHERE chat_id = ? LIMIT 1',
    args: [chatId],
  });

  const configRow = configResult.rows[0] as Record<string, unknown> | undefined;
  const branchResult = await authDbClient.execute({
    sql: 'SELECT branch_sync FROM telegram_chat_branch WHERE chat_id = ? ORDER BY branch_sync',
    args: [chatId],
  });

  const branches = branchResult.rows
    .map((row) => String((row as Record<string, unknown>).branch_sync || '').trim())
    .filter(Boolean);

  return {
    chatId,
    enabled: toBoolean(configRow?.enabled, true),
    timezone: readTimezone(configRow?.timezone),
    branches: branches.length > 0 ? branches : undefined,
  };
}

export async function listTelegramNotificationTargets(): Promise<TelegramNotificationTarget[]> {
  await ensureTelegramConfigTables();

  const configResult = await authDbClient.execute(
    'SELECT chat_id, enabled, timezone FROM telegram_chat_config WHERE enabled = 1 ORDER BY chat_id'
  );

  const rows = configResult.rows as Array<Record<string, unknown>>;
  const targets: TelegramNotificationTarget[] = [];

  for (const row of rows) {
    const chatId = String(row.chat_id || '').trim();
    if (!chatId) continue;

    const branchesResult = await authDbClient.execute({
      sql: 'SELECT branch_sync FROM telegram_chat_branch WHERE chat_id = ? ORDER BY branch_sync',
      args: [chatId],
    });
    const branches = branchesResult.rows
      .map((branchRow) => String((branchRow as Record<string, unknown>).branch_sync || '').trim())
      .filter(Boolean);

    targets.push({
      chatId,
      enabled: toBoolean(row.enabled, true),
      timezone: readTimezone(row.timezone),
      branches: branches.length > 0 ? branches : undefined,
    });
  }

  return targets;
}

export async function resetTelegramChatDraft(chatId: string, updatedBy: string) {
  await ensureTelegramConfigTables();

  const current = await getTelegramChatTarget(chatId);
  const currentBranches = current.branches ?? [];
  const now = new Date().toISOString();

  await authDbClient.execute({
    sql: `
      INSERT INTO telegram_chat_draft (chat_id, updated_at, updated_by)
      VALUES (?, ?, ?)
      ON CONFLICT(chat_id) DO UPDATE SET updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `,
    args: [chatId, now, updatedBy],
  });

  await authDbClient.execute({
    sql: 'DELETE FROM telegram_chat_draft_branch WHERE chat_id = ?',
    args: [chatId],
  });

  for (const branchSync of currentBranches) {
    await authDbClient.execute({
      sql: 'INSERT INTO telegram_chat_draft_branch (chat_id, branch_sync) VALUES (?, ?)',
      args: [chatId, branchSync],
    });
  }
}

export async function getTelegramChatDraftBranches(chatId: string) {
  await ensureTelegramConfigTables();

  const draftResult = await authDbClient.execute({
    sql: 'SELECT branch_sync FROM telegram_chat_draft_branch WHERE chat_id = ? ORDER BY branch_sync',
    args: [chatId],
  });

  return draftResult.rows
    .map((row) => String((row as Record<string, unknown>).branch_sync || '').trim())
    .filter(Boolean);
}

export async function setTelegramChatDraftBranches(chatId: string, branches: string[], updatedBy: string) {
  await ensureTelegramConfigTables();
  const normalized = normalizeBranches(branches);
  const now = new Date().toISOString();

  await authDbClient.execute({
    sql: `
      INSERT INTO telegram_chat_draft (chat_id, updated_at, updated_by)
      VALUES (?, ?, ?)
      ON CONFLICT(chat_id) DO UPDATE SET updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `,
    args: [chatId, now, updatedBy],
  });

  await authDbClient.execute({
    sql: 'DELETE FROM telegram_chat_draft_branch WHERE chat_id = ?',
    args: [chatId],
  });

  for (const branchSync of normalized) {
    await authDbClient.execute({
      sql: 'INSERT INTO telegram_chat_draft_branch (chat_id, branch_sync) VALUES (?, ?)',
      args: [chatId, branchSync],
    });
  }
}

export async function applyTelegramChatDraft(chatId: string, updatedBy: string) {
  await ensureTelegramConfigTables();
  const branches = await getTelegramChatDraftBranches(chatId);
  const now = new Date().toISOString();

  await authDbClient.execute({
    sql: `
      INSERT INTO telegram_chat_config (chat_id, enabled, timezone, updated_at, updated_by)
      VALUES (?, 1, ?, ?, ?)
      ON CONFLICT(chat_id) DO UPDATE SET enabled = 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `,
    args: [chatId, DEFAULT_TIMEZONE, now, updatedBy],
  });

  await authDbClient.execute({
    sql: 'DELETE FROM telegram_chat_branch WHERE chat_id = ?',
    args: [chatId],
  });

  for (const branchSync of branches) {
    await authDbClient.execute({
      sql: 'INSERT INTO telegram_chat_branch (chat_id, branch_sync) VALUES (?, ?)',
      args: [chatId, branchSync],
    });
  }
}

export interface CarouselCacheData {
  date: string;
  branches: string[];
  kpis: {
    totalSales: number;
    totalOrders: number;
    totalCustomers: number;
    avgOrderValue: number;
  };
  branchSummaries: Array<{
    branchSync: string;
    branchName: string;
    totalSales: number;
    totalOrders: number;
    totalCustomers: number;
    avgOrderValue: number;
  }>;
  alerts: Array<{
    severity?: string;
    type?: string;
    title: string;
    message: string;
    branchSync?: string;
    branchName?: string;
    count?: number;
    amount?: number;
    category?: string;
  }>;
  profitSummaries: Array<{ branchSync: string; profit: number }>;
  profitMonthLabel: string;
}

let carouselCacheReady: Promise<void> | null = null;

async function ensureCarouselCacheTable() {
  carouselCacheReady ??= (async () => {
    await authDbClient.execute(`
      CREATE TABLE IF NOT EXISTS telegram_carousel_cache (
        chat_id TEXT NOT NULL,
        message_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (chat_id, message_id)
      )
    `);
  })();

  await carouselCacheReady;
}

export async function storeCarouselCache(
  chatId: string,
  messageId: number,
  data: CarouselCacheData,
) {
  await ensureCarouselCacheTable();
  const now = new Date().toISOString();
  await authDbClient.execute({
    sql: `
      INSERT INTO telegram_carousel_cache (chat_id, message_id, date, data_json, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(chat_id, message_id) DO UPDATE SET
        date = excluded.date,
        data_json = excluded.data_json,
        created_at = excluded.created_at
    `,
    args: [chatId, messageId, data.date, JSON.stringify(data), now],
  });
}

export async function getCarouselCache(
  chatId: string,
  messageId: number,
): Promise<CarouselCacheData | null> {
  await ensureCarouselCacheTable();
  const result = await authDbClient.execute({
    sql: 'SELECT data_json FROM telegram_carousel_cache WHERE chat_id = ? AND message_id = ? LIMIT 1',
    args: [chatId, messageId],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row || typeof row.data_json !== 'string') return null;

  try {
    return JSON.parse(row.data_json) as CarouselCacheData;
  } catch {
    return null;
  }
}
