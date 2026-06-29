import { NextRequest, NextResponse } from 'next/server';
import { BRANCH_SYNC_MAP, resolveBranchName } from '@/lib/branch-names';
import {
  applyTelegramChatDraft,
  ensureTelegramChatConfig,
  getCarouselCache,
  getTelegramChatDraftBranches,
  getTelegramChatTarget,
  resetTelegramChatDraft,
  setTelegramChatDraftBranches,
} from '@/lib/data/telegram-config';
import {
  answerTelegramCallbackQuery,
  editTelegramMessage,
  getTelegramChatMember,
  sendTelegramMessage,
  type TelegramInlineKeyboardMarkup,
} from '@/lib/telegram';

interface TelegramUser {
  id: number;
  username?: string;
}

interface TelegramChat {
  id: number;
  type?: string;
}

interface TelegramMessage {
  message_id: number;
  text?: string;
  chat: TelegramChat;
  from?: TelegramUser;
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  from: TelegramUser;
  message?: TelegramMessage;
}

interface TelegramUpdate {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

const branchOptions = Object.entries(BRANCH_SYNC_MAP).map(([branchSync, branchName]) => ({
  branchSync,
  branchName,
}));

function isAuthorizedWebhook(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error('Missing required environment variable: TELEGRAM_WEBHOOK_SECRET');
  }

  const querySecret = request.nextUrl.searchParams.get('secret') || '';
  return querySecret === secret;
}

function userLabel(user?: TelegramUser) {
  if (!user) return 'unknown';
  return user.username ? `${user.id}:${user.username}` : String(user.id);
}

async function canManageChat(chatId: string, userId: number) {
  const status = await getTelegramChatMember(chatId, userId);
  return status === 'creator' || status === 'administrator';
}

function buildBranchKeyboard(selected: string[]): TelegramInlineKeyboardMarkup {
  const selectedSet = new Set(selected);
  const rows = branchOptions.map((item) => ([{
    text: `${selectedSet.has(item.branchSync) ? '✅' : '⬜'} ${item.branchSync} ${item.branchName}`,
    callback_data: `branch:toggle:${item.branchSync}`,
  }]));

  rows.push([
    { text: 'เลือกทั้งหมด', callback_data: 'branch:all' },
    { text: 'ล้างทั้งหมด', callback_data: 'branch:none' },
  ]);
  rows.push([{ text: 'บันทึก', callback_data: 'branch:save' }]);

  return {
    inline_keyboard: rows,
  };
}

function buildBranchPanelText(selected: string[]) {
  const summary = selected.length > 0
    ? selected.join(', ')
    : 'ทุกกิจการ';

  return [
    '🏢 <b>เลือกกิจการสำหรับรับรายงาน</b>',
    `ตอนนี้เลือก: <code>${summary}</code>`,
    '',
    'กดปุ่มเพื่อเลือก/ยกเลิกกิจการ แล้วกด <b>บันทึก</b>',
  ].join('\n');
}

async function openBranchSelection(message: TelegramMessage) {
  const chatId = String(message.chat.id);
  const actor = userLabel(message.from);

  await ensureTelegramChatConfig(chatId, actor);
  await resetTelegramChatDraft(chatId, actor);
  const draft = await getTelegramChatDraftBranches(chatId);

  await sendTelegramMessage({
    chatId,
    text: buildBranchPanelText(draft),
    parseMode: 'HTML',
    replyMarkup: buildBranchKeyboard(draft),
  });
}

async function showCurrentBranches(message: TelegramMessage) {
  const chatId = String(message.chat.id);
  const target = await getTelegramChatTarget(chatId);
  const branches = target.branches;

  await sendTelegramMessage({
    chatId,
    text: branches && branches.length > 0
      ? `📌 กิจการที่ตั้งค่าไว้ตอนนี้: <code>${branches.join(', ')}</code>`
      : '📌 กิจการที่ตั้งค่าไว้ตอนนี้: <code>ทุกกิจการ</code>',
    parseMode: 'HTML',
  });
}

async function handleMessage(update: TelegramUpdate) {
  const message = update.message;
  if (!message?.text) return;

  const command = message.text.trim().split(' ')[0];
  if (command !== '/branches' && command !== '/showbranches') return;

  const chatId = String(message.chat.id);
  const fromId = message.from?.id;
  if (!fromId) return;

  const allowed = await canManageChat(chatId, fromId);
  if (command === '/showbranches') {
    await showCurrentBranches(message);
    return;
  }

  if (!allowed) {
    await sendTelegramMessage({
      chatId,
      text: 'ขออภัย เฉพาะ owner/admin ของกลุ่มเท่านั้นที่แก้การตั้งค่ากิจการได้',
      parseMode: 'HTML',
    });
    return;
  }

  await openBranchSelection(message);
}

async function handleBranchCallback(callback: TelegramCallbackQuery) {
  const message = callback.message;
  if (!message) return;

  try {
    const chatId = String(message.chat.id);
    const actor = userLabel(callback.from);
    const allowed = await canManageChat(chatId, callback.from.id);
    if (!allowed) {
      await answerTelegramCallbackQuery({
        callbackQueryId: callback.id,
        text: 'เฉพาะ owner/admin ที่แก้ได้',
      });
      return;
    }

    await ensureTelegramChatConfig(chatId, actor);
    let selected = await getTelegramChatDraftBranches(chatId);

    const action = callback.data || '';
    if (action.startsWith('branch:toggle:')) {
      const branchSync = action.replace('branch:toggle:', '');
      const exists = selected.includes(branchSync);
      selected = exists
        ? selected.filter((item) => item !== branchSync)
        : [...selected, branchSync];
      await setTelegramChatDraftBranches(chatId, selected, actor);
    } else if (action === 'branch:all') {
      selected = branchOptions.map((item) => item.branchSync);
      await setTelegramChatDraftBranches(chatId, selected, actor);
    } else if (action === 'branch:none') {
      selected = [];
      await setTelegramChatDraftBranches(chatId, selected, actor);
    } else if (action === 'branch:save') {
      await applyTelegramChatDraft(chatId, actor);
      const target = await getTelegramChatTarget(chatId);
      const resultText = target.branches && target.branches.length > 0
        ? `บันทึกเรียบร้อย: <code>${target.branches.join(', ')}</code>`
        : 'บันทึกเรียบร้อย: <code>ทุกกิจการ</code>';

      await answerTelegramCallbackQuery({
        callbackQueryId: callback.id,
        text: 'บันทึกแล้ว',
      });

      await editTelegramMessage({
        chatId,
        messageId: message.message_id,
        text: `✅ ${resultText}`,
      });
      return;
    }

    const latest = await getTelegramChatDraftBranches(chatId);
    await answerTelegramCallbackQuery({ callbackQueryId: callback.id });
    await editTelegramMessage({
      chatId,
      messageId: message.message_id,
      text: buildBranchPanelText(latest),
      replyMarkup: buildBranchKeyboard(latest),
    });
  } catch (error) {
    console.error('[webhook] handleBranchCallback error:', error);
    await answerTelegramCallbackQuery({
      callbackQueryId: callback.id,
      text: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
    }).catch(() => {});
  }
}

function formatBranchCardFromCache(
  cache: import('@/lib/data/telegram-config').CarouselCacheData,
  branchSync: string,
  date: string,
) {
  const summary = cache.branchSummaries.find((s) => s.branchSync === branchSync);
  if (!summary) return null;

  const branchAlerts = cache.alerts.filter(
    (a) => !a.branchSync || a.branchSync === branchSync,
  );
  const errors = branchAlerts.filter((a) => (a.severity || a.type) === 'error').length;
  const warnings = branchAlerts.filter((a) => (a.severity || a.type) === 'warning').length;

  const topItems = [...branchAlerts]
    .sort((a, b) => {
      const sa = a.severity || a.type;
      const sb = b.severity || b.type;
      const wa = sa === 'error' ? 0 : sa === 'warning' ? 1 : 2;
      const wb = sb === 'error' ? 0 : sb === 'warning' ? 1 : 2;
      const delta = wa - wb;
      if (delta !== 0) return delta;
      return (b.count || 0) - (a.count || 0);
    })
    .slice(0, 2)
    .map((alert, index) => `${index + 1}) ${alert.title} - ${alert.message}`);

  const topSection = topItems.length > 0
    ? topItems.map((line) => line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')).join('\n')
    : '- ไม่มีเหตุผิดปกติ';

  const fmtNum = (v: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
  const fmtCur = (v: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  const fmtDate = (isoDate: string) => new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(`${isoDate}T00:00:00.000Z`));

  return [
    `📊 <b>Daily MIS Summary (${fmtDate(date)})</b>`,
    `🏢 ${summary.branchName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}`,
    '',
    `💰 ยอดขาย: ฿${fmtCur(summary.totalSales)}`,
    `🧾 ออเดอร์: ${fmtNum(summary.totalOrders)} บิล`,
    `👥 ลูกค้า: ${fmtNum(summary.totalCustomers)} คน`,
    `🛒 Avg/Order: ฿${fmtCur(summary.avgOrderValue)}`,
    '',
    '⚠️ <b>Alerts</b>',
    `- Error: ${errors}`,
    `- Warning: ${warnings}`,
    '',
    '🔥 <b>Top Alert</b>',
    topSection,
    '',
    `🔗 <a href="${process.env.DASHBOARD_URL || 'https://seaandhill-dashboard.vercel.app/'}">เปิด Dashboard</a>`,
    '#MIS #DailyReport',
  ].join('\n');
}

function formatOverviewCardFromCache(
  cache: import('@/lib/data/telegram-config').CarouselCacheData,
  date: string,
) {
  const fmtNum = (v: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
  const fmtCur = (v: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  const fmtDate = (isoDate: string) => new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(`${isoDate}T00:00:00.000Z`));
  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const errors = cache.alerts.filter((a) => (a.severity || a.type) === 'error').length;
  const warnings = cache.alerts.filter((a) => (a.severity || a.type) === 'warning').length;

  const topItems = [...cache.alerts]
    .sort((a, b) => {
      const sa = a.severity || a.type;
      const sb = b.severity || b.type;
      const wa = sa === 'error' ? 0 : sa === 'warning' ? 1 : 2;
      const wb = sb === 'error' ? 0 : sb === 'warning' ? 1 : 2;
      const delta = wa - wb;
      if (delta !== 0) return delta;
      return (b.count || 0) - (a.count || 0);
    })
    .slice(0, 3)
    .map((alert, index) => `${index + 1}) ${alert.title} - ${alert.message}`);

  const topSection = topItems.length > 0
    ? topItems.map((line) => escHtml(line)).join('\n')
    : '- ไม่มีเหตุผิดปกติสำคัญ';

  const branchRows = cache.branchSummaries.length > 0
    ? cache.branchSummaries
        .slice(0, 10)
        .map((branch, index) => `${index + 1}) ${escHtml(branch.branchName)} | ฿${fmtCur(branch.totalSales)} | ${fmtNum(branch.totalOrders)} บิล | ${fmtNum(branch.totalCustomers)} ลูกค้า`)
        .join('\n')
    : '- ไม่พบข้อมูลกิจการในช่วงเวลานี้';

  return [
    `📊 <b>Daily MIS Summary (${fmtDate(date)})</b>`,
    `🏢 ${cache.branches.length > 0 ? `กิจการที่เลือก: ${escHtml(cache.branches.map((b) => resolveBranchName(b)).join(', '))}` : 'กิจการที่เลือก: ทุกกิจการ'}`,
    '',
    `💰 Sales: ฿${fmtCur(cache.kpis.totalSales)}`,
    `🧾 Orders: ${fmtNum(cache.kpis.totalOrders)}`,
    `👥 Customers: ${fmtNum(cache.kpis.totalCustomers)}`,
    `🛒 Avg/Order: ฿${fmtCur(cache.kpis.avgOrderValue)}`,
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
    `🔗 <a href="${process.env.DASHBOARD_URL || 'https://seaandhill-dashboard.vercel.app/'}">เปิด Dashboard</a>`,
    '#MIS #DailyReport',
  ].join('\n');
}

function buildCarouselKeyboardFromCache(
  cache: import('@/lib/data/telegram-config').CarouselCacheData,
  activeSync: string,
): TelegramInlineKeyboardMarkup {
  const rows: TelegramInlineKeyboardMarkup['inline_keyboard'] = [];
  const row: TelegramInlineKeyboardMarkup['inline_keyboard'][number] = [];

  for (let i = 0; i < cache.branchSummaries.length; i++) {
    const s = cache.branchSummaries[i];
    const isActive = s.branchSync === activeSync;
    const shortName = (BRANCH_SYNC_MAP[s.branchSync]?.split(' ').slice(0, 2).join(' ') || s.branchSync).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const label = isActive ? `📌 ${shortName}` : shortName;

    row.push({
      text: label,
      callback_data: `d:${s.branchSync}`,
    });

    if (row.length === 3 || i === cache.branchSummaries.length - 1) {
      rows.push([...row]);
      row.length = 0;
    }
  }

  rows.push([{ text: activeSync === 'ov' ? '📌 ภาพรวม' : '📊 ภาพรวม', callback_data: 'd:ov' }]);

  return { inline_keyboard: rows };
}

async function handleDailyCarouselCallback(callback: TelegramCallbackQuery) {
  const message = callback.message;
  if (!message || !callback.data) return;

  try {
    const chatId = String(message.chat.id);
    const messageId = message.message_id;
    const cache = await getCarouselCache(chatId, messageId);
    if (!cache) {
      await answerTelegramCallbackQuery({
        callbackQueryId: callback.id,
        text: 'ข้อมูลหมดอายุ กรุณารอรายงานใหม่',
      });
      return;
    }

    const branchSync = callback.data.slice(2);
    const activeSync = branchSync === 'ov' ? 'ov' : branchSync;
    const keyboard = buildCarouselKeyboardFromCache(cache, activeSync);

    if (branchSync === 'ov') {
      const card = formatOverviewCardFromCache(cache, cache.date);
      if (!card) return;
      await editTelegramMessage({ chatId, messageId, text: card, replyMarkup: keyboard });
    } else {
      const card = formatBranchCardFromCache(cache, branchSync, cache.date);
      if (!card) return;
      await editTelegramMessage({ chatId, messageId, text: card, replyMarkup: keyboard });
    }

    await answerTelegramCallbackQuery({ callbackQueryId: callback.id });
  } catch (error) {
    console.error('[webhook] handleDailyCarouselCallback error:', error);
    await answerTelegramCallbackQuery({
      callbackQueryId: callback.id,
      text: 'เกิดข้อผิดพลาด',
    }).catch(() => {});
  }
}

async function handleCallbackQuery(update: TelegramUpdate) {
  const callback = update.callback_query;
  if (!callback?.data) return;

  try {
    if (callback.data.startsWith('branch:')) {
      await handleBranchCallback(callback);
    } else if (callback.data.startsWith('d:')) {
      await handleDailyCarouselCallback(callback);
    } else {
      await answerTelegramCallbackQuery({
        callbackQueryId: callback.id,
        text: 'คำสั่งไม่ถูกต้อง',
      });
    }
  } catch (error) {
    console.error('[webhook] handleCallbackQuery error:', error);
    await answerTelegramCallbackQuery({
      callbackQueryId: callback.id,
      text: 'เกิดข้อผิดพลาด',
    }).catch(() => {});
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorizedWebhook(request)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const update = await request.json() as TelegramUpdate;
    await handleMessage(update);
    await handleCallbackQuery(update);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[POST /api/telegram/webhook]', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
