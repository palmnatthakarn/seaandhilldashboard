import { NextRequest, NextResponse } from 'next/server';
import { BRANCH_SYNC_MAP } from '@/lib/branch-names';
import {
  applyTelegramChatDraft,
  ensureTelegramChatConfig,
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
}

async function handleCallbackQuery(update: TelegramUpdate) {
  const callback = update.callback_query;
  if (!callback?.data) return;
  if (!callback.data.startsWith('branch:')) return;

  await handleBranchCallback(callback);
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
