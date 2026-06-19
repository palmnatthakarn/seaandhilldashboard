import { NextRequest, NextResponse } from 'next/server';
import { getItemPurchaseHistory } from '@/lib/data/purchase';
import { createCachedQuery, CacheDuration } from '@/lib/cache';
import { formatErrorResponse, getErrorStatusCode, logError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const itemCode = searchParams.get('item_code');

    if (!startDate || !endDate || !itemCode) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: start_date, end_date, item_code' },
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
      () => getItemPurchaseHistory({ start: startDate, end: endDate }, itemCode, branches),
      ['purchase', 'item-purchase-history', startDate, endDate, itemCode, ...branches],
      CacheDuration.MEDIUM
    );

    const data = await cachedQuery();

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, 'GET /api/purchase/item-purchase-history');
    return NextResponse.json(formatErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
