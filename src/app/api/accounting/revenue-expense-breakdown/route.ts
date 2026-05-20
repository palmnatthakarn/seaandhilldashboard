import { NextResponse } from 'next/server';
import { getRevenueBreakdown, getExpenseBreakdown } from '@/lib/data/accounting';
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

    const cachedRevenueQuery = createCachedQuery(
      () => getRevenueBreakdown(dateRange, branches),
      ['accounting', 'revenue-breakdown', startDate, endDate, ...branches],
      CacheDuration.MEDIUM
    );

    const cachedExpenseQuery = createCachedQuery(
      () => getExpenseBreakdown(dateRange, branches),
      ['accounting', 'expense-breakdown', startDate, endDate, ...branches],
      CacheDuration.MEDIUM
    );

    // Fetch both in parallel
    const [revenue, expenses] = await Promise.all([
      cachedRevenueQuery(),
      cachedExpenseQuery(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        revenue,
        expenses,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(error, 'GET /api/accounting/revenue-expense-breakdown');
    return NextResponse.json(formatErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
