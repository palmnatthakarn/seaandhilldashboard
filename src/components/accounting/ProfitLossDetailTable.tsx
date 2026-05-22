'use client';

import { formatCurrency, formatMonth } from '@/lib/formatters';

export interface PLDetailRow {
  branchKey?: string;
  accountType: 'INCOME' | 'EXPENSES';
  accountCode: string;
  accountName: string;
  /** plGroup จาก API: INCOME | COGS | OPERATING | OTHER_EXPENSE */
  plGroup: string;
  month: string;
  amount: number;
}

export type PLViewMode = 'normal' | 'comparison';
export type PLPeriodType = 'monthly' | 'quarterly' | 'half-yearly' | 'yearly';

export type PLBranchColumn = {
  key: string;
  name: string;
};

interface ProfitLossDetailTableProps {
  rows: PLDetailRow[];
  loading?: boolean;
  viewMode?: PLViewMode;
  periodType?: PLPeriodType;
  selectedPeriods?: string[];
  comparePeriodA?: string;
  comparePeriodB?: string;
  branches?: PLBranchColumn[];
}

type AccountEntry = {
  plGroup: string;
  accountCode: string;
  accountName: string;
  byPeriod: Record<string, number>;
};

export function ProfitLossDetailTable({
  rows,
  loading,
  viewMode = 'normal',
  periodType = 'monthly',
  selectedPeriods = [],
  comparePeriodA,
  comparePeriodB,
  branches = [],
}: ProfitLossDetailTableProps) {
  if (loading) {
    return (
      <div className="space-y-2 py-4">
        {[...Array(12)].map((_, i) => (
          <div key={i} className="h-8 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        ไม่มีข้อมูลงบกำไรขาดทุน
      </div>
    );
  }

  // ── Helpers ──
  const getPeriodKey = (monthStr: string) => {
    if (periodType === 'yearly') return monthStr.substring(0, 4);
    return monthStr; // monthly and quarterly both display as individual months
  };

  const getQuarterStr = (monthStr: string) => {
    const y = monthStr.substring(0, 4);
    const m = parseInt(monthStr.substring(5, 7), 10);
    const q = Math.ceil(m / 3);
    return `${y}-Q${q}`;
  };

  const getHalfYearStr = (monthStr: string) => {
    const y = monthStr.substring(0, 4);
    const m = parseInt(monthStr.substring(5, 7), 10);
    return `${y}-H${m <= 6 ? 1 : 2}`;
  };

  const isKeyInPeriodFilter = (pKey: string, filterStr: string) => {
    if (periodType === 'quarterly') {
      return pKey.includes('-') && getQuarterStr(pKey) === filterStr;
    }
    if (periodType === 'half-yearly') {
      return pKey.includes('-') && getHalfYearStr(pKey) === filterStr;
    }
    return pKey === filterStr;
  };

  const formatPeriodLabel = (pKey: string) => {
    if (periodType === 'yearly') return pKey;
    return formatMonth(pKey); // Display as month name
  };

  // ── Group by (plGroup, accountCode) ──
  const rowBranchKeys = Array.from(new Set(rows.map((r) => r.branchKey).filter(Boolean))) as string[];
  const comparisonBranches = (branches.length > 0 ? branches : rowBranchKeys.map((key) => ({ key, name: key })))
    .filter((branch) => rowBranchKeys.includes(branch.key));
  const showBranchComparison = viewMode === 'comparison' && comparisonBranches.length > 0;

  const accountMap = new Map<string, AccountEntry>();
  for (const r of rows) {
    const branchKey = showBranchComparison ? (r.branchKey || 'UNKNOWN') : 'ALL';
    const key = `${branchKey}__${r.plGroup}__${r.accountCode}`;
    if (!accountMap.has(key)) {
      accountMap.set(key, { plGroup: r.plGroup, accountCode: r.accountCode, accountName: r.accountName, byPeriod: {} });
    }
    const e = accountMap.get(key)!;
    const pKey = getPeriodKey(r.month);
    e.byPeriod[pKey] = (e.byPeriod[pKey] || 0) + r.amount;
  }

  const allAvailableKeys = Array.from(new Set(rows.map((r) => getPeriodKey(r.month)))).sort();

  let displayPeriods: string[] = [];
  let periodsA: string[] = [];
  let periodsB: string[] = [];

  if (viewMode === 'normal') {
    if (selectedPeriods.length > 0) {
      displayPeriods = allAvailableKeys.filter((p) =>
        selectedPeriods.some((filter) => isKeyInPeriodFilter(p, filter))
      );
    } else {
      displayPeriods = allAvailableKeys;
    }
  } else {
    // comparison mode
    if (comparePeriodA) {
      periodsA = allAvailableKeys.filter((p) => isKeyInPeriodFilter(p, comparePeriodA));
    }
    if (comparePeriodB) {
      periodsB = allAvailableKeys.filter((p) => isKeyInPeriodFilter(p, comparePeriodB));
    }
    // เรียงเดือนของ A ตามด้วยเดือนของ B เสมอ เพื่อให้สามารถจัดกลุ่มคอลัมน์ A และ B ได้
    displayPeriods = [...periodsA, ...periodsB];
  }

  const all = Array.from(accountMap.values());
  const incomeAccounts    = all.filter((a) => a.plGroup === 'INCOME').sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  const cogsAccounts      = all.filter((a) => a.plGroup === 'COGS').sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  const operatingAccounts = all.filter((a) => a.plGroup === 'OPERATING').sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  const otherExpAccounts  = all.filter((a) => a.plGroup === 'OTHER_EXPENSE').sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  // ── Aggregation helpers ──
  const sumByPeriod = (accounts: AccountEntry[], pKey: string) =>
    accounts.reduce((s, a) => s + (a.byPeriod[pKey] || 0), 0);

  const sumForPeriods = (accounts: AccountEntry[], periods: string[]) =>
    periods.reduce((sum, p) => sum + sumByPeriod(accounts, p), 0);

  const grandSum = (accounts: AccountEntry[]) => sumForPeriods(accounts, displayPeriods);

  const diffAmount = (accounts: AccountEntry[]) => {
    if (viewMode !== 'comparison') return 0;
    return sumForPeriods(accounts, periodsB) - sumForPeriods(accounts, periodsA);
  };

  const totalRevenue    = (p: string) => sumByPeriod(incomeAccounts, p);
  const totalCOGS       = (p: string) => sumByPeriod(cogsAccounts, p);
  const totalOperating  = (p: string) => sumByPeriod(operatingAccounts, p);
  const totalOtherExp   = (p: string) => sumByPeriod(otherExpAccounts, p);
  const grossProfit     = (p: string) => totalRevenue(p) - totalCOGS(p);
  const netProfit       = (p: string) => grossProfit(p) - totalOperating(p) - totalOtherExp(p);

  const grandRevenue   = viewMode === 'comparison' ? diffAmount(incomeAccounts) : grandSum(incomeAccounts);
  const grandCOGS      = viewMode === 'comparison' ? diffAmount(cogsAccounts) : grandSum(cogsAccounts);
  const grandOperating = viewMode === 'comparison' ? diffAmount(operatingAccounts) : grandSum(operatingAccounts);
  const grandOtherExp  = viewMode === 'comparison' ? diffAmount(otherExpAccounts) : grandSum(otherExpAccounts);
  
  const grandGross     = viewMode === 'comparison' 
    ? (sumForPeriods(incomeAccounts, periodsB) - sumForPeriods(cogsAccounts, periodsB)) - 
      (sumForPeriods(incomeAccounts, periodsA) - sumForPeriods(cogsAccounts, periodsA))
    : grandRevenue - grandCOGS;
    
  const grandNet       = viewMode === 'comparison'
    ? (
        (sumForPeriods(incomeAccounts, periodsB) - sumForPeriods(cogsAccounts, periodsB) - sumForPeriods(operatingAccounts, periodsB) - sumForPeriods(otherExpAccounts, periodsB)) - 
        (sumForPeriods(incomeAccounts, periodsA) - sumForPeriods(cogsAccounts, periodsA) - sumForPeriods(operatingAccounts, periodsA) - sumForPeriods(otherExpAccounts, periodsA))
      )
    : grandGross - grandOperating - grandOtherExp;

  const fmt = (v: number) => (v !== 0 ? formatCurrency(v) : '-');

  // ── CSS helpers ──
  const cellCls  = 'relative z-0 px-4 py-2 text-right tabular-nums text-sm whitespace-nowrap min-w-[130px]';
  const stickyLabelBase = 'sticky left-0 z-30 min-w-[320px] w-[320px] max-w-[320px] bg-background';
  const labelCls = `${stickyLabelBase} px-12 py-2 text-sm`;
  const tableColSpan = showBranchComparison
    ? 1 + (comparisonBranches.length * displayPeriods.length) + 2
    : displayPeriods.length + (viewMode === 'normal' ? 2 : 3);

  const branchValue = (branchKey: string, group: string, accountCode: string, period: string) =>
    accountMap.get(`${branchKey}__${group}__${accountCode}`)?.byPeriod[period] || 0;

  const renderBranchSummaryCells = (valuesForBranch: (branchKey: string, period: string) => number, className = '') => {
    const branchTotals = comparisonBranches.map((branch) =>
      displayPeriods.reduce((sum, period) => sum + valuesForBranch(branch.key, period), 0)
    );
    const total = branchTotals.reduce((sum, value) => sum + value, 0);
    const diff = branchTotals.length >= 2 ? branchTotals[branchTotals.length - 1] - branchTotals[0] : 0;

    return (
      <>
        <td className={`${cellCls} font-medium border-l border-border/40 ${className}`}>{fmt(total)}</td>
        <td className={`${cellCls} font-medium border-l border-border/40 ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : ''} ${className}`}>
          {diff > 0 ? '+' : ''}{fmt(diff)}
        </td>
      </>
    );
  };

  // ── Shared render helpers ──
  const SectionHeader = ({ label }: { label: string }) => (
    <tr className="border-b border-border bg-muted/10">
      <td
        className={`${stickyLabelBase} px-4 py-2 font-semibold text-foreground text-xs uppercase tracking-wider`}
      >
        {label}
      </td>
      <td colSpan={tableColSpan - 1} className="bg-muted/10" />
    </tr>
  );

  const AccountRow = ({ acc }: { acc: AccountEntry }) => {
    let rowTotal = 0;
    let diff = 0;

    if (viewMode === 'normal') {
      rowTotal = displayPeriods.reduce((s, p) => s + (acc.byPeriod[p] || 0), 0);
    } else if (viewMode === 'comparison') {
      const a = periodsA.reduce((s, p) => s + (acc.byPeriod[p] || 0), 0);
      const b = periodsB.reduce((s, p) => s + (acc.byPeriod[p] || 0), 0);
      diff = b - a;
      rowTotal = a + b;
    }

    return (
      <tr className="border-b border-border/40 hover:bg-muted/20 transition-colors">
        <td className={labelCls}>
          <span className="text-foreground">{acc.accountName}</span>
          <span className="block text-xs text-muted-foreground font-mono">{acc.accountCode}</span>
        </td>
        {displayPeriods.map((p, i) => {
          const isFirstB = viewMode === 'comparison' && i === periodsA.length;
          const borderCls = isFirstB ? 'border-l border-border/40' : '';
          return (
            <td key={`${p}-${i}`} className={`${cellCls} ${borderCls}`}>{fmt(acc.byPeriod[p] || 0)}</td>
          );
        })}
        {viewMode === 'normal' ? (
          <td className={`${cellCls} font-medium`}>{fmt(rowTotal)}</td>
        ) : (
          <>
            <td className={`${cellCls} font-medium border-l border-border/40`}>{fmt(rowTotal)}</td>
            <td className={`${cellCls} font-medium border-l border-border/40 ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : ''}`}>
              {diff > 0 ? '+' : ''}{fmt(diff)}
            </td>
          </>
        )}
      </tr>
    );
  };

  const SubtotalRow = ({
    label, values, diffFunc, grand, doubleBorder = false,
  }: {
    label: string; values: (p: string) => number; diffFunc?: () => number; grand: number;
    doubleBorder?: boolean;
  }) => {
    let diff = 0;
    let rowTotal = 0;
    if (viewMode === 'comparison') {
      if (diffFunc) diff = diffFunc();
      const a = periodsA.reduce((s, p) => s + values(p), 0);
      const b = periodsB.reduce((s, p) => s + values(p), 0);
      rowTotal = a + b;
    }

    return (
      <tr className={`bg-muted/7 ${doubleBorder ? 'border-b-1' : 'border-b'} border-border`}>
        <td className={`${stickyLabelBase} px-6 py-2 text-xs font-bold text-foreground`}>
          {label}
        </td>
        {displayPeriods.map((p, i) => {
          const isFirstB = viewMode === 'comparison' && i === periodsA.length;
          const borderCls = isFirstB ? 'border-l border-border/40' : '';
          return (
            <td key={`${p}-${i}`} className={`${cellCls} text-xs py-2 font-bold ${borderCls}`}>
              {fmt(values(p))}
            </td>
          );
        })}
        {viewMode === 'normal' ? (
          <td className={`${cellCls} text-xs py-2 font-bold`}>
            {fmt(grand)}
          </td>
        ) : (
          <>
            <td className={`${cellCls} text-xs py-2 font-bold border-l border-border/40`}>
              {fmt(rowTotal)}
            </td>
            <td className={`${cellCls} text-xs py-2 font-bold border-l border-border/40 ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : ''}`}>
              {diff > 0 ? '+' : ''}{fmt(diff)}
            </td>
          </>
        )}
      </tr>
    );
  };

  const NetRow = ({ label, values, grand }: { label: string; values: (p: string) => number; grand: number }) => {
    let diff = 0;
    let rowTotal = 0;
    if (viewMode === 'comparison') {
      const a = periodsA.reduce((s, p) => s + values(p), 0);
      const b = periodsB.reduce((s, p) => s + values(p), 0);
      diff = b - a;
      rowTotal = a + b;
    }

    return (
      <tr className="border-t border-border font-bold">
        <td className={`${stickyLabelBase} px-4 py-3 text-sm`}>{label}</td>
        {displayPeriods.map((p, i) => {
          const v = values(p);
          const isFirstB = viewMode === 'comparison' && i === periodsA.length;
          const borderCls = isFirstB ? 'border-l border-border/40' : '';
          return (
            <td key={`${p}-${i}`} className={`${cellCls} py-3 ${borderCls} ${v < 0 ? 'text-destructive' : ''}`}>
              {v !== 0 ? formatCurrency(v) : '-'}
            </td>
          );
        })}
        {viewMode === 'normal' ? (
          <td className={`${cellCls} py-3 font-bold text-base ${grand < 0 ? 'text-destructive' : ''}`}>
            {formatCurrency(grand)}
          </td>
        ) : (
          <>
            <td className={`${cellCls} py-3 font-bold text-base border-l border-border/40 ${rowTotal < 0 ? 'text-destructive' : ''}`}>
              {formatCurrency(rowTotal)}
            </td>
            <td className={`${cellCls} py-3 font-bold text-base border-l border-border/40 ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : ''}`}>
              {diff > 0 ? '+' : ''}{formatCurrency(diff)}
            </td>
          </>
        )}
      </tr>
    );
  };

  const uniqueAccounts = (group: string) => Array.from(
    new Map(all.filter((account) => account.plGroup === group).map((account) => [account.accountCode, account])).values()
  ).sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const branchGroupValue = (branchKey: string, group: string, period: string) => {
    let sum = 0;
    for (const [key, account] of accountMap.entries()) {
      if (key.startsWith(`${branchKey}__${group}__`)) {
        sum += account.byPeriod[period] || 0;
      }
    }
    return sum;
  };

  const branchRevenue = (branchKey: string, period: string) => branchGroupValue(branchKey, 'INCOME', period);
  const branchCOGS = (branchKey: string, period: string) => branchGroupValue(branchKey, 'COGS', period);
  const branchOperating = (branchKey: string, period: string) => branchGroupValue(branchKey, 'OPERATING', period);
  const branchOtherExp = (branchKey: string, period: string) => branchGroupValue(branchKey, 'OTHER_EXPENSE', period);
  const branchGrossProfit = (branchKey: string, period: string) => branchRevenue(branchKey, period) - branchCOGS(branchKey, period);
  const branchNetProfit = (branchKey: string, period: string) =>
    branchGrossProfit(branchKey, period) - branchOperating(branchKey, period) - branchOtherExp(branchKey, period);

  const BranchAccountRow = ({ account, group }: { account: AccountEntry; group: string }) => (
    <tr className="border-b border-border/40 hover:bg-muted/20 transition-colors">
      <td className={labelCls}>
        <span className="text-foreground">{account.accountName}</span>
        <span className="block text-xs text-muted-foreground font-mono">{account.accountCode}</span>
      </td>
      {comparisonBranches.map((branch) =>
        displayPeriods.map((period, index) => (
          <td
            key={`${branch.key}-${account.accountCode}-${period}-${index}`}
            className={`${cellCls} ${index === 0 ? 'border-l border-border/40' : ''}`}
          >
            {fmt(branchValue(branch.key, group, account.accountCode, period))}
          </td>
        ))
      )}
      {renderBranchSummaryCells((branchKey, period) => branchValue(branchKey, group, account.accountCode, period))}
    </tr>
  );

  const BranchValueRow = ({ label, values, strong = false }: {
    label: string;
    values: (branchKey: string, period: string) => number;
    strong?: boolean;
  }) => (
    <tr className={`${strong ? 'border-t border-border font-bold' : 'border-b border-border bg-muted/5 font-bold'}`}>
      <td className={`${stickyLabelBase} ${strong ? 'px-4 py-3 text-sm' : 'px-6 py-2 text-xs'}`}>
        {label}
      </td>
      {comparisonBranches.map((branch) =>
        displayPeriods.map((period, index) => {
          const value = values(branch.key, period);
          return (
            <td
              key={`${branch.key}-${label}-${period}-${index}`}
              className={`${cellCls} ${strong ? 'py-3' : 'text-xs py-2 font-bold'} ${index === 0 ? 'border-l border-border/40' : ''} ${value < 0 ? 'text-destructive' : ''}`}
            >
              {fmt(value)}
            </td>
          );
        })
      )}
      {renderBranchSummaryCells(values, strong ? 'py-3 text-base font-bold' : 'text-xs py-2 font-bold')}
    </tr>
  );

  return (
    <div className="relative isolate overflow-auto w-full">
      <table className="w-full text-sm border-separate border-spacing-0">
        {/* ── Header ── */}
        <thead>
          {showBranchComparison && (
            <tr className="border-b border-border text-xs text-muted-foreground bg-muted/10">
              <th className={`${labelCls} text-center font-medium py-2`}></th>
              {comparisonBranches.map((branch) => (
                <th key={branch.key} colSpan={displayPeriods.length} className="text-center font-semibold py-2 border-l border-border/40">
                  {branch.name}
                </th>
              ))}
              <th colSpan={2} className="border-l border-border"></th>
            </tr>
          )}
          {viewMode === 'comparison' && !showBranchComparison && (
            <tr className="border-b border-border text-xs text-muted-foreground bg-muted/10">
              <th className={`${labelCls} text-center font-medium py-2`}></th>
              {periodsA.length > 0 && (
                <th colSpan={periodsA.length} className="text-center font-semibold py-2">
                  {comparePeriodA || 'ช่วงเวลา (A)'}
                </th>
              )}
              {periodsB.length > 0 && (
                <th colSpan={periodsB.length} className="text-center font-semibold py-2 border-l border-border">
                  {comparePeriodB || 'ช่วงเวลา (B)'}
                </th>
              )}
              <th colSpan={2} className="border-l border-border"></th>
            </tr>
          )}
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className={`${labelCls} text-center font-medium py-3`}>รายการ</th>
            {showBranchComparison
              ? comparisonBranches.map((branch) =>
                  displayPeriods.map((p, i) => (
                    <th key={`${branch.key}-${p}-${i}`} className={`${cellCls} font-medium py-3 ${i === 0 ? 'border-l border-border' : ''}`}>
                      {formatPeriodLabel(p)}
                    </th>
                  ))
                )
              : displayPeriods.map((p, i) => {
                  const isFirstB = viewMode === 'comparison' && i === periodsA.length;
                  const borderCls = isFirstB ? 'border-l border-border' : '';
                  return (
                    <th key={`${p}-${i}`} className={`${cellCls} font-medium py-3 ${borderCls}`}>
                      {formatPeriodLabel(p)}
                    </th>
                  );
                })}
            {viewMode === 'normal' ? (
              <th className={`${cellCls} font-semibold py-3`}>รวม</th>
            ) : (
              <>
                <th className={`${cellCls} font-semibold py-3 border-l border-border`}>ผลรวม</th>
                <th className={`${cellCls} font-semibold py-3 border-l border-border`}>ผลต่าง</th>
              </>
            )}
          </tr>
        </thead>

        <tbody>
          {showBranchComparison ? (
            <>
              <SectionHeader label="รายได้" />
              {uniqueAccounts('INCOME').map((acc) => <BranchAccountRow key={acc.accountCode} account={acc} group="INCOME" />)}
              <BranchValueRow label="รายได้รวม" values={branchRevenue} />

              <SectionHeader label="ต้นทุนขาย และหรือต้นทุนการให้บริการ" />
              {uniqueAccounts('COGS').map((acc) => <BranchAccountRow key={acc.accountCode} account={acc} group="COGS" />)}
              <BranchValueRow label="รวมต้นทุนขาย และหรือต้นทุนการให้บริการ" values={branchCOGS} />

              <BranchValueRow label="กำไรขั้นต้น" values={branchGrossProfit} strong />

              <SectionHeader label="ค่าใช้จ่ายในการบริหาร" />
              {uniqueAccounts('OPERATING').map((acc) => <BranchAccountRow key={acc.accountCode} account={acc} group="OPERATING" />)}
              <BranchValueRow label="รวมค่าใช้จ่ายในการบริหาร" values={branchOperating} />

              {uniqueAccounts('OTHER_EXPENSE').length > 0 && (
                <>
                  <SectionHeader label="ค่าใช้จ่ายอื่น" />
                  {uniqueAccounts('OTHER_EXPENSE').map((acc) => <BranchAccountRow key={acc.accountCode} account={acc} group="OTHER_EXPENSE" />)}
                  <BranchValueRow label="รวมค่าใช้จ่ายอื่น" values={branchOtherExp} />
                </>
              )}

              <BranchValueRow label="กำไร (ขาดทุน) สุทธิ" values={branchNetProfit} strong />
            </>
          ) : (
            <>
          {/* ═══════ INCOME ═══════ */}
          <SectionHeader label="รายได้" />
          {incomeAccounts.map((acc) => <AccountRow key={acc.accountCode} acc={acc} />)}
          <SubtotalRow 
            label="รายได้รวม" 
            values={totalRevenue} 
            grand={grandRevenue} 
            diffFunc={() => diffAmount(incomeAccounts)}
            doubleBorder 
          />

          {/* ═══════ COGS ═══════ */}
          <SectionHeader label="ต้นทุนขาย และหรือต้นทุนการให้บริการ" />
          {cogsAccounts.map((acc) => <AccountRow key={acc.accountCode} acc={acc} />)}
          <SubtotalRow 
            label="รวมต้นทุนขาย และหรือต้นทุนการให้บริการ" 
            values={totalCOGS} 
            grand={grandCOGS} 
            diffFunc={() => diffAmount(cogsAccounts)}
            doubleBorder 
          />

          {/* ═══════ GROSS PROFIT ═══════ */}
          <NetRow label="กำไรขั้นต้น" values={grossProfit} grand={grandGross} />

          {/* ═══════ OPERATING EXPENSES ═══════ */}
          <SectionHeader label="ค่าใช้จ่ายในการบริหาร" />
          {operatingAccounts.map((acc) => <AccountRow key={acc.accountCode} acc={acc} />)}
          <SubtotalRow 
            label="รวมค่าใช้จ่ายในการบริหาร" 
            values={totalOperating} 
            grand={grandOperating} 
            diffFunc={() => diffAmount(operatingAccounts)}
            doubleBorder 
          />

          {/* ═══════ OTHER EXPENSES ═══════ */}
          {otherExpAccounts.length > 0 && (
            <>
              <SectionHeader label="ค่าใช้จ่ายอื่น" />
              {otherExpAccounts.map((acc) => <AccountRow key={acc.accountCode} acc={acc} />)}
              <SubtotalRow 
                label="รวมค่าใช้จ่ายอื่น" 
                values={totalOtherExp} 
                grand={grandOtherExp} 
                diffFunc={() => diffAmount(otherExpAccounts)}
                doubleBorder 
              />
            </>
          )}

          {/* ═══════ NET PROFIT ═══════ */}
          <NetRow label="กำไร (ขาดทุน) สุทธิ" values={netProfit} grand={grandNet} />
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
