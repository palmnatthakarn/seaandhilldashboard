/**
 * GET /api/dashboard
 * ดึงข้อมูล KPIs, Recent Sales, และ Alerts สำหรับหน้า Dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDashboardKPIs, getRecentSales, getDashboardAlerts } from '@/lib/data/dashboard';
import { createCachedQuery, CacheDuration } from '@/lib/cache';
import { formatErrorResponse, getErrorStatusCode, logError } from '@/lib/errors';
import { getAuthorizedBranches } from '@/lib/api-branch-auth';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const salesLimit = parseInt(searchParams.get('salesLimit') || '10', 10);
    
    const normalizedBranches = await getAuthorizedBranches(new URLSearchParams(searchParams));

    const dateRange = startDate && endDate ? { start: startDate, end: endDate } : undefined;

    const cachedQuery = createCachedQuery(
      async () => {
        const [kpis, recentSales, alerts] = await Promise.all([
          getDashboardKPIs(normalizedBranches, dateRange),
          getRecentSales(normalizedBranches, dateRange, salesLimit),
          getDashboardAlerts(normalizedBranches, dateRange),
        ]);

        return {
          ...kpis,
          recentSales,
          alerts,
        };
      },
      ['dashboard', 'overview', ...normalizedBranches, startDate || '', endDate || '', String(salesLimit)],
      CacheDuration.SHORT // 1 minute cache
    );

    const data = await cachedQuery();

    return NextResponse.json(data);
  } catch (error) {
    console.error('API Error:', error); // Debug log
    logError(error, 'GET /api/dashboard');
    return NextResponse.json(formatErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
