import { NextRequest, NextResponse } from 'next/server';
import { dispatchIncidentNotifications } from '@/lib/data/notifications';
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

    const result = await runWithRequestContext({ skipBranchAuth: true }, async () => dispatchIncidentNotifications());
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[GET /api/cron/notify/incident]', { message, stack });
    return NextResponse.json({ success: false, error: message, stack }, { status: 500 });
  }
}
