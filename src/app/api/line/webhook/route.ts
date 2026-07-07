import { NextRequest, NextResponse } from 'next/server';
import { BRANCH_SYNC_MAP, resolveBranchName } from '@/lib/branch-names';
import {
  applyLineUserDraft,
  ensureLineUserConfig,
  getLineUserDraftBranches,
  getLineUserTarget,
  resetLineUserDraft,
  setLineUserDraftBranches,
} from '@/lib/data/line-config';
import { replyLineMessage, type LineMessagePayload } from '@/lib/line';

interface LineEventSource {
  type: string;
  userId?: string;
}

interface LineMessageEvent {
  type: 'message';
  replyToken: string;
  source: LineEventSource;
  message: { type: string; text?: string };
}

interface LinePostbackEvent {
  type: 'postback';
  replyToken: string;
  source: LineEventSource;
  postback: { data: string };
}

type LineEvent = LineMessageEvent | LinePostbackEvent | { type: string; [key: string]: unknown };

const branchOptions = Object.entries(BRANCH_SYNC_MAP).map(([branchSync, branchName]) => ({
  branchSync,
  branchName,
}));

function isAuthorizedWebhook(request: NextRequest) {
  const secret = process.env.LINE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error('Missing required environment variable: LINE_WEBHOOK_SECRET');
  }

  const querySecret = request.nextUrl.searchParams.get('secret') || '';
  return querySecret === secret;
}

function buildSelectionSummary(selected: string[]) {
  return selected.length > 0
    ? selected.map((sync) => resolveBranchName(sync)).join(', ')
    : 'ทุกกิจการ';
}

function buildBranchFlexMessage(selected: string[]): LineMessagePayload {
  const selectedSet = new Set(selected);
  const legend = branchOptions
    .map((item) => `${item.branchSync} = ${item.branchName}`)
    .join('\n');

  const branchButtons = branchOptions.map((item) => ({
    type: 'button',
    style: selectedSet.has(item.branchSync) ? 'primary' : 'secondary',
    height: 'sm',
    action: {
      type: 'postback',
      label: `${selectedSet.has(item.branchSync) ? '✅' : '⬜'} ${item.branchSync}`,
      data: `branch:toggle:${item.branchSync}`,
      displayText: item.branchName,
    },
  }));

  return {
    type: 'flex',
    altText: 'เลือกกิจการสำหรับรับรายงาน',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '🏢 เลือกกิจการสำหรับรับรายงาน', weight: 'bold', size: 'md', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: legend, size: 'xs', color: '#888888', wrap: true },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: `ตอนนี้เลือก: ${buildSelectionSummary(selected)}`, weight: 'bold', size: 'sm', wrap: true, margin: 'md' },
          { type: 'separator', margin: 'md' },
          ...branchButtons,
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: 'เลือกทั้งหมด', data: 'branch:all', displayText: 'เลือกทั้งหมด' } },
              { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: 'ล้างทั้งหมด', data: 'branch:none', displayText: 'ล้างทั้งหมด' } },
            ],
          },
          { type: 'button', style: 'primary', height: 'sm', action: { type: 'postback', label: 'บันทึก', data: 'branch:save', displayText: 'บันทึก' } },
        ],
      },
    },
  };
}

async function handleTextMessage(event: LineMessageEvent) {
  const userId = event.source.userId;
  if (!userId || event.message.type !== 'text') return;

  const command = (event.message.text ?? '').trim().split(' ')[0];

  if (command === '/branches') {
    await ensureLineUserConfig(userId, userId);
    await resetLineUserDraft(userId, userId);
    const draft = await getLineUserDraftBranches(userId);
    await replyLineMessage(event.replyToken, [buildBranchFlexMessage(draft)]);
    return;
  }

  if (command === '/showbranches') {
    const target = await getLineUserTarget(userId);
    await replyLineMessage(event.replyToken, [
      { type: 'text', text: `📌 กิจการที่ตั้งค่าไว้ตอนนี้: ${buildSelectionSummary(target.branches ?? [])}` },
    ]);
  }
}

async function handlePostback(event: LinePostbackEvent) {
  const userId = event.source.userId;
  if (!userId) return;

  await ensureLineUserConfig(userId, userId);
  const data = event.postback.data;

  if (data === 'branch:save') {
    await applyLineUserDraft(userId, userId);
    const target = await getLineUserTarget(userId);
    await replyLineMessage(event.replyToken, [
      { type: 'text', text: `✅ บันทึกเรียบร้อย: ${buildSelectionSummary(target.branches ?? [])}` },
    ]);
    return;
  }

  let selected = await getLineUserDraftBranches(userId);

  if (data.startsWith('branch:toggle:')) {
    const branchSync = data.slice('branch:toggle:'.length);
    selected = selected.includes(branchSync)
      ? selected.filter((item) => item !== branchSync)
      : [...selected, branchSync];
    await setLineUserDraftBranches(userId, selected, userId);
  } else if (data === 'branch:all') {
    selected = branchOptions.map((item) => item.branchSync);
    await setLineUserDraftBranches(userId, selected, userId);
  } else if (data === 'branch:none') {
    selected = [];
    await setLineUserDraftBranches(userId, selected, userId);
  } else {
    return;
  }

  const latest = await getLineUserDraftBranches(userId);
  await replyLineMessage(event.replyToken, [buildBranchFlexMessage(latest)]);
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedWebhook(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const events = (body?.events ?? []) as LineEvent[];

  console.log(`[line-webhook] received ${events.length} event(s):`, JSON.stringify(events));

  for (const event of events) {
    try {
      if (event.type === 'message') {
        await handleTextMessage(event as LineMessageEvent);
      } else if (event.type === 'postback') {
        await handlePostback(event as LinePostbackEvent);
      }
    } catch (error) {
      console.error('[line-webhook] failed to handle event:', error);
    }
  }

  return NextResponse.json({ ok: true });
}
