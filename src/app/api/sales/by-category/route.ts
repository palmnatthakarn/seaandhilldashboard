import { NextRequest, NextResponse } from 'next/server';
import { getSalesByCategory } from '@/lib/data/sales';
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

    const branches = searchParams.getAll('branch');
    let normalizedBranches = branches;
    if (branches.length === 0) {
      normalizedBranches = ['ALL'];
    } else if (branches.length === 1 && branches[0].includes(',')) {
      normalizedBranches = branches[0].split(',');
    }

    const cachedQuery = createCachedQuery(
      () => getSalesByCategory({ start: startDate, end: endDate }, normalizedBranches),
      ['sales', 'by-category-v2-product-detail-total', startDate, endDate, ...normalizedBranches],
      CacheDuration.MEDIUM
    );

    const data = await cachedQuery();

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    logError(error, 'GET /api/sales/by-category');
    return NextResponse.json(formatErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
