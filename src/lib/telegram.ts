export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data?: string;
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

function requireTelegramToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error('Missing required environment variable: TELEGRAM_BOT_TOKEN');
  }

  return token;
}

async function callTelegramApi<T>(method: string, payload: Record<string, unknown>) {
  const token = requireTelegramToken();
  const endpoint = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram API error (${response.status}): ${text}`);
  }

  const data = await response.json() as TelegramApiResponse<T>;
  if (!data.ok) {
    throw new Error(data.description || `Telegram API ${method} failed`);
  }

  return data.result;
}

export async function sendTelegramMessage(params: {
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'MarkdownV2';
  replyMarkup?: TelegramInlineKeyboardMarkup;
}) {
  await callTelegramApi('sendMessage', {
    chat_id: params.chatId,
    text: params.text,
    parse_mode: params.parseMode || 'HTML',
    disable_web_page_preview: true,
    ...(params.replyMarkup ? { reply_markup: params.replyMarkup } : {}),
  });
}

export async function editTelegramMessage(params: {
  chatId: string;
  messageId: number;
  text: string;
  replyMarkup?: TelegramInlineKeyboardMarkup;
}) {
  await callTelegramApi('editMessageText', {
    chat_id: params.chatId,
    message_id: params.messageId,
    text: params.text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(params.replyMarkup ? { reply_markup: params.replyMarkup } : {}),
  });
}

export async function answerTelegramCallbackQuery(params: { callbackQueryId: string; text?: string }) {
  await callTelegramApi('answerCallbackQuery', {
    callback_query_id: params.callbackQueryId,
    ...(params.text ? { text: params.text } : {}),
  });
}

export async function getTelegramChatMember(chatId: string, userId: number) {
  const result = await callTelegramApi<{ status?: string }>('getChatMember', {
    chat_id: chatId,
    user_id: userId,
  });

  return result?.status || '';
}
