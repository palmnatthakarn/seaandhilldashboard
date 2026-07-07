import { BRANCH_SYNC_MAP, resolveBranchName } from '@/lib/branch-names';
import { authDbClient } from '@/lib/auth-db';
import { getBranchDailySummaries, getDashboardAlerts, getDashboardKPIs } from '@/lib/data/dashboard';
import type { Alert } from '@/lib/data/dashboard';
import type { BranchDailySummary } from '@/lib/data/dashboard';
import {
  ensureTelegramChatConfig,
  listTelegramNotificationTargets,
  storeCarouselCache,
  type TelegramNotificationTarget,
} from '@/lib/data/telegram-config';
import { sendTelegramMessage as sendTelegramText, type TelegramInlineKeyboardMarkup } from '@/lib/telegram';
import { sendLineMessage, type LineMessagePayload } from '@/lib/line';
import {
  ensureLineUserConfig,
  listLineNotificationTargets,
  type LineNotificationTarget,
} from '@/lib/data/line-config';
import { getBranchProfitLossSummaries, type BranchProfitLossSummary } from '@/lib/data/accounting';

type NotifyType = 'incident' | 'daily';

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

async function sendTelegramMessage(chatId: string, text: string, replyMarkup?: TelegramInlineKeyboardMarkup) {
  return sendTelegramText({
    chatId,
    text,
    parseMode: 'HTML',
    replyMarkup,
  });
}

function buildIncidentDedupeKey(alert: Alert) {
  const severity = alert.severity || alert.type;
  const branchKey = alert.branchSync || 'all';
  const category = alert.category || 'general';
  const countBucket = alert.count ? Math.ceil(alert.count / 5) * 5 : 0;
  const amountBucket = alert.amount ? Math.ceil(alert.amount / 50000) * 50000 : 0;
  return `incident:${severity}:${category}:${branchKey}:${countBucket}:${amountBucket}`;
}

function buildIncidentDedupeKeyForTarget(chatId: string, alert: Alert) {
  return `${chatId}:${buildIncidentDedupeKey(alert)}`;
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
  profitSummaries: BranchProfitLossSummary[];
  profitMonthLabel: string;
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

  const isSingleBranch = input.branches && input.branches.length === 1;

  const scope = isSingleBranch
    ? `กิจการที่เลือก: ${escapeHtml(resolveBranchName(input.branches![0]))}`
    : input.branches && input.branches.length > 0
      ? `กิจการที่เลือก: ${escapeHtml(input.branches.join(', '))}`
      : 'กิจการที่เลือก: ทุกกิจการ';

  const profitRows = input.profitSummaries.length > 0
    ? [...input.profitSummaries]
      .sort((a, b) => b.profit - a.profit)
      .map((p, index) => `${index + 1}) ${resolveBranchName(p.branchSync)} | ${p.profit < 0 ? '-' : '+'}฿${formatCurrency(Math.abs(p.profit))}${p.profit < 0 ? ' (ขาดทุน)' : ''}`)
      .map((line) => escapeHtml(line))
      .join('\n')
    : '- ไม่พบข้อมูลในช่วงเวลานี้';

  const summaryLines = [
    `📊 <b>Daily MIS Summary (${escapeHtml(formatThaiDateOnly(`${input.date}T00:00:00.000Z`))})</b>`,
    `🏢 ${scope}`,
    '',
    `💰 Sales: ฿${formatCurrency(input.totalSales)}`,
    `🧾 Orders: ${formatNumber(input.totalOrders)}`,
    `👥 Customers: ${formatNumber(input.totalCustomers)}`,
    `🛒 Avg/Order: ฿${formatCurrency(input.avgOrderValue)}`,
  ];

  if (!isSingleBranch) {
    summaryLines.push(
      '',
      '🏬 <b>ยอดแยกตามกิจการ</b>',
      branchRows,
      '',
      `📊 <b>กำไร/ขาดทุนรายกิจการ (${escapeHtml(input.profitMonthLabel)})</b>`,
      profitRows,
    );
  }

  summaryLines.push('',
    '⚠️ <b>Alerts ตอนนี้</b>',
    `- Error: ${errors}`,
    `- Warning: ${warnings}`,
    '',
    '🔥 <b>เรื่องที่ควรตาม (Top 3)</b>',
    topSection,
    '',
    `🔗 <a href="${dashboardUrl}">เปิด Dashboard</a>`,
    '#MIS #DailyReport',
  );

  return summaryLines.join('\n');
}

function buildBarRows(
  items: Array<{ branchSync: string; branchName: string; value: number; detail?: string }>,
  { signedColor = false }: { signedColor?: boolean } = {},
) {
  const maxAbs = Math.max(1, ...items.map((item) => Math.abs(item.value)));

  return items.map((item, index) => {
    const pct = Math.max(3, Math.round((Math.abs(item.value) / maxAbs) * 100));
    const isNegative = signedColor && item.value < 0;
    const barColor = isNegative ? '#FF3B30' : '#00B900';
    const label = signedColor
      ? `${isNegative ? '-' : '+'}฿${formatCurrency(Math.abs(item.value))}${isNegative ? ' (ขาดทุน)' : ''}`
      : `฿${formatCurrency(item.value)}`;

    return {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      margin: index === 0 ? 'none' : 'lg',
      contents: [
        { type: 'text', text: item.branchName, size: 'xs', color: '#555555', wrap: true },
        {
          type: 'box',
          layout: 'horizontal',
          height: '10px',
          backgroundColor: '#EEEEEE',
          cornerRadius: '4px',
          contents: [
            { type: 'box', layout: 'vertical', width: `${pct}%`, backgroundColor: barColor, cornerRadius: '4px', contents: [] },
          ],
        },
        { type: 'text', text: label, size: 'xs', weight: 'bold', align: 'end', color: isNegative ? '#FF3B30' : '#000000' },
        ...(item.detail ? [{ type: 'text', text: item.detail, size: 'xxs', color: '#999999', align: 'end', wrap: true }] : []),
      ],
    };
  });
}

function buildBarChartBubble(
  title: string,
  subtitle: string,
  items: Array<{ branchSync: string; branchName: string; value: number; detail?: string }>,
  opts?: { signedColor?: boolean },
) {
  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: title, weight: 'bold', size: 'md', wrap: true },
        { type: 'text', text: subtitle, size: 'xs', color: '#888888', wrap: true },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: items.length > 0
        ? buildBarRows(items, opts)
        : [{ type: 'text', text: 'ไม่พบข้อมูลในช่วงเวลานี้', size: 'sm', color: '#888888' }],
    },
  };
}

function formatThaiMonthLabel(isoDate: string, timezone = getNotifyTimezone()) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: timezone,
    year: 'numeric',
    month: 'long',
  }).format(new Date(`${isoDate}T00:00:00.000Z`));
}

function buildSalesProfitCarousel(
  salesDate: string,
  profitPeriod: { start: string; end: string },
  branchSummaries: BranchDailySummary[],
  profitSummaries: BranchProfitLossSummary[],
): LineMessagePayload {
  const salesDateLabel = formatThaiDateOnly(`${salesDate}T00:00:00.000Z`);
  const profitMonthLabel = formatThaiMonthLabel(profitPeriod.start);

  const salesItems = [...branchSummaries]
    .sort((a, b) => b.totalSales - a.totalSales)
    .map((b) => ({
      branchSync: b.branchSync,
      branchName: b.branchName,
      value: b.totalSales,
      detail: `🧾 ${formatNumber(b.totalOrders)} บิล | 👥 ${formatNumber(b.totalCustomers)} ลูกค้า | 🛒 ฿${formatCurrency(b.avgOrderValue)}/บิล`,
    }));

  const profitItems = [...profitSummaries]
    .sort((a, b) => b.profit - a.profit)
    .map((p) => ({ branchSync: p.branchSync, branchName: resolveBranchName(p.branchSync), value: p.profit }));

  return {
    type: 'flex',
    altText: `Daily MIS Summary (${salesDateLabel})`,
    contents: {
      type: 'carousel',
      contents: [
        buildBarChartBubble('💰 ยอดขายรายกิจการ', salesDateLabel, salesItems),
        buildBarChartBubble('📊 กำไร/ขาดทุนรายกิจการ', `เดือน${profitMonthLabel}`, profitItems, { signedColor: true }),
      ],
    },
  };
}

function formatBranchCard(
  summary: BranchDailySummary,
  date: string,
  branchSync: string,
  alerts: Alert[],
  profit: number | undefined,
  profitMonthLabel: string,
) {
  const dashboardUrl = getDashboardUrl();
  const branchAlerts = alerts.filter(
    (a) => !a.branchSync || a.branchSync === branchSync,
  );
  const errors = branchAlerts.filter((a) => (a.severity || a.type) === 'error').length;
  const warnings = branchAlerts.filter((a) => (a.severity || a.type) === 'warning').length;

  const topItems = [...branchAlerts]
    .sort((a, b) => {
      const severityDelta = severityWeight(a) - severityWeight(b);
      if (severityDelta !== 0) return severityDelta;
      return (b.count || 0) - (a.count || 0);
    })
    .slice(0, 2)
    .map((alert, index) => `${index + 1}) ${alert.title} - ${alert.message}`);

  const topSection = topItems.length > 0
    ? topItems.map((line) => escapeHtml(line)).join('\n')
    : '- ไม่มีเหตุผิดปกติ';

  return [
    `📊 <b>Daily MIS Summary (${escapeHtml(formatThaiDateOnly(`${date}T00:00:00.000Z`))})</b>`,
    `🏢 ${escapeHtml(summary.branchName)}`,
    '',
    `💰 ยอดขาย: ฿${formatCurrency(summary.totalSales)}`,
    `🧾 ออเดอร์: ${formatNumber(summary.totalOrders)} บิล`,
    `👥 ลูกค้า: ${formatNumber(summary.totalCustomers)} คน`,
    `🛒 Avg/Order: ฿${formatCurrency(summary.avgOrderValue)}`,
    '',
    `📊 กำไร/ขาดทุน (${escapeHtml(profitMonthLabel)}): ${profit === undefined ? 'ไม่พบข้อมูล' : `${profit < 0 ? '-' : '+'}฿${formatCurrency(Math.abs(profit))}${profit < 0 ? ' (ขาดทุน)' : ''}`}`,
    '',
    '⚠️ <b>Alerts</b>',
    `- Error: ${errors}`,
    `- Warning: ${warnings}`,
    '',
    '🔥 <b>Top Alert</b>',
    topSection,
    '',
    `🔗 <a href="${dashboardUrl}">เปิด Dashboard</a>`,
    '#MIS #DailyReport',
  ].join('\n');
}

function buildCarouselKeyboard(
  branchSummaries: BranchDailySummary[],
  activeSync: string,
): TelegramInlineKeyboardMarkup {
  const rows: TelegramInlineKeyboardMarkup['inline_keyboard'] = [];
  const row: TelegramInlineKeyboardMarkup['inline_keyboard'][number] = [];

  for (let i = 0; i < branchSummaries.length; i++) {
    const s = branchSummaries[i];
    const isActive = s.branchSync === activeSync;
    const shortName = BRANCH_SYNC_MAP[s.branchSync]?.split(' ').slice(0, 2).join(' ') || s.branchSync;
    const label = isActive ? `📌 ${shortName}` : shortName;

    row.push({
      text: label,
      callback_data: `d:${s.branchSync}`,
    });

    if (row.length === 3 || i === branchSummaries.length - 1) {
      rows.push([...row]);
      row.length = 0;
    }
  }

  rows.push([{ text: activeSync === 'ov' ? '📌 ภาพรวม' : '📊 ภาพรวม', callback_data: 'd:ov' }]);

  return { inline_keyboard: rows };
}

function getLegacyLineTargetFromEnv(): LineNotificationTarget | null {
  const userId = process.env.NOTIFY_LINE_USER_ID?.trim();
  if (!userId || !process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim()) return null;

  return {
    userId,
    enabled: true,
    timezone: getNotifyTimezone(),
    branches: getConfiguredBranches(),
  };
}

async function getLineNotificationTargets(): Promise<LineNotificationTarget[]> {
  const legacyTarget = getLegacyLineTargetFromEnv();
  if (legacyTarget) {
    await ensureLineUserConfig(legacyTarget.userId, 'system');
  }

  const dbTargets = await listLineNotificationTargets();
  if (dbTargets.length > 0) {
    return dbTargets;
  }

  return legacyTarget ? [legacyTarget] : [];
}

function getLegacyTargetFromEnv(): TelegramNotificationTarget | null {
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!chatId) return null;

  return {
    chatId,
    enabled: true,
    timezone: getNotifyTimezone(),
    branches: getConfiguredBranches(),
  };
}

async function getNotificationTargets(): Promise<TelegramNotificationTarget[]> {
  const legacyTarget = getLegacyTargetFromEnv();
  if (legacyTarget) {
    await ensureTelegramChatConfig(legacyTarget.chatId, 'system');
  }

  const dbTargets = await listTelegramNotificationTargets();
  if (dbTargets.length > 0) {
    return dbTargets;
  }

  return legacyTarget ? [legacyTarget] : [];
}

export async function dispatchIncidentNotifications(): Promise<NotificationDispatchResult> {
  const windowMinutes = getDedupeWindowMinutes();
  const nowIso = new Date().toISOString();
  const targets = await getNotificationTargets();

  let sent = 0;
  let skipped = 0;
  let checked = 0;

  for (const target of targets) {
    if (!target.enabled) continue;
    const alerts = await getDashboardAlerts(target.branches);
    const candidates = alerts
      .filter((alert) => {
        const severity = alert.severity || alert.type;
        return severity === 'warning' || severity === 'error';
      })
      .sort((a, b) => severityWeight(a) - severityWeight(b))
      .slice(0, INCIDENT_BATCH_LIMIT);

    checked += candidates.length;

    for (const alert of candidates) {
      const dedupeKey = buildIncidentDedupeKeyForTarget(target.chatId, alert);
      const shouldSend = await shouldSendByDedupe(dedupeKey, windowMinutes);
      if (!shouldSend) {
        skipped += 1;
        continue;
      }

      await sendTelegramMessage(target.chatId, formatIncidentMessage(alert, nowIso));
      sent += 1;
    }
  }

  return {
    type: 'incident',
    sent,
    skipped,
    checked,
    at: nowIso,
  };
}

export async function dispatchDailySummary(): Promise<NotificationDispatchResult> {
  const nowIso = new Date().toISOString();
  const targets = await getNotificationTargets();

  let sent = 0;
  let skipped = 0;
  let checked = 0;

  for (const target of targets) {
    if (!target.enabled) continue;
    const timezone = target.timezone || getNotifyTimezone();
    const date = getYesterdayDateInTimezone(timezone);
    const branches = target.branches;
    const branchSignature = branches && branches.length > 0 ? branches.join('|') : 'ALL';
    const dedupeKey = `daily:${target.chatId}:${date}:${branchSignature}`;
    const shouldSend = await shouldSendByDedupe(dedupeKey, 24 * 60);
    checked += 1;

    if (!shouldSend) {
      skipped += 1;
      continue;
    }

    const monthToDate = { start: `${date.slice(0, 7)}-01`, end: date };
    const [kpis, alerts, branchSummaries, profitSummaries] = await Promise.all([
      getDashboardKPIs(branches, { start: date, end: date }),
      getDashboardAlerts(branches),
      getBranchDailySummaries(branches, { start: date, end: date }),
      getBranchProfitLossSummaries(monthToDate, branches),
    ]);
    const profitMonthLabel = `เดือน${formatThaiMonthLabel(monthToDate.start)}`;

    const overviewCard = formatDailySummaryMessage({
      date,
      branches,
      totalSales: kpis.totalSales,
      totalOrders: kpis.totalOrders,
      totalCustomers: kpis.totalCustomers,
      avgOrderValue: kpis.avgOrderValue,
      branchSummaries,
      alerts,
      profitSummaries,
      profitMonthLabel,
    });

    const activeSync = branchSummaries.length > 0 ? branchSummaries[0].branchSync : 'ov';
    const firstCard = activeSync === 'ov'
      ? overviewCard
      : formatBranchCard(
          branchSummaries.find((s) => s.branchSync === activeSync)!,
          date,
          activeSync,
          alerts,
          profitSummaries.find((p) => p.branchSync === activeSync)?.profit,
          profitMonthLabel,
        );

    const messageId = await sendTelegramMessage(
      target.chatId,
      firstCard,
      buildCarouselKeyboard(branchSummaries, activeSync),
    );

    if (messageId && branches) {
      await storeCarouselCache(target.chatId, messageId, {
        date,
        branches,
        kpis: {
          totalSales: kpis.totalSales,
          totalOrders: kpis.totalOrders,
          totalCustomers: kpis.totalCustomers,
          avgOrderValue: kpis.avgOrderValue,
        },
        branchSummaries: branchSummaries.map((s) => ({
          branchSync: s.branchSync,
          branchName: s.branchName,
          totalSales: s.totalSales,
          totalOrders: s.totalOrders,
          totalCustomers: s.totalCustomers,
          avgOrderValue: s.avgOrderValue,
        })),
        alerts: alerts.map((a) => ({
          severity: a.severity,
          type: a.type,
          title: a.title,
          message: a.message,
          branchSync: a.branchSync,
          branchName: a.branchName,
          count: a.count,
          amount: a.amount,
          category: a.category,
        })),
        profitSummaries: profitSummaries.map((p) => ({ branchSync: p.branchSync, profit: p.profit })),
        profitMonthLabel,
      });
    }

    sent += 1;
  }

  const lineTargets = await getLineNotificationTargets();
  for (const target of lineTargets) {
    if (!target.enabled) continue;
    const timezone = target.timezone || getNotifyTimezone();
    const date = getYesterdayDateInTimezone(timezone);
    const branches = target.branches;
    const branchSignature = branches && branches.length > 0 ? branches.join('|') : 'ALL';
    const dedupeKey = `daily:line:${target.userId}:${date}:${branchSignature}`;
    const shouldSend = await shouldSendByDedupe(dedupeKey, 24 * 60);
    checked += 1;

    if (!shouldSend) {
      skipped += 1;
    } else {
      try {
        const monthToDate = { start: `${date.slice(0, 7)}-01`, end: date };
        const [branchSummaries, profitSummaries] = await Promise.all([
          getBranchDailySummaries(branches, { start: date, end: date }),
          getBranchProfitLossSummaries(monthToDate, branches),
        ]);

        const carousel = buildSalesProfitCarousel(date, monthToDate, branchSummaries, profitSummaries);

        await sendLineMessage(target.userId, [carousel]);
        sent += 1;
      } catch (error) {
        console.error('[notifications] failed to send LINE daily summary:', error);
        skipped += 1;
      }
    }
  }

  return {
    type: 'daily',
    sent,
    skipped,
    checked,
    at: nowIso,
  };
}
