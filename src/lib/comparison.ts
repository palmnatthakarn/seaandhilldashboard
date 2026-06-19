// Period comparison utilities

import type { DateRange } from './data/types';
import { daysDifference } from './dateRanges';

export type ComparisonType = 'YoY' | 'MoM' | 'WoW' | 'DoD' | 'PreviousPeriod';

/**
 * Format date to YYYY-MM-DD string (local timezone)
 */
function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the previous period for a given date range
 *
 * @param dateRange - Current date range
 * @param comparisonType - Type of comparison
 * @returns Previous period date range
 */
export function getPreviousPeriod(
  dateRange: DateRange,
  comparisonType: ComparisonType = 'PreviousPeriod'
): DateRange {
  const start = new Date(dateRange.start + 'T00:00:00');
  const end = new Date(dateRange.end + 'T00:00:00');

  // Calculate duration of current period
  const duration = daysDifference(dateRange.start, dateRange.end);

  switch (comparisonType) {
    case 'YoY': { // Year over Year
      const prevStart = new Date(start);
      prevStart.setFullYear(prevStart.getFullYear() - 1);
      const prevEnd = new Date(end);
      prevEnd.setFullYear(prevEnd.getFullYear() - 1);
      return {
        start: formatDateString(prevStart),
        end: formatDateString(prevEnd),
      };
    }

    case 'MoM': { // Month over Month
      const prevStart = new Date(start);
      prevStart.setMonth(prevStart.getMonth() - 1);
      const prevEnd = new Date(end);
      prevEnd.setMonth(prevEnd.getMonth() - 1);
      return {
        start: formatDateString(prevStart),
        end: formatDateString(prevEnd),
      };
    }

    case 'WoW': { // Week over Week
      const prevStart = new Date(start);
      prevStart.setDate(prevStart.getDate() - 7);
      const prevEnd = new Date(end);
      prevEnd.setDate(prevEnd.getDate() - 7);
      return {
        start: formatDateString(prevStart),
        end: formatDateString(prevEnd),
      };
    }

    case 'DoD': { // Day over Day
      const prevStart = new Date(start);
      prevStart.setDate(prevStart.getDate() - 1);
      const prevEnd = new Date(end);
      prevEnd.setDate(prevEnd.getDate() - 1);
      return {
        start: formatDateString(prevStart),
        end: formatDateString(prevEnd),
      };
    }

    case 'PreviousPeriod': // งวดก่อนหน้า — ใช้ช่วงเวลาความยาวเท่ากัน ย้อนหลังติดกัน (ตรงกับ Dashboard)
    default: {
      const msPerDay = 86400000;
      const durationDays = Math.ceil((end.getTime() - start.getTime()) / msPerDay);
      const prevEnd = new Date(start.getTime() - msPerDay); // วันก่อน start
      const prevStart = new Date(prevEnd.getTime() - durationDays * msPerDay);
      return {
        start: formatDateString(prevStart),
        end: formatDateString(prevEnd),
      };
    }
  }
}

/**
 * Calculate growth between current and previous values
 *
 * @param current - Current period value
 * @param previous - Previous period value
 * @returns Growth object with value, percentage, and trend
 */
export function calculateGrowth(
  current: number,
  previous: number
): {
  value: number;
  percentage: number;
  trend: 'up' | 'down' | 'neutral';
} {
  const diff = current - previous;
  const percentage = previous !== 0 ? (diff / previous) * 100 : 0;

  let trend: 'up' | 'down' | 'neutral' = 'neutral';
  if (diff > 0) trend = 'up';
  else if (diff < 0) trend = 'down';

  return {
    value: diff,
    percentage,
    trend,
  };
}

/**
 * Format growth percentage for display
 *
 * @param percentage - Growth percentage
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string with + or - prefix
 */
export function formatGrowthPercentage(
  percentage: number,
  decimals: number = 1
): string {
  const sign = percentage >= 0 ? '+' : '';
  return `${sign}${percentage.toFixed(decimals)}%`;
}

/**
 * Determine comparison type based on date range duration
 *
 * @param dateRange - Date range to analyze
 * @returns Suggested comparison type
 */
export function suggestComparisonType(dateRange: DateRange): ComparisonType {
  const duration = daysDifference(dateRange.start, dateRange.end);

  if (duration === 0 || duration === 1) {
    return 'DoD'; // Day over Day
  } else if (duration >= 2 && duration <= 10) {
    return 'WoW'; // Week over Week
  } else if (duration >= 11 && duration <= 45) {
    return 'MoM'; // Month over Month
  } else {
    return 'YoY'; // Year over Year
  }
}

/**
 * Get comparison label in Thai
 */
export function getComparisonLabel(
  comparisonType: ComparisonType,
  locale: 'th' | 'en' = 'th'
): string {
  const labels = {
    th: {
      YoY: 'เทียบกับปีที่แล้ว',
      MoM: 'เทียบกับเดือนที่แล้ว',
      WoW: 'เทียบกับสัปดาห์ที่แล้ว',
      DoD: 'เทียบกับเมื่อวาน',
      PreviousPeriod: 'เทียบกับงวดก่อน',
    },
    en: {
      YoY: 'vs. Last Year',
      MoM: 'vs. Last Month',
      WoW: 'vs. Last Week',
      DoD: 'vs. Yesterday',
      PreviousPeriod: 'vs. Previous Period',
    },
  };

  return labels[locale][comparisonType];
}
