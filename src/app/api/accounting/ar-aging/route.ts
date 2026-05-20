import { NextResponse } from 'next/server';
import { getARAgingData } from '@/lib/data/accounting';
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

    let branches = searchParams.getAll('branch');
    if (branches.length === 0) {
      branches = ['ALL'];
    } else if (branches.length === 1 && branches[0].includes(',')) {
      branches = branches[0].split(',');
    }

    const dateRange = { start: startDate, end: endDate };

    const cachedQuery = createCachedQuery(
      () => getARAgingData(dateRange, branches),
      ['accounting', 'ar-aging', startDate, endDate, ...branches],
      CacheDuration.SHORT
    );

    const data = await cachedQuery();

    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(error, 'GET /api/accounting/ar-aging');
    return NextResponse.json(formatErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
