import { authDbClient } from '@/lib/auth-db';
import { getBranchDailySummaries, getDashboardAlerts, getDashboardKPIs } from '@/lib/data/dashboard';
import type { Alert } from '@/lib/data/dashboard';
import type { BranchDailySummary } from '@/lib/data/dashboard';

type NotifyType = 'incident' | 'daily';

interface TelegramSendResult {
  ok: boolean;
  description?: string;
}

export interface NotificationDispatchResult {
  type: NotifyType;
  sent: number;
  skipped: number;
  checked: number;
  at: string;
}

const DEFAULT_TIMEZONE = 'Asia/Bangkok';
const DEFAULT_DASHBOARD_URL = 'https://seaandhill-dashboard.vercel.app/';
const INCIDENT_BATCH_LIMIT = 5;
let notificationLogReady: Promise<void> | null = null;

function getNotifyTimezone() {
  const timezone = process.env.NOTIFY_TIMEZONE?.trim();
  return timezone && timezone.length > 0 ? timezone : DEFAULT_TIMEZONE;
}

function getDashboardUrl() {
  return process.env.DASHBOARD_URL || DEFAULT_DASHBOARD_URL;
}

function getDedupeWindowMinutes() {
  const rawValue = process.env.ALERT_DEDUPE_WINDOW_MINUTES;
  const parsed = Number(rawValue);
  if (!rawValue || Number.isNaN(parsed) || parsed <= 0) return 30;
  return parsed;
}

function getConfiguredBranches() {
  const rawValue = process.env.NOTIFY_BRANCHES ?? process.env.TELEGRAM_BRANCH_FILTER ?? '';
  const normalized = rawValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (normalized.length === 0 || normalized.includes('ALL')) {
    return undefined;
  }

  return normalized;
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function severityLabel(alert: Alert) {
  const level = alert.severity || alert.type;
  if (level === 'error') return 'ERROR';
  if (level === 'warning') return 'WARNING';
  if (level === 'success') return 'SUCCESS';
  return 'INFO';
}

function severityWeight(alert: Alert) {
  const level = alert.severity || alert.type;
  if (level === 'error') return 0;
  if (level === 'warning') return 1;
  if (level === 'success') return 3;
  return 2;
}

function formatThaiDateTime(isoDate: string, timezone = getNotifyTimezone()) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(isoDate));
}

function formatThaiDateOnly(isoDate: string, timezone = getNotifyTimezone()) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoDate));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getCurrentDateInTimezone(timezone = getNotifyTimezone()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getYesterdayDateInTimezone(timezone = getNotifyTimezone()) {
  const currentDate = getCurrentDateInTimezone(timezone);
  const yesterday = new Date(`${currentDate}T00:00:00.000Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().slice(0, 10);
}

async function ensureNotificationLogTable() {
  notificationLogReady ??= (async () => {
    await authDbClient.execute(`
      CREATE TABLE IF NOT EXISTS notification_dispatch_log (
        dedupe_key TEXT PRIMARY KEY,
        sent_at TEXT NOT NULL
      )
    `);
  })();

  await notificationLogReady;
}

async function shouldSendByDedupe(dedupeKey: string, windowMinutes: number) {
  try {
    await ensureNotificationLogTable();

    const now = new Date();
    const existing = await authDbClient.execute({
      sql: 'SELECT sent_at FROM notification_dispatch_log WHERE dedupe_key = ? LIMIT 1',
      args: [dedupeKey],
    });

    const row = existing.rows[0] as Record<string, unknown> | undefined;
    const sentAt = typeof row?.sent_at === 'string' ? row.sent_at : null;
    if (sentAt) {
      const elapsedMs = now.getTime() - new Date(sentAt).getTime();
      const elapsedMinutes = elapsedMs / (1000 * 60);
      if (elapsedMinutes < windowMinutes) {
        return false;
      }
    }

    await authDbClient.execute({
      sql: `
        INSERT INTO notification_dispatch_log (dedupe_key, sent_at)
        VALUES (?, ?)
        ON CONFLICT(dedupe_key) DO UPDATE SET sent_at = excluded.sent_at
      `,
      args: [dedupeKey, now.toISOString()],
    });

    return true;
  } catch (error) {
    console.error('[notifications] dedupe unavailable, fallback to send:', error);
    return true;
  }
}

async function sendTelegramMessage(text: string): Promise<TelegramSendResult> {
  const token = requireEnv('TELEGRAM_BOT_TOKEN');
  const chatId = requireEnv('TELEGRAM_CHAT_ID');
  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Telegram API error (${response.status}): ${message}`);
  }

  const payload = (await response.json()) as TelegramSendResult;
  if (!payload.ok) {
    throw new Error(payload.description || 'Telegram API returned ok=false');
  }

  return payload;
}

function buildIncidentDedupeKey(alert: Alert) {
  const severity = alert.severity || alert.type;
  const branchKey = alert.branchSync || 'all';
  const category = alert.category || 'general';
  const countBucket = alert.count ? Math.ceil(alert.count / 5) * 5 : 0;
  const amountBucket = alert.amount ? Math.ceil(alert.amount / 50000) * 50000 : 0;
  return `incident:${severity}:${category}:${branchKey}:${countBucket}:${amountBucket}`;
}

function formatIncidentMessage(alert: Alert, sentAtIso: string) {
  const severity = severityLabel(alert);
  const icon = severity === 'ERROR' ? '🚨' : severity === 'WARNING' ? '⚠️' : 'ℹ️';
  const branchName = alert.branchName || alert.branchSync || 'ทุกสาขา';
  const dashboardUrl = getDashboardUrl();
  const messageTime = formatThaiDateTime(sentAtIso);

  return [
    `${icon} <b>[${severity}] ${escapeHtml(alert.title)}</b>`,
    `🏢 สาขา: ${escapeHtml(branchName)}`,
    `📝 ${escapeHtml(alert.message)}`,
    `⏰ เวลา: ${escapeHtml(messageTime)}`,
    `🔎 <a href="${dashboardUrl}">เปิด Dashboard</a>`,
    '#MIS #Incident',
  ].join('\n');
}

function formatDailySummaryMessage(input: {
  date: string;
  branches?: string[];
  totalSales: number;
  totalOrders: number;
  totalCustomers: number;
  avgOrderValue: number;
  branchSummaries: BranchDailySummary[];
  alerts: Alert[];
}) {
  const dashboardUrl = getDashboardUrl();
  const errors = input.alerts.filter((item) => (item.severity || item.type) === 'error').length;
  const warnings = input.alerts.filter((item) => (item.severity || item.type) === 'warning').length;

  const topItems = [...input.alerts]
    .sort((a, b) => {
      const severityDelta = severityWeight(a) - severityWeight(b);
      if (severityDelta !== 0) return severityDelta;
      return (b.count || 0) - (a.count || 0);
    })
    .slice(0, 3)
    .map((alert, index) => `${index + 1}) ${alert.title} - ${alert.message}`);

  const topSection = topItems.length > 0
    ? topItems.map((line) => escapeHtml(line)).join('\n')
    : '- ไม่มีเหตุผิดปกติสำคัญ';

  const branchRows = input.branchSummaries.length > 0
    ? input.branchSummaries
      .slice(0, 10)
      .map((branch, index) => `${index + 1}) ${branch.branchName} | ฿${formatCurrency(branch.totalSales)} | ${formatNumber(branch.totalOrders)} บิล | ${formatNumber(branch.totalCustomers)} ลูกค้า`)
      .map((line) => escapeHtml(line))
      .join('\n')
    : '- ไม่พบข้อมูลกิจการในช่วงเวลานี้';

  const scope = input.branches && input.branches.length > 0
    ? `กิจการที่เลือก: ${escapeHtml(input.branches.join(', '))}`
    : 'กิจการที่เลือก: ทุกกิจการ';

  return [
    `📊 <b>Daily MIS Summary (${escapeHtml(formatThaiDateOnly(`${input.date}T00:00:00.000Z`))})</b>`,
    `🏢 ${scope}`,
    '',
    `💰 Sales: ฿${formatCurrency(input.totalSales)}`,
    `🧾 Orders: ${formatNumber(input.totalOrders)}`,
    `👥 Customers: ${formatNumber(input.totalCustomers)}`,
    `🛒 Avg/Order: ฿${formatCurrency(input.avgOrderValue)}`,
    '',
    '🏬 <b>ยอดแยกตามกิจการ</b>',
    branchRows,
    '',
    '⚠️ <b>Alerts ตอนนี้</b>',
    `- Error: ${errors}`,
    `- Warning: ${warnings}`,
    '',
    '🔥 <b>เรื่องที่ควรตาม (Top 3)</b>',
    topSection,
    '',
    `🔗 <a href="${dashboardUrl}">เปิด Dashboard</a>`,
    '#MIS #DailyReport',
  ].join('\n');
}

export async function dispatchIncidentNotifications(): Promise<NotificationDispatchResult> {
  const windowMinutes = getDedupeWindowMinutes();
  const nowIso = new Date().toISOString();
  const branches = getConfiguredBranches();
  const alerts = await getDashboardAlerts(branches);
  const candidates = alerts
    .filter((alert) => {
      const severity = alert.severity || alert.type;
      return severity === 'warning' || severity === 'error';
    })
    .sort((a, b) => severityWeight(a) - severityWeight(b))
    .slice(0, INCIDENT_BATCH_LIMIT);

  let sent = 0;
  let skipped = 0;

  for (const alert of candidates) {
    const dedupeKey = buildIncidentDedupeKey(alert);
    const shouldSend = await shouldSendByDedupe(dedupeKey, windowMinutes);
    if (!shouldSend) {
      skipped += 1;
      continue;
    }

    await sendTelegramMessage(formatIncidentMessage(alert, nowIso));
    sent += 1;
  }

  return {
    type: 'incident',
    sent,
    skipped,
    checked: candidates.length,
    at: nowIso,
  };
}

export async function dispatchDailySummary(): Promise<NotificationDispatchResult> {
  const timezone = getNotifyTimezone();
  const date = getYesterdayDateInTimezone(timezone);
  const branches = getConfiguredBranches();
  const branchSignature = branches && branches.length > 0 ? branches.join('|') : 'ALL';
  const dedupeKey = `daily:${date}:${branchSignature}`;
  const shouldSend = await shouldSendByDedupe(dedupeKey, 24 * 60);
  const nowIso = new Date().toISOString();

  if (!shouldSend) {
    return {
      type: 'daily',
      sent: 0,
      skipped: 1,
      checked: 1,
      at: nowIso,
    };
  }

  const [kpis, alerts, branchSummaries] = await Promise.all([
    getDashboardKPIs(branches, { start: date, end: date }),
    getDashboardAlerts(branches),
    getBranchDailySummaries(branches, { start: date, end: date }),
  ]);

  await sendTelegramMessage(formatDailySummaryMessage({
    date,
    branches,
    totalSales: kpis.totalSales,
    totalOrders: kpis.totalOrders,
    totalCustomers: kpis.totalCustomers,
    avgOrderValue: kpis.avgOrderValue,
    branchSummaries,
    alerts,
  }));

  return {
    type: 'daily',
    sent: 1,
    skipped: 0,
    checked: 1,
    at: nowIso,
  };
}
