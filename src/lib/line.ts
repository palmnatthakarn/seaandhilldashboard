export type LineMessagePayload =
  | { type: 'text'; text: string }
  | { type: 'flex'; altText: string; contents: unknown };

function requireLineChannelAccessToken() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error('Missing required environment variable: LINE_CHANNEL_ACCESS_TOKEN');
  }

  return token;
}

export async function sendLineMessage(to: string, messages: LineMessagePayload[]) {
  const token = requireLineChannelAccessToken();

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, messages }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINE push message failed (${response.status}): ${body}`);
  }
}

export async function replyLineMessage(replyToken: string, messages: LineMessagePayload[]) {
  const token = requireLineChannelAccessToken();

  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ replyToken, messages }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINE reply message failed (${response.status}): ${body}`);
  }
}
