/**
 * GET /api/revenue-expense
 * ดึงข้อมูลรายได้ vs ค่าใช้จ่าย 12 เดือนล่าสุด
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRevenueExpenseData } from '@/lib/data/dashboard';
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
        return await getRevenueExpenseData(normalizedBranches, dateRange);
      },
      ['dashboard', 'revenue-expense', ...normalizedBranches, startDate || '', endDate || ''],
      CacheDuration.LONG // 10 minutes cache
    );

    const data = await cachedQuery();

    return NextResponse.json(data);
  } catch (error) {
    logError(error, 'GET /api/revenue-expense');
    return NextResponse.json(formatErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
