'use client';

import { Document, Font, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import FileSaver from 'file-saver';
import type { ExcelSummaryConfig, SummaryType } from '@/lib/exportExcel';

const { saveAs } = FileSaver;

// Register Sarabun Thai font served from public/fonts/ (avoids CDN CORS / signed-URL issues)
Font.register({
  family: 'Sarabun',
  fonts: [
    { src: '/fonts/Sarabun-Regular.ttf', fontWeight: 'normal' },
    { src: '/fonts/Sarabun-Bold.ttf', fontWeight: 'bold' },
  ],
});

// Hyphenation callback — disable hyphenation for Thai text to prevent text breaking
Font.registerHyphenationCallback((word) => {
  // Return the word as-is without breaking
  return [word];
});

/**
 * Pre-warm the PDF renderer by generating a tiny blank document.
 * Call this early (e.g., on page mount) so fonts are cached before the user
 * clicks the export button, eliminating the first-click delay.
 */
let _prewarmed = false;
export async function prewarmPdfFonts(): Promise<void> {
  if (_prewarmed) return;
  _prewarmed = true;
  try {
    const warmDoc = (
      <Document>
        <Page size="A4" style={{ fontFamily: 'Sarabun', fontSize: 1 }}>
          <Text> </Text>
        </Page>
      </Document>
    );
    // Trigger font fetch + parse — discard the result, we only want the side-effect
    await pdf(warmDoc).toBlob();
  } catch {
    // Non-critical: silently ignore warm-up errors
    _prewarmed = false;
  }
}


const COLORS = {
  text: '#000000',
  border: '#222222',
  grid: '#D0D0D0',
  headerBg: '#E8E8E8',
  summaryBg: '#F5F5F5',
  white: '#FFFFFF',
  sectionBg: '#FAFAFA',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 12,
    fontSize: 8,
    fontFamily: 'Sarabun',
    backgroundColor: COLORS.white,
  },
  reportHeader: {
    marginBottom: 4,
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 2,
    width: '100%',
    paddingHorizontal: 10,
    maxWidth: '100%',
  },
  subtitle: {
    fontSize: 9,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 2,
    width: '100%',
    paddingHorizontal: 10,
    maxWidth: '100%',
  },
  topRightBlock: {
    position: 'absolute',
    top: 20,
    right: 14,
    alignItems: 'flex-end',
    width: 100,
  },
  topRightText: {
    fontSize: 8,
    color: COLORS.text,
    fontFamily: 'Sarabun',
  },
  metaRow: {
    marginTop: 6,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 5,
    width: '100%',
  },
  metaBlockLeft: {
    width: '100%',
    paddingRight: 0,
  },
  metaBlockRight: {
    width: '30%',
    alignItems: 'flex-end',
  },
  metaText: {
    fontSize: 8,
    color: COLORS.text,
    lineHeight: 1.4,
    fontFamily: 'Sarabun',
    maxWidth: '100%',
  },
  metaTextBold: {
    fontSize: 8,
    color: COLORS.text,
    lineHeight: 1.4,
    fontWeight: 'bold',
    fontFamily: 'Sarabun',
    maxWidth: '100%',
  },
  table: {
    width: '100%',
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.border,
    borderStyle: 'solid',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.grid,
    borderBottomStyle: 'solid',
    minHeight: 16,
  },
  headerRow: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.headerBg,
    minHeight: 20,
  },
  summaryRow: {
    backgroundColor: COLORS.summaryBg,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.grid,
    borderTopStyle: 'solid',
    minHeight: 18,
  },
  sectionRow: {
    backgroundColor: COLORS.sectionBg,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.grid,
    borderBottomStyle: 'solid',
    minHeight: 16,
  },
  cell: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    flexGrow: 1,
    flexBasis: 0,
    flexShrink: 1,
    justifyContent: 'center',
  },
  cellIndented: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    paddingLeft: 16,
    flexGrow: 1,
    flexBasis: 0,
    flexShrink: 1,
    justifyContent: 'center',
  },
  cellText: {
    fontFamily: 'Sarabun',
    fontSize: 8,
    color: COLORS.text,
    lineHeight: 1.35,
    letterSpacing: 0,
  },
  cellTextBold: {
    fontFamily: 'Sarabun',
    fontSize: 8,
    fontWeight: 'bold',
    color: COLORS.text,
    lineHeight: 1.35,
    letterSpacing: 0,
  },
  headerCellText: {
    fontFamily: 'Sarabun',
    fontSize: 8,
    fontWeight: 'bold',
    color: COLORS.text,
    lineHeight: 1.35,
    letterSpacing: 0,
  },
  summaryCellText: {
    fontFamily: 'Sarabun',
    fontSize: 8,
    fontWeight: 'bold',
    color: COLORS.text,
    lineHeight: 1.35,
    letterSpacing: 0,
  },
  sectionHeaderText: {
    fontFamily: 'Sarabun',
    fontSize: 8,
    fontWeight: 'bold',
    color: COLORS.text,
    lineHeight: 1.35,
    letterSpacing: 0,
  },
});

type PdfColumnGroup = {
  label: string;
  span: number;
};

export type PdfExportResult = {
  blob: Blob;
  filename: string;
};

declare global {
  interface Window {
    __PDF_EXPORT_PREVIEW_ONLY__?: boolean;
  }
}

function guardPdfText(value: string): string {
  if (!value || value === '-') return value;
  return `${value}\u00A0`;
}

function getRowValue(row: object, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

function calculateSummary<T extends object>(
  data: T[],
  key: string,
  type: SummaryType
): number {
  const values = data
    .map((row) => parseFloat(String(getRowValue(row, key) ?? '')))
    .filter((v) => !Number.isNaN(v));

  if (values.length === 0) return 0;

  switch (type) {
    case 'sum':
      return values.reduce((acc, val) => acc + val, 0);
    case 'avg':
      return values.reduce((acc, val) => acc + val, 0) / values.length;
    case 'count':
      return values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    default:
      return 0;
  }
}

function formatCellValue(
  value: unknown,
  key: string,
  numberColumns: string[],
  currencyColumns: string[],
  percentColumns: string[]
): string {
  // Handle null, undefined, or empty string
  if (value === null || value === undefined) return '-';
  if (value === '') return '-';

  // Handle string values that shouldn't be formatted as numbers
  if (typeof value === 'string') {
    // Check if it's a section header or label
    const trimmed = value.trim();
    if (trimmed === '') return '-';
    if (trimmed.includes('──') || trimmed.startsWith('รวม') || trimmed.includes('กำไร')) {
      return trimmed;
    }
    // Try to parse as number if it's in a numeric column
    if (numberColumns.includes(key) || currencyColumns.includes(key) || percentColumns.includes(key)) {
      const num = parseFloat(value);
      if (Number.isNaN(num)) return trimmed; // Return as-is if not a number
      // Continue to format as number below
      value = num;
    } else {
      return trimmed; // Return text as-is
    }
  }

  const num = typeof value === 'number' ? value : parseFloat(String(value));

  // If it's not a number, return as string
  if (Number.isNaN(num)) {
    return String(value);
  }

  // Format currency columns
  if (currencyColumns.includes(key)) {
    if (num === 0) return '-';
    const absNum = Math.abs(num);
    const formatted = absNum.toLocaleString('th-TH', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
    return num < 0 ? `(${formatted})` : formatted;
  }

  // Format percent columns
  if (percentColumns.includes(key)) {
    if (num === 0) return '-';
    return `${num.toFixed(2)}%`;
  }

  // Format number columns
  if (numberColumns.includes(key)) {
    if (num === 0) return '-';
    const absNum = Math.abs(num);
    const formatted = absNum.toLocaleString('th-TH', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
    return num < 0 ? `(${formatted})` : formatted;
  }

  // Return as string for non-numeric values
  return String(value);
}

/** Compute column widths based on both header and sampled content length */
function computeColumnWidths<T extends object>(
  headerKeys: string[],
  headerValues: string[],
  data: T[],
  numberColumns: string[],
  currencyColumns: string[],
  percentColumns: string[]
): number[] {
  const MIN_WEIGHT = 6;
  const sampledRows = data.slice(0, 100);
  const weights = headerValues.map((header, index) => {
    const key = headerKeys[index];
    
    // Special handling for first two columns (code and name)
    if (key === 'accountCode') {
      // Account code column - fixed small width
      return 9;
    }
    if (key === 'accountName') {
      // Account name column - larger fixed width for Thai text
      return 38;
    }
    
    // For other columns, calculate based on content
    let maxLen = header.length * 1.3; // Thai characters need more space

    for (const row of sampledRows) {
      const value = getRowValue(row, key);
      if (value === null || value === undefined || value === '') continue;
      
      // Format the value as it will appear in PDF
      const formatted = formatCellValue(value, key, numberColumns, currencyColumns, percentColumns);
      const len = formatted.length;
      if (len > maxLen) {
        maxLen = len;
      }
    }

    const isNumberCol = numberColumns.includes(key) || currencyColumns.includes(key) || percentColumns.includes(key);
    
    // Numeric columns need space for formatted numbers with commas
    if (isNumberCol) {
      return Math.max(Math.min(maxLen * 0.95, 16), MIN_WEIGHT + 1);
    }
    
    // Text columns
    return Math.max(Math.min(maxLen * 0.85, 40), MIN_WEIGHT);
  });

  const total = weights.reduce((s, w) => s + w, 0);
  return weights.map((w) => (w / total) * 100);
}

/** Format a Date to Thai locale string */
function thaiDatetime(): string {
  return new Date().toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extractCompanyName(subtitle?: string): string {
  if (!subtitle) return 'ไม่ระบุกิจการ';

  const match = subtitle.match(/กิจการ\s*:\s*(.*?)\s*(?:\||$)/);
  if (!match || !match[1]) return 'ไม่ระบุกิจการ';

  const companyName = match[1].trim();
  return companyName || 'ไม่ระบุกิจการ';
}

function stripCompanyFromSubtitle(subtitle?: string): string {
  if (!subtitle) return '';
  return subtitle.replace(/^\s*กิจการ\s*:\s*.*?\s*\|\s*/, '').trim();
}

function formatThaiDate(isoDate: string): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function localizeDateRangeText(text: string): string {
  return text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (dateStr) => formatThaiDate(dateStr));
}

export async function exportStyledPdfReport<T extends object>(options: {
  data: T[];
  headers: Record<string, string>;
  filename: string;
  title?: string;
  subtitle?: string;
  numberColumns?: string[];
  currencyColumns?: string[];
  percentColumns?: string[];
  summaryConfig?: ExcelSummaryConfig;
  columnGroups?: PdfColumnGroup[];
}): Promise<PdfExportResult | void> {
  const {
    data,
    headers,
    filename,
    title,
    subtitle,
    numberColumns = [],
    currencyColumns = [],
    percentColumns = [],
    summaryConfig,
    columnGroups,
  } = options;

  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  const headerKeys = Object.keys(headers);
  const headerValues = Object.values(headers);
  const colWidths = computeColumnWidths(headerKeys, headerValues, data, numberColumns, currencyColumns, percentColumns);
  const generatedAt = thaiDatetime();
  const companyName = extractCompanyName(subtitle);
  const cleanSubtitle = localizeDateRangeText(stripCompanyFromSubtitle(subtitle));

  const isNumberColumn = (key: string) =>
    numberColumns.includes(key) || currencyColumns.includes(key) || percentColumns.includes(key);

  // Helper functions to detect row types for P&L report
  const isSectionHeader = (row: T): boolean => {
    const codeKey = headerKeys.includes('accountCode') ? 'accountCode' : undefined;
    const nameKey = headerKeys.includes('accountName') ? 'accountName' : headerKeys[0];
    const codeValue = codeKey ? getRowValue(row, codeKey) : '';
    const nameValue = getRowValue(row, nameKey);
    
    // Section headers have no code and name starts with ──
    if (!codeValue || codeValue === '') {
      const nameStr = String(nameValue || '');
      return nameStr.includes('──');
    }
    return false;
  };

  const isSummaryRow = (row: T): boolean => {
    const codeKey = headerKeys.includes('accountCode') ? 'accountCode' : undefined;
    const nameKey = headerKeys.includes('accountName') ? 'accountName' : headerKeys[0];
    const codeValue = codeKey ? getRowValue(row, codeKey) : '';
    const nameValue = getRowValue(row, nameKey);
    
    // Summary rows have no code but name starts with รวม or กำไร
    if (!codeValue || codeValue === '') {
      const nameStr = String(nameValue || '');
      return nameStr.startsWith('รวม') || nameStr.endsWith('รวม') || nameStr.includes('กำไร');
    }
    return false;
  };

  const isAccountRow = (row: T): boolean => {
    const codeKey = headerKeys.includes('accountCode') ? 'accountCode' : undefined;
    if (!codeKey) {
      const nameKey = headerKeys.includes('accountName') ? 'accountName' : headerKeys[0];
      const nameValue = getRowValue(row, nameKey);
      return !!nameValue && nameValue !== '' && !isSectionHeader(row) && !isSummaryRow(row);
    }
    const codeValue = getRowValue(row, codeKey);
    
    // Account rows have a code
    return !!codeValue && codeValue !== '';
  };

  // Helper to detect blank rows
  const isBlankRow = (row: T): boolean => {
    return headerKeys.every(key => {
      const val = getRowValue(row, key);
      return val === null || val === undefined || val === '' || val === 0;
    });
  };

  const doc = (
    <Document
      title={title ?? filename}
      author="Sea & Hill Dashboard"
      creator="Sea & Hill Dashboard"
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.topRightBlock} fixed>
          <Text
            style={styles.topRightText}
            render={({ pageNumber, totalPages }) => `หน้า : ${pageNumber}/${totalPages}`}
          />
        </View>

        <View style={styles.reportHeader} fixed>
          {title ? (
            <View style={{ width: '100%', paddingHorizontal: 5 }}>
              <Text style={styles.title}>{guardPdfText(title)}</Text>
            </View>
          ) : null}
          {cleanSubtitle ? (
            <View style={{ width: '100%', paddingHorizontal: 5 }}>
              <Text style={styles.subtitle}>{guardPdfText(cleanSubtitle)}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.metaRow} fixed>
          <View style={styles.metaBlockLeft}>
            <View style={{ width: '100%', paddingRight: 5 }}>
              <Text style={styles.metaTextBold}>
                {guardPdfText(`ชื่อสถานประกอบการ : ${companyName}`)}
              </Text>
            </View>
            <View style={{ width: '100%', paddingRight: 5 }}>
              <Text style={styles.metaText}>{guardPdfText(`วันที่พิมพ์ : ${generatedAt}`)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.table}>
          {columnGroups?.length ? (
            <View style={[styles.row, styles.headerRow]} fixed>
              {columnGroups.map((group, groupIndex) => {
                const startIndex = columnGroups
                  .slice(0, groupIndex)
                  .reduce((sum, item) => sum + item.span, 0);
                const groupWidth = colWidths
                  .slice(startIndex, startIndex + group.span)
                  .reduce((sum, width) => sum + width, 0);

                return (
                  <View
                    key={`hg-${groupIndex}`}
                    style={[styles.cell, { flexBasis: `${groupWidth}%`, flexGrow: 0 }]}
                  >
                    <Text style={[styles.headerCellText, { textAlign: 'center' }]}>
                      {guardPdfText(group.label)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={[styles.row, styles.headerRow]} fixed>
            {headerValues.map((header, index) => {
              const key = headerKeys[index];
              const align = isNumberColumn(key) ? 'right' : 'left';
              return (
                <View
                  key={`h-${index}`}
                  style={[styles.cell, { flexBasis: `${colWidths[index]}%`, flexGrow: 0 }]}
                >
                  <Text style={[styles.headerCellText, { textAlign: align }]}>{guardPdfText(header)}</Text>
                </View>
              );
            })}
          </View>

          {data.map((row, rowIndex) => {
            // Skip completely blank rows
            if (isBlankRow(row)) {
              return null;
            }

            // Determine row type
            const isSectionHdr = isSectionHeader(row);
            const isSummary = isSummaryRow(row);
            const isAccount = isAccountRow(row);

            // Select appropriate styles
            const rowStyle = (isSectionHdr || isSummary) 
              ? [styles.row, styles.sectionRow]
              : styles.row;

            return (
              <View
                key={`r-${rowIndex}`}
                style={rowStyle}
                wrap={false}
              >
                {headerKeys.map((key, colIndex) => {
                  const align = isNumberColumn(key) ? 'right' : 'left';
                  const cellValue = formatCellValue(getRowValue(row, key), key, numberColumns, currencyColumns, percentColumns);
                  
                  // Determine cell style and text style
                  let cellStyle = styles.cell;
                  let textStyle = styles.cellText;

                  // First column (account code/name) - apply special formatting
                  if (colIndex === 0 || colIndex === 1) {
                    if (isSectionHdr) {
                      // Section headers: bold, no indent
                      textStyle = styles.sectionHeaderText;
                      cellStyle = styles.cell;
                    } else if (isSummary) {
                      // Summary rows: bold, no indent
                      textStyle = styles.cellTextBold;
                      cellStyle = styles.cell;
                    } else if (isAccount && colIndex === 1) {
                      // Account name: regular text, indented
                      textStyle = styles.cellText;
                      cellStyle = styles.cellIndented;
                    }
                  } else {
                    // Other columns (numbers) - use bold for section/summary rows
                    if (isSectionHdr || isSummary) {
                      textStyle = styles.cellTextBold;
                    }
                  }
                  
                  return (
                    <View
                      key={`c-${rowIndex}-${colIndex}`}
                      style={[cellStyle, { flexBasis: `${colWidths[colIndex]}%`, flexGrow: 0 }]}
                    >
                      <Text style={[textStyle, { textAlign: align }]}>
                        {guardPdfText(cellValue)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          })}

          {summaryConfig?.columns ? (
            <View style={[styles.row, styles.summaryRow]} wrap={false}>
              {headerKeys.map((key, colIndex) => {
                const align = isNumberColumn(key) ? 'right' : 'left';
                const colStyle = [styles.cell, { flexBasis: `${colWidths[colIndex]}%`, flexGrow: 0 }];

                if (colIndex === 0) {
                  return (
                    <View key={`s-${key}`} style={colStyle}>
                      <Text style={[styles.summaryCellText, { textAlign: align }]}>
                        {guardPdfText(summaryConfig.label || 'รวมทั้งหมด')}
                      </Text>
                    </View>
                  );
                }

                if (summaryConfig.columns[key]) {
                  const summary = calculateSummary(data, key, summaryConfig.columns[key]);
                  return (
                    <View key={`s-${key}`} style={colStyle}>
                      <Text style={[styles.summaryCellText, { textAlign: align }]}>
                        {guardPdfText(formatCellValue(summary, key, numberColumns, currencyColumns, percentColumns))}
                      </Text>
                    </View>
                  );
                }

                return (
                  <View key={`s-${key}`} style={colStyle}>
                    <Text style={[styles.summaryCellText, { textAlign: align }]}>{guardPdfText('-')}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      </Page>
    </Document>
  );

  const blob = await pdf(doc).toBlob();
  const result = { blob, filename: `${filename}.pdf` };

  if (typeof window === 'undefined' || !window.__PDF_EXPORT_PREVIEW_ONLY__) {
    saveAs(blob, result.filename);
  }

  return result;
}
