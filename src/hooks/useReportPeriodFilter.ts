import { useState } from 'react';
import {
  createPeriodFilterState,
  type ReportPeriodFilterState,
  type ViewMode,
  type PeriodType,
} from '@/components/ReportPeriodFilter';

export function useReportPeriodFilter(initial?: Partial<ReportPeriodFilterState>) {
  const [filter, setFilter] = useState<ReportPeriodFilterState>(() =>
    createPeriodFilterState(initial)
  );
  return { filter, setFilter };
}

export type { ReportPeriodFilterState, ViewMode, PeriodType };
