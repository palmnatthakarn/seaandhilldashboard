/**
 * GET /api/sales-chart
 * ดึงข้อมูลกราฟยอดขาย 30 วันล่าสุด
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSalesChartData } from '@/lib/data/dashboard';
import { createCachedQuery, CacheDuration } from '@/lib/cache';
import { formatErrorResponse, getErrorStatusCode, logError } from '@/lib/errors';
import { getAuthorizedBranches } from '@/lib/api-branch-auth';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    const normalizedBranches = await getAuthorizedBranches(new URLSearchParams(searchParams));

    const dateRange = startDate && endDate ? { start: startDate, end: endDate } : undefined;

    const cachedQuery = createCachedQuery(
      async () => {
        return await getSalesChartData(normalizedBranches, dateRange);
      },
      ['dashboard', 'sales-chart-v2-product-detail-total', ...normalizedBranches, startDate || '', endDate || ''],
      CacheDuration.MEDIUM // 5 minutes cache
    );

    const data = await cachedQuery();

    return NextResponse.json(data);
  } catch (error) {
    logError(error, 'GET /api/sales-chart');
    return NextResponse.json(formatErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
