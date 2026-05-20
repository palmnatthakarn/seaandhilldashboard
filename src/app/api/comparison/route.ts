import { NextResponse } from 'next/server';
import { getBranchComparisonData } from '@/lib/data/comparison';
import { formatErrorResponse, getErrorStatusCode, logError } from '@/lib/errors';
import { getAuthorizedBranches } from '@/lib/api-branch-auth';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date') || undefined;
    const endDate = searchParams.get('end_date') || undefined;

    const branches = await getAuthorizedBranches(searchParams);

    const data = await getBranchComparisonData(startDate, endDate, branches);

    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(error, 'GET /api/comparison');
    return NextResponse.json(formatErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
