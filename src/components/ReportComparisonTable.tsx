'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { PaginatedTable, type ColumnDef } from '@/components/PaginatedTable';
import { TableSkeleton } from '@/components/LoadingSkeleton';

/* ─── Branch color palette (consistent with Sales comparison page) ─── */
const BRANCH_PALETTE = [
    { bg: 'bg-indigo-50 dark:bg-indigo-950/30', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500', border: 'border-indigo-200 dark:border-indigo-800' },
    { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800' },
    { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500', border: 'border-amber-200 dark:border-amber-800' },
    { bg: 'bg-rose-50 dark:bg-rose-950/30', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500', border: 'border-rose-200 dark:border-rose-800' },
    { bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-700 dark:text-cyan-300', dot: 'bg-cyan-500', border: 'border-cyan-200 dark:border-cyan-800' },
    { bg: 'bg-violet-50 dark:bg-violet-950/30', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500', border: 'border-violet-200 dark:border-violet-800' },
];

export interface BranchInfo {
    key: string;
    name: string;
}

export interface ReportComparisonTableProps<T> {
    /** List of branches to compare */
    branches: BranchInfo[];
    /** Date range params to pass into each fetch call */
    dateRange: { start: string; end: string };
    /** Function that builds the endpoint URL for a given branch key and date params */
    buildEndpoint: (branchKey: string, dateRange: { start: string; end: string }) => string;
    /** Function that extracts the array of records from the API response */
    extractData?: (json: Record<string, unknown>) => T[];
    /** Column definitions (same as normal mode) */
    columns: ColumnDef<T>[];
    /** Key extractor for rows */
    keyExtractor: (item: T, index: number) => string;
    /** Sort key */
    defaultSortKey?: string;
    /** Sort order */
    defaultSortOrder?: 'asc' | 'desc';
    /** Empty message */
    emptyMessage?: string;
    /** Items per page in each card */
    itemsPerPage?: number;
    /** Trigger to re-fetch (increment to force refresh) */
    refreshKey?: number;
    /** Summary config for the table */
    showSummary?: boolean;
    summaryConfig?: Parameters<typeof PaginatedTable>[0]['summaryConfig'];
}

interface BranchState<T> {
    loading: boolean;
    error: string | null;
    data: T[];
}

export function ReportComparisonTable<T>({
    branches,
    dateRange,
    buildEndpoint,
    extractData,
    columns,
    keyExtractor,
    defaultSortKey,
    defaultSortOrder = 'desc',
    emptyMessage = 'ไม่มีข้อมูล',
    itemsPerPage = 10,
    refreshKey = 0,
    showSummary,
    summaryConfig,
}: ReportComparisonTableProps<T>) {
    const [states, setStates] = useState<Record<string, BranchState<T>>>({});

    const fetchAll = useCallback(async () => {
        if (branches.length === 0) return;

        // Set all to loading
        const initial: Record<string, BranchState<T>> = {};
        branches.forEach(b => {
            initial[b.key] = { loading: true, error: null, data: [] };
        });
        setStates(initial);

        // Fetch all in parallel
        await Promise.all(
            branches.map(async (branch) => {
                try {
                    const endpoint = buildEndpoint(branch.key, dateRange);
                    const res = await fetch(endpoint);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const json = await res.json();
                    const data: T[] = extractData ? extractData(json) : (json.data ?? []);
                    setStates(prev => ({
                        ...prev,
                        [branch.key]: { loading: false, error: null, data },
                    }));
                } catch (err) {
                    setStates(prev => ({
                        ...prev,
                        [branch.key]: {
                            loading: false,
                            error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
                            data: [],
                        },
                    }));
                }
            })
        );
    }, [branches, dateRange, buildEndpoint, extractData, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    if (branches.length === 0) {
        return (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                กรุณาเลือกกิจการที่ต้องการเปรียบเทียบ
            </div>
        );
    }

    const gridClass =
        branches.length === 1
            ? 'grid-cols-1'
            : branches.length === 2
                ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2'
                : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3';

    return (
        <div className={`grid gap-4 ${gridClass}`}>
            {branches.map((branch, idx) => {
                const palette = BRANCH_PALETTE[idx % BRANCH_PALETTE.length];
                const state = states[branch.key] ?? { loading: true, error: null, data: [] };

                return (
                    <div
                        key={branch.key}
                        className={`rounded-xl border ${palette.border} bg-card shadow-sm overflow-hidden`}
                    >
                        {/* Branch header */}
                        <div className={`flex items-center gap-2 px-4 py-3 ${palette.bg}`}>
                            <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${palette.dot}`} />
                            <span className={`text-sm font-semibold truncate ${palette.text}`}>
                                {branch.name}
                            </span>
                            {!state.loading && (
                                <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                                    {state.data.length} รายการ
                                </span>
                            )}
                        </div>

                        {/* Content */}
                        <div className="overflow-x-auto">
                            {state.loading ? (
                                <div className="p-3">
                                    <TableSkeleton rows={5} />
                                </div>
                            ) : state.error ? (
                                <div className="flex items-center justify-center py-10 px-4 text-sm text-red-500">
                                    ⚠️ {state.error}
                                </div>
                            ) : (
                                <PaginatedTable<T>
                                    data={state.data}
                                    columns={columns}
                                    itemsPerPage={itemsPerPage}
                                    emptyMessage={emptyMessage}
                                    defaultSortKey={defaultSortKey}
                                    defaultSortOrder={defaultSortOrder}
                                    keyExtractor={keyExtractor}
                                    showSummary={showSummary}
                                    summaryConfig={summaryConfig}
                                />
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
