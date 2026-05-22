/**
 * Common formatting utilities for reports and data display
 */

/**
 * Format number as Thai currency (฿)
 * Shows decimals only when value has decimal part
 */
export const formatCurrency = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) return '0.00';
    return value.toLocaleString('th-TH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

/**
 * Format number with smart decimal display
 * Shows up to 2 decimals only when value has decimal part
 */
export const formatNumber = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) return '0.00';
    return value.toLocaleString('th-TH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

/**
 * Format integer (count/whole numbers only - no decimals)
 * Use for: orderCount, customerCount, itemCount, docCount, etc.
 */
export const formatInteger = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) return '0';
    return Math.floor(value).toLocaleString('th-TH', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
};

/**
 * Format quantity (may have decimals for weight/volume units)
 * Shows up to 2 decimals when needed
 */
export const formatQuantity = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) return '0.00';
    return value.toLocaleString('th-TH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

/**
 * Format date string to Thai short format (DD MMM YY)
 */
export const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', {
        day: '2-digit',
        month: 'short',
        year: '2-digit',
    });
};

/**
 * Format date string to Thai month format (MMMM YYYY)
 */
export const formatMonth = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', {
        month: 'long',
        year: 'numeric',
    });
};

/**
 * Format number as percentage with 1 decimal place
 */
export const formatPercent = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) return '0.0%';
    return value.toFixed(1) + '%';
};

/**
 * Format number as full Thai currency with ฿ prefix
 * Use in chart tooltips to show full numbers (e.g. ฿1,500,000.00)
 */
export const fmtFull = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) return '฿0.00';
    return `฿${value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Format count (integer) with Thai locale separators
 * Use in chart tooltips for non-currency counts
 */
export const fmtCount = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) return '0';
    return Math.round(value).toLocaleString('th-TH');
};
