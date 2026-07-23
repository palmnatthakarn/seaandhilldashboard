'use client';

import { useMemo, useRef, useState } from 'react';
import { Listbox } from '@headlessui/react';
import { motion } from 'framer-motion';
import { Calendar, ChevronDown } from 'lucide-react';
import { DATE_RANGES, type DateRangeKey } from '@/lib/dateRanges';
import { useDateRangeStore } from '@/store/useDateRangeStore';
import type { DateRange } from '@/lib/data/types';
import { cn } from '@/lib/utils';

// Helper functions to convert between YYYY-MM-DD and DD/MM/YYYY
function formatDateToDDMMYYYY(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

function parseDateFromDDMMYYYY(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('/');
  if (parts.length !== 3) return '';
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function isValidDDMMYYYY(dateStr: string): boolean {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return false;
  const [day, month] = dateStr.split('/');
  const d = Number(day);
  const m = Number(month);
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  return true;
}

function processDateInference(input: string): string {
  const cleanValue = input.replace(/\D/g, '');
  if (cleanValue.length === 4) {
    const dd = cleanValue.substring(0, 2);
    const mm = cleanValue.substring(2, 4);
    const yyyy = new Date().getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  if (cleanValue.length === 6) {
    const dd = cleanValue.substring(0, 2);
    const mm = cleanValue.substring(2, 4);
    const yy = cleanValue.substring(4, 6);
    return `${dd}/${mm}/20${yy}`;
  }
  if (cleanValue.length === 8) {
    const dd = cleanValue.substring(0, 2);
    const mm = cleanValue.substring(2, 4);
    const yyyy = cleanValue.substring(4, 8);
    return `${dd}/${mm}/${yyyy}`;
  }
  return input;
}

interface ComparisonDateFilterProps {
  // Still accept optional props for backward compatibility,
  // but default to using the global store if not provided
  value?: DateRange;
  onChange?: (range: DateRange) => void;
  defaultKey?: DateRangeKey;
  className?: string;
}

/**
 * Date filter สำหรับหน้าเปรียบเทียบ - ใช้ useQuery + Headless UI Listbox
 */
export function ComparisonDateFilter({
  value: valueProp,
  onChange: onChangeProp,
  defaultKey = 'THIS_MONTH',
  className = '',
}: ComparisonDateFilterProps) {
  const { dateRange: storeRange, setDateRange: setStoreRange } = useDateRangeStore();

  // Use store value unless prop is provided (for legacy usage)
  const value = valueProp ?? storeRange;
  const onChange = onChangeProp ?? setStoreRange;

  const [isCustomPanelOpen, setIsCustomPanelOpen] = useState(false);
  const [customStartDraft, setCustomStartDraft] = useState<{
    text: string;
    range: DateRange;
  } | null>(null);
  const [customEndDraft, setCustomEndDraft] = useState<{
    text: string;
    range: DateRange;
  } | null>(null);
  const startDateInputRef = useRef<HTMLInputElement>(null);
  const endDateInputRef = useRef<HTMLInputElement>(null);

  const selectedKey = useMemo(() => {
    if (!value.start || !value.end) return defaultKey;

    for (const [key, preset] of Object.entries(DATE_RANGES)) {
      if (key === 'CUSTOM') continue;
      const range = preset.getValue();
      if (range.start === value.start && range.end === value.end) {
        return key as DateRangeKey;
      }
    }

    return 'CUSTOM';
  }, [defaultKey, value.end, value.start]);

  const showCustom = selectedKey === 'CUSTOM' || isCustomPanelOpen;
  const customStartDisplay =
    customStartDraft?.range.start === value.start && customStartDraft.range.end === value.end
      ? customStartDraft.text
      : formatDateToDDMMYYYY(value.start);
  const customEndDisplay =
    customEndDraft?.range.start === value.start && customEndDraft.range.end === value.end
      ? customEndDraft.text
      : formatDateToDDMMYYYY(value.end);

  const handlePresetChange = (key: DateRangeKey) => {
    if (key === 'CUSTOM') {
      setIsCustomPanelOpen(true);
      setCustomStartDraft(null);
      setCustomEndDraft(null);
    } else {
      setIsCustomPanelOpen(false);
      const range = DATE_RANGES[key].getValue();
      onChange(range);
    }
  };

  const handleCustomStartTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const displayValue = e.target.value;
    setCustomStartDraft({ text: displayValue, range: value });

    if (isValidDDMMYYYY(displayValue)) {
      const parsed = parseDateFromDDMMYYYY(displayValue);
      onChange({
        start: parsed,
        end: value.end,
      });
    }
  };

  const handleCustomEndTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const displayValue = e.target.value;
    setCustomEndDraft({ text: displayValue, range: value });

    if (isValidDDMMYYYY(displayValue)) {
      const parsed = parseDateFromDDMMYYYY(displayValue);
      onChange({
        start: value.start,
        end: parsed,
      });
    }
  };

  const handleStartDatePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateValue = e.target.value;
    if (dateValue) {
      setCustomStartDraft({ text: formatDateToDDMMYYYY(dateValue), range: value });
      onChange({
        start: dateValue,
        end: value.end,
      });
    }
  };

  const handleEndDatePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateValue = e.target.value;
    if (dateValue) {
      setCustomEndDraft({ text: formatDateToDDMMYYYY(dateValue), range: value });
      onChange({
        start: value.start,
        end: dateValue,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, type: 'start' | 'end') => {
    if (e.key === 'Enter') {
      const displayValue = type === 'start' ? customStartDisplay : customEndDisplay;
      const inferredValue = processDateInference(displayValue);
      
      if (inferredValue !== displayValue) {
        if (type === 'start') {
          setCustomStartDraft({ text: inferredValue, range: value });
        } else {
          setCustomEndDraft({ text: inferredValue, range: value });
        }

        if (isValidDDMMYYYY(inferredValue)) {
          const parsed = parseDateFromDDMMYYYY(inferredValue);
          onChange({
            start: type === 'start' ? parsed : value.start,
            end: type === 'end' ? parsed : value.end,
          });
        }
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={`flex flex-col items-start sm:items-end gap-2 ${className}`}
    >
      <Listbox value={selectedKey} onChange={handlePresetChange}>
        <div className="relative w-full sm:w-[160px]">
          <Listbox.Button
            className={cn(
              'flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 w-full',
              'text-sm font-medium outline-none transition-all',
              'hover:border-primary focus:ring-2 focus:ring-primary cursor-pointer'
            )}
          >
            <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="flex-1 text-left">
              {DATE_RANGES[selectedKey]?.label || 'เลือกวันที่'}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </Listbox.Button>

          <motion.div layout>
            <Listbox.Options
              className={cn(
                'absolute z-50 mt-1 w-full sm:w-48 rounded-lg border border-border bg-background shadow-lg',
                'py-1 outline-none',
                'right-0'
              )}
            >
              {Object.entries(DATE_RANGES).map(([key, { label }], index) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Listbox.Option value={key as DateRangeKey}>
                    {({ active, selected }) => (
                      <motion.div
                        className={cn(
                          'px-3 py-2 text-sm cursor-pointer transition-colors',
                          active ? 'bg-primary/10 text-primary' : 'text-foreground',
                          selected && 'bg-primary/20 font-semibold'
                        )}
                        whileHover={{ paddingLeft: 16 }}
                      >
                        {label}
                      </motion.div>
                    )}
                  </Listbox.Option>
                </motion.div>
              ))}
            </Listbox.Options>
          </motion.div>
        </div>
      </Listbox>

      {/* Custom Date Inputs */}
      {showCustom && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto"
        >
          <div className="relative w-full sm:w-auto">
            <motion.input
              type="text"
              value={customStartDisplay}
              onChange={handleCustomStartTextChange}
              onKeyDown={(e) => handleKeyDown(e, 'start')}
              placeholder="DD/MM/YYYY"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={cn(
                'rounded-lg border border-border bg-background px-3 py-2 pr-9 text-sm outline-none',
                'focus:ring-2 focus:ring-primary w-full sm:w-36 transition-all'
              )}
            />
            <button
              type="button"
              onClick={() => startDateInputRef.current?.showPicker()}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded transition-colors"
            >
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </button>
            <input
              ref={startDateInputRef}
              type="date"
              value={value.start}
              onChange={handleStartDatePickerChange}
              className="absolute opacity-0 pointer-events-none inset-0 w-full h-full"
            />
          </div>
          <span className="text-sm text-center text-muted-foreground hidden sm:inline-block">ถึง</span>
          <div className="relative w-full sm:w-auto">
            <motion.input
              type="text"
              value={customEndDisplay}
              onChange={handleCustomEndTextChange}
              onKeyDown={(e) => handleKeyDown(e, 'end')}
              placeholder="DD/MM/YYYY"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={cn(
                'rounded-lg border border-border bg-background px-3 py-2 pr-9 text-sm outline-none',
                'focus:ring-2 focus:ring-primary w-full sm:w-36 transition-all'
              )}
            />
            <button
              type="button"
              onClick={() => endDateInputRef.current?.showPicker()}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded transition-colors"
            >
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </button>
            <input
              ref={endDateInputRef}
              type="date"
              value={value.end}
              onChange={handleEndDatePickerChange}
              className="absolute opacity-0 pointer-events-none inset-0 w-full h-full"
            />
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
