import { NextResponse } from 'next/server';
import { getChartOfAccountsList } from '@/lib/data/accounting';
import { formatErrorResponse, getErrorStatusCode, logError } from '@/lib/errors';
import { createCachedQuery, CacheDuration } from '@/lib/cache';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'start_date and end_date are required' },
        { status: 400 }
      );
    }

    const dateRange = { start: startDate, end: endDate };

    let branches = searchParams.getAll('branch');
    if (branches.length === 0) {
      branches = ['ALL'];
    } else if (branches.length === 1 && branches[0].includes(',')) {
      branches = branches[0].split(',');
    }

    const cachedQuery = createCachedQuery(
      () => getChartOfAccountsList(dateRange, branches),
      ['reports', 'accounting', 'chart-of-accounts', startDate, endDate, ...branches],
      CacheDuration.MEDIUM
    );

    const data = await cachedQuery();

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, 'GET /api/reports/accounting');
    return NextResponse.json(formatErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
