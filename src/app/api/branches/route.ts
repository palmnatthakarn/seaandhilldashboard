import { NextResponse } from 'next/server';
import { clickhouse } from '@/lib/clickhouse';
import { getCurrentBranchPolicy } from '@/lib/auth-policy';
import { ErrorTypes, formatErrorResponse, getErrorStatusCode, logError } from '@/lib/errors';
import { resolveBranchName } from '@/lib/branch-names';

export async function GET() {
    try {
        const branchPolicy = await getCurrentBranchPolicy();
        if (!branchPolicy.user) {
            throw ErrorTypes.UNAUTHORIZED('Authentication required');
        }
        if (!branchPolicy.isAllowed) {
            throw ErrorTypes.FORBIDDEN('Dashboard access has not been granted');
        }

        const query = `
            SELECT branch_sync
            FROM saleinvoice_transaction
            WHERE branch_sync != ''
            GROUP BY branch_sync
            ORDER BY branch_sync
        `;

        const result = await clickhouse.query({
            query,
            format: 'JSONEachRow',
        });

        const data = await result.json();
        const allBranches = [
            { key: 'ALL', name: 'ทุกกิจการ' },
            ...data.map((row: { branch_sync: string }) => ({
                key: row.branch_sync,
                name: resolveBranchName(row.branch_sync),
            })),
        ];

        const branches = branchPolicy.isAdmin || branchPolicy.branches.includes('*')
            ? allBranches
            : [
                { key: 'ALL', name: 'ทุกกิจการ' },
                ...allBranches.filter((branch) => branch.key !== 'ALL' && branchPolicy.branches.includes(branch.key)),
            ];

        return NextResponse.json(branches);
    } catch (error) {
        logError(error, 'GET /api/branches');
        return NextResponse.json(formatErrorResponse(error), { status: getErrorStatusCode(error) });
    }
}
