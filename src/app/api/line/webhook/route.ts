import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const events = body?.events ?? [];

  console.log(`[line-webhook] received ${events.length} event(s):`, JSON.stringify(events));

  return NextResponse.json({ ok: true });
}
