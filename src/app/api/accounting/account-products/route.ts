import { NextRequest, NextResponse } from 'next/server';
import { getAccountProducts } from '@/lib/data/accounting';
import { createCachedQuery, CacheDuration } from '@/lib/cache';
import { formatErrorResponse, getErrorStatusCode, logError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const accountCode = searchParams.get('account_code');

    if (!startDate || !endDate || !accountCode) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: start_date, end_date, account_code' },
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
      () => getAccountProducts({ start: startDate, end: endDate }, accountCode, normalizedBranches),
      ['accounting', 'account-products', accountCode, startDate, endDate, ...normalizedBranches],
      CacheDuration.MEDIUM
    );

    const data = await cachedQuery();

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, 'GET /api/accounting/account-products');
    return NextResponse.json(formatErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
