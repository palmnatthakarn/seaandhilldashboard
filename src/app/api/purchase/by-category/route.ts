import { NextRequest, NextResponse } from 'next/server';
import { getPurchaseByCategory } from '@/lib/data/purchase';
import { createCachedQuery, CacheDuration } from '@/lib/cache';
import { formatErrorResponse, getErrorStatusCode, logError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: start_date, end_date' },
        { status: 400 }
      );
    }

    let branches = searchParams.getAll('branch');
    if (branches.length === 0) {
      branches = ['ALL'];
    } else if (branches.length === 1 && branches[0].includes(',')) {
      branches = branches[0].split(',');
    }

    const cachedQuery = createCachedQuery(
      () => getPurchaseByCategory({ start: startDate, end: endDate }, branches),
      ['purchase', 'by-category', startDate, endDate, ...branches],
      CacheDuration.MEDIUM
    );

    const data = await cachedQuery();

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    logError(error, 'GET /api/purchase/by-category');
    return NextResponse.json(formatErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
