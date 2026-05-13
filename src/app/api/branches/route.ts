import { NextResponse } from 'next/server';
import { clickhouse } from '@/lib/clickhouse';
import { getCurrentBranchPolicy } from '@/lib/auth-policy';

export async function GET() {
    try {
        const branchPolicy = await getCurrentBranchPolicy();
        const query = `
            SELECT branch_sync, any(branch_sync_name) as branch_sync_name
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
            ...data.map((row: { branch_sync: string; branch_sync_name: string }) => ({
                key: row.branch_sync,
                name: row.branch_sync_name || `กิจการ ${row.branch_sync}`,
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
        console.error('Failed to fetch branches:', error);
        return NextResponse.json(
            { error: 'Failed to fetch branches from ClickHouse' },
            { status: 500 }
        );
    }
}
