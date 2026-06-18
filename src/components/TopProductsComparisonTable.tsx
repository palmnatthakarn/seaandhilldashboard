'use client';

import { Fragment, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Database } from 'lucide-react';
import { formatNumber, formatCurrency, formatDate } from '@/lib/formatters';

export interface TopProductPivotRow {
  itemCode: string;
  itemName: string;
  unitCode: string;
  totalSalesAll: number;
  [key: string]: unknown;
}

interface BranchInfo {
  key: string;
  name: string;
}

interface Props {
  data: TopProductPivotRow[];
  branches: BranchInfo[];
  dateRange: { start: string; end: string };
  itemsPerPage?: number;
  emptyMessage?: string;
}

export function TopProductsComparisonTable({ data, branches, dateRange, itemsPerPage = 50, emptyMessage = 'ไม่มีข้อมูล' }: Props) {
  const periodLabel = `${formatDate(dateRange.start)} – ${formatDate(dateRange.end)}`;
  const [sortKey, setSortKey] = useState<string>('totalSalesAll');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(itemsPerPage);

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortOrder === 'asc' ? av - bv : bv - av;
    }
    return sortOrder === 'asc'
      ? String(av).localeCompare(String(bv), 'th-TH')
      : String(bv).localeCompare(String(av), 'th-TH');
  });

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortOrder('desc'); }
    setPage(1);
  };

  const renderSortIcon = (key: string) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3.5 w-3.5 opacity-30 group-hover:opacity-60 transition-opacity" />;
    return sortOrder === 'asc'
      ? <ArrowUp className="h-3.5 w-3.5 text-primary" />
      : <ArrowDown className="h-3.5 w-3.5 text-primary" />;
  };

  const thBase = 'px-2 py-2 sm:px-3 sm:py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border';

  const getPageNumbers = () => {
    const maxPages = 5;
    const start = Math.max(1, Math.min(page - 2, totalPages - maxPages + 1));
    const end = Math.min(totalPages, start + maxPages - 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
        <Database className="h-12 w-12 mb-2 opacity-50" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col h-full flex-1 min-h-0">
      <div className="overflow-auto flex-1 min-h-0">
        <table className="w-full border-collapse border border-border">
          <thead className="sticky top-0 z-10 bg-background">
            {/* Row 1: # | รหัสสินค้า | สินค้า | [Branch name colSpan=2] ... | รวมยอดขาย */}
            <tr className="bg-muted/50">
              <th rowSpan={2} className={`${thBase} text-center w-10 border border-border`}>#</th>
              <th
                rowSpan={2}
                className={`${thBase} text-left cursor-pointer select-none group hover:bg-muted/80 transition-colors whitespace-nowrap border border-border`}
                onClick={() => handleSort('itemCode')}
              >
                <div className="flex items-center gap-1.5">
                  <span>รหัสสินค้า</span>
                  {renderSortIcon('itemCode')}
                </div>
              </th>
              <th
                rowSpan={2}
                className={`${thBase} text-left cursor-pointer select-none group hover:bg-muted/80 transition-colors min-w-[240px] border border-border`}
                onClick={() => handleSort('itemName')}
              >
                <div className="flex items-center gap-1.5">
                  <span>สินค้า</span>
                  {renderSortIcon('itemName')}
                </div>
              </th>
              <th
                rowSpan={2}
                className={`${thBase} text-left cursor-pointer select-none group hover:bg-muted/80 transition-colors whitespace-nowrap border border-border`}
                onClick={() => handleSort('unitCode')}
              >
                <div className="flex items-center gap-1.5">
                  <span>หน่วยนับ</span>
                  {renderSortIcon('unitCode')}
                </div>
              </th>
              {branches.map((b) => (
                <th
                  key={b.key}
                  colSpan={2}
                  className={`${thBase} text-center border border-border`}
                >
                  <div>{b.name}</div>
                  <div className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground/70 mt-0.5">{periodLabel}</div>
                </th>
              ))}
              <th
                rowSpan={2}
                className={`${thBase} text-right cursor-pointer select-none group hover:bg-muted/80 transition-colors whitespace-nowrap border border-border`}
                onClick={() => handleSort('totalSalesAll')}
              >
                <div className="flex items-center gap-1.5 justify-end">
                  <span>รวมยอดขาย</span>
                  {renderSortIcon('totalSalesAll')}
                </div>
              </th>
            </tr>
            {/* Row 2: จำนวน | ยอดขาย per branch */}
            <tr className="bg-muted/50">
              {branches.map((b) => (
                <Fragment key={b.key}>
                  <th
                    className={`${thBase} text-right cursor-pointer select-none group hover:bg-muted/80 transition-colors border border-border`}
                    onClick={() => handleSort(`${b.key}_qty`)}
                  >
                    <div className="flex items-center gap-1.5 justify-end">
                      <span>จำนวน</span>
                      {renderSortIcon(`${b.key}_qty`)}
                    </div>
                  </th>
                  <th
                    className={`${thBase} text-right cursor-pointer select-none group hover:bg-muted/80 transition-colors border border-border`}
                    onClick={() => handleSort(`${b.key}_sales`)}
                  >
                    <div className="flex items-center gap-1.5 justify-end">
                      <span>ยอดขาย</span>
                      {renderSortIcon(`${b.key}_sales`)}
                    </div>
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {paginated.map((item, i) => (
              <tr key={`${item.itemCode}-${i}`} className="hover:bg-muted/30 transition-colors">
                <td className="px-2 py-2 sm:px-3 sm:py-3 text-xs sm:text-sm text-center text-muted-foreground border border-border">
                  {(page - 1) * pageSize + i + 1}
                </td>
                <td className="px-2 py-2 sm:px-3 sm:py-3 text-xs sm:text-sm font-mono text-muted-foreground whitespace-nowrap border border-border">
                  {item.itemCode as string}
                </td>
                <td className="px-2 py-2 sm:px-3 sm:py-3 text-xs sm:text-sm border border-border">
                  <div className="font-medium">{item.itemName as string}</div>
                </td>
                <td className="px-2 py-2 sm:px-3 sm:py-3 text-xs sm:text-sm text-muted-foreground whitespace-nowrap border border-border">
                  {item.unitCode as string}
                </td>
                {branches.map((b) => (
                  <Fragment key={b.key}>
                    <td className="px-2 py-2 sm:px-3 sm:py-3 text-xs sm:text-sm text-right border border-border">
                      {formatNumber(Number(item[`${b.key}_qty`] || 0))}
                    </td>
                    <td className="px-2 py-2 sm:px-3 sm:py-3 text-xs sm:text-sm text-right border border-border">
                      <span className="font-medium text-green-600">
                        ฿{formatCurrency(Number(item[`${b.key}_sales`] || 0))}
                      </span>
                    </td>
                  </Fragment>
                ))}
                <td className="px-2 py-2 sm:px-3 sm:py-3 text-xs sm:text-sm text-right border border-border">
                  <span className="font-semibold text-green-700">
                    ฿{formatCurrency(item.totalSalesAll as number)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot className="bg-muted/70">
            <tr className="font-semibold">
              <td colSpan={4} className="px-2 py-2 sm:px-3 sm:py-3 text-xs sm:text-sm font-bold border border-border">
                รวมทั้งหมด
              </td>
              {branches.map((b) => (
                <Fragment key={b.key}>
                  <td className="px-2 py-2 sm:px-3 sm:py-3 text-xs sm:text-sm text-right font-medium border border-border">
                    {formatNumber(data.reduce((s, r) => s + Number(r[`${b.key}_qty`] || 0), 0))}
                  </td>
                  <td className="px-2 py-2 sm:px-3 sm:py-3 text-xs sm:text-sm text-right border border-border">
                    <span className="font-medium text-green-600">
                      ฿{formatCurrency(data.reduce((s, r) => s + Number(r[`${b.key}_sales`] || 0), 0))}
                    </span>
                  </td>
                </Fragment>
              ))}
              <td className="px-2 py-2 sm:px-3 sm:py-3 text-xs sm:text-sm text-right border border-border">
                <span className="font-semibold text-green-700">
                  ฿{formatCurrency(data.reduce((s, r) => s + (r.totalSalesAll as number), 0))}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 py-3 sticky bottom-0 z-30 bg-background border-t border-border mt-auto">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="whitespace-nowrap">แสดง</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="px-2 py-1 text-xs border border-border rounded-md bg-background hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            >
              {[10, 15, 20, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="whitespace-nowrap">จาก {sorted.length} รายการ</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={page === 1} className="p-2 rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="หน้าแรก">
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="ก่อนหน้า">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {getPageNumbers().map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`min-w-[36px] min-h-[36px] px-2 rounded-md text-sm font-medium transition-colors ${page === p ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                {p}
              </button>
            ))}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="ถัดไป">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="p-2 rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="หน้าสุดท้าย">
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
