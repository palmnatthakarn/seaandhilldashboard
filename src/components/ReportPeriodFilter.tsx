'use client';

import { useMemo } from 'react';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { formatMonth } from '@/lib/formatters';

export type ViewMode = 'normal' | 'comparison';
export type PeriodType = 'monthly' | 'quarterly' | 'half-yearly' | 'yearly';

export interface ReportPeriodFilterState {
  viewMode: ViewMode;
  periodType: PeriodType;
  selectedPeriod: string;
  compareA: string;
  compareB: string;
}

export function createPeriodFilterState(initial?: Partial<ReportPeriodFilterState>): ReportPeriodFilterState {
  return {
    viewMode: 'normal',
    periodType: 'monthly',
    selectedPeriod: '',
    compareA: '',
    compareB: '',
    ...initial,
  };
}

export function getPeriodKey(monthStr: string, periodType: PeriodType): string {
  if (periodType === 'yearly') return monthStr.substring(0, 4);
  if (periodType === 'quarterly') {
    const y = monthStr.substring(0, 4);
    const m = parseInt(monthStr.substring(5, 7), 10);
    return `${y}-Q${Math.ceil(m / 3)}`;
  }
  if (periodType === 'half-yearly') {
    const y = monthStr.substring(0, 4);
    const m = parseInt(monthStr.substring(5, 7), 10);
    return `${y}-H${m <= 6 ? 1 : 2}`;
  }
  return monthStr;
}

export function formatPeriodLabel(pKey: string, periodType: PeriodType): string {
  if (periodType === 'yearly') return pKey;
  if (periodType === 'quarterly') {
    const [year, q] = pKey.split('-Q');
    return `ไตรมาส ${q}/${year}`;
  }
  if (periodType === 'half-yearly') {
    const [year, h] = pKey.split('-H');
    return `ครึ่งปี ${h}/${year}`;
  }
  return formatMonth(pKey);
}

export function getMonthsFromDateRange(start: string, end: string): string[] {
  const months: string[] = [];
  const startDate = new Date(start.substring(0, 7) + '-01');
  const endDate = new Date(end.substring(0, 7) + '-01');
  const current = new Date(startDate);
  while (current <= endDate) {
    months.push(current.toISOString().substring(0, 7));
    current.setMonth(current.getMonth() + 1);
  }
  return months;
}

export function matchesReportPeriod(monthStr: string, filter: ReportPeriodFilterState): boolean {
  const key = getPeriodKey(monthStr, filter.periodType);
  if (filter.viewMode === 'normal') {
    return !filter.selectedPeriod || key === filter.selectedPeriod;
  }
  if (!filter.compareA && !filter.compareB) return true;
  return (filter.compareA !== '' && key === filter.compareA) ||
    (filter.compareB !== '' && key === filter.compareB);
}

export function filterRowsByReportPeriod<T>(
  rows: T[],
  getMonth: (row: T) => string,
  filter: ReportPeriodFilterState
): T[] {
  return rows.filter((row) => {
    const month = getMonth(row);
    return month ? matchesReportPeriod(month, filter) : true;
  });
}

export function derivePeriodOptions(availableMonths: string[], periodType: PeriodType) {
  const keys = Array.from(new Set(availableMonths.map((m) => getPeriodKey(m, periodType)))).sort();
  return keys.map((k) => ({ value: k, label: formatPeriodLabel(k, periodType) }));
}

interface ReportPeriodFilterProps {
  value: ReportPeriodFilterState;
  onChange: (next: ReportPeriodFilterState) => void;
  availableMonths: string[];
  className?: string;
}

export function ReportPeriodFilter({ value, onChange, availableMonths, className = '' }: ReportPeriodFilterProps) {
  const periodOptions = useMemo(
    () => derivePeriodOptions(availableMonths, value.periodType),
    [availableMonths, value.periodType]
  );

  const update = (patch: Partial<ReportPeriodFilterState>) => onChange({ ...value, ...patch });

  const resetPeriods = (patch: Partial<ReportPeriodFilterState>) =>
    update({ selectedPeriod: '', compareA: '', compareB: '', ...patch });

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">มุมมอง:</span>
        <SearchableSelect
          value={value.viewMode}
          onChange={(v) => resetPeriods({ viewMode: v as ViewMode })}
          options={[
            { value: 'normal', label: 'ปกติ' },
            { value: 'comparison', label: 'เปรียบเทียบ' },
          ]}
          className="w-[120px]"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">ความถี่:</span>
        <SearchableSelect
          value={value.periodType}
          onChange={(v) => resetPeriods({ periodType: v as PeriodType })}
          options={[
            { value: 'monthly', label: 'รายเดือน' },
            { value: 'quarterly', label: 'รายไตรมาส' },
            { value: 'half-yearly', label: 'รายครึ่งปี' },
            { value: 'yearly', label: 'รายปี' },
          ]}
          className="w-[120px]"
        />
      </div>

      {value.viewMode === 'normal' && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">ช่วง:</span>
          <SearchableSelect
            value={value.selectedPeriod}
            onChange={(v) => update({ selectedPeriod: v })}
            options={[{ value: '', label: 'ทั้งหมด' }, ...periodOptions]}
            className="w-[150px]"
          />
        </div>
      )}

      {value.viewMode === 'comparison' && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">เทียบ:</span>
          <SearchableSelect
            value={value.compareA}
            onChange={(v) => update({ compareA: v })}
            options={[{ value: '', label: 'เลือกช่วง A' }, ...periodOptions]}
            className="w-[140px]"
          />
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">กับ</span>
          <SearchableSelect
            value={value.compareB}
            onChange={(v) => update({ compareB: v })}
            options={[{ value: '', label: 'เลือกช่วง B' }, ...periodOptions]}
            className="w-[140px]"
          />
        </div>
      )}
    </div>
  );
}
