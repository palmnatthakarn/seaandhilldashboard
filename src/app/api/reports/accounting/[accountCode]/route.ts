import { NextResponse } from 'next/server';
import { getAccountProducts, getAccountPurchaseItems, getAccountType } from '@/lib/data/accounting';
import { formatErrorResponse, getErrorStatusCode, logError } from '@/lib/errors';
import { createCachedQuery, CacheDuration } from '@/lib/cache';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountCode: string }> }
) {
  try {
    const { accountCode } = await params;
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

    // ตรวจสอบ account_type เพื่อเรียกใช้ function ที่ถูกต้อง
    const accountType = await getAccountType(accountCode);
    
    const cachedQuery = createCachedQuery(
      () => {
        // INCOME/REVENUE ใช้ sales query, EXPENSES ใช้ purchase query
        if (accountType === 'INCOME' || accountType === 'REVENUE') {
          return getAccountProducts(dateRange, accountCode, branches);
        } else {
          return getAccountPurchaseItems(dateRange, accountCode, branches);
        }
      },
      ['reports', 'accounting', accountType === 'INCOME' || accountType === 'REVENUE' ? 'products' : 'purchases', accountCode, startDate, endDate, ...branches],
      CacheDuration.MEDIUM
    );

    const data = await cachedQuery();

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, 'GET /api/reports/accounting/[accountCode]');
    return NextResponse.json(formatErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
