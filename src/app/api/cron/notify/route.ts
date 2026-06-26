import { NextRequest, NextResponse } from 'next/server';
import { dispatchDailySummary, dispatchIncidentNotifications } from '@/lib/data/notifications';
import { runWithRequestContext } from '@/lib/request-context';

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error('Missing required environment variable: CRON_SECRET');
  }

  const authorization = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  return authorization === expected;
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const type = request.nextUrl.searchParams.get('type');
    if (type !== 'incident' && type !== 'daily') {
      return NextResponse.json(
        { success: false, error: "Invalid type. Use 'incident' or 'daily'." },
        { status: 400 }
      );
    }

    const result = type === 'incident'
      ? await runWithRequestContext({ skipBranchAuth: true }, async () => dispatchIncidentNotifications())
      : await runWithRequestContext({ skipBranchAuth: true }, async () => dispatchDailySummary());

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('[GET /api/cron/notify]', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
