import { NextResponse } from 'next/server';
import { clickhouse } from '@/lib/clickhouse';
import { getCurrentBranchPolicy } from '@/lib/auth-policy';

const BRANCH_MAPPING: Record<string, string> = {
    'b000': 'บริษัท ช้าง สยาม กัมปนี จำกัด',
    'b001': 'บริษัท ช้างสยามรวย จำกัด',
    'b002': 'บริษัท ช้าง ทรัพย์ ทวี จำกัด',
    'b003': 'บริษัท ชาวทะเลเฮฮา จำกัด',
    'b004': 'บริษัท ดีจิงจัง 5665 จำกัด',
    'b005': 'บริษัท ฮอมหัก จำกัด',
};

export async function GET() {
    try {
        const branchPolicy = await getCurrentBranchPolicy();
        const query = `
            SELECT DISTINCT branch_sync
            FROM saleinvoice_transaction
            WHERE branch_sync != ''
            ORDER BY branch_sync
        `;

        const result = await clickhouse.query({
            query,
            format: 'JSONEachRow',
        });

        const data = await result.json();
        const allBranches = [
            { key: 'ALL', name: 'ทุกกิจการ' },
            ...data.map((row: { branch_sync: string }) => {
                const branchCode = row.branch_sync;
                return {
                    key: branchCode,
                    name: BRANCH_MAPPING[branchCode] || `กิจการ ${branchCode}`,
                };
            }),
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
