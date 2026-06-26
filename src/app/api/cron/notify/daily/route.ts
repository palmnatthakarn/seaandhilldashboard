import { NextRequest, NextResponse } from 'next/server';
import { dispatchDailySummary } from '@/lib/data/notifications';
import { runWithRequestContext } from '@/lib/request-context';

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error('Missing required environment variable: CRON_SECRET');
  }

  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await runWithRequestContext({ skipBranchAuth: true }, async () => dispatchDailySummary());
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('[GET /api/cron/notify/daily]', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
