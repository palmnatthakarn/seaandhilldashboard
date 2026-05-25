'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Calculator,
  FileText,
  Package,
  Search,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranchStore } from '@/store/useBranchStore';
import { useDateRangeStore } from '@/store/useDateRangeStore';

type SearchGroup = 'หน้า' | 'KPI / Insight' | 'ข้อมูลธุรกิจ' | 'AI';
type SearchAction = 'navigate' | 'ask-ai';

type SmartSearchItem = {
  id: string;
  group: SearchGroup;
  title: string;
  subtitle: string;
  href?: string;
  action: SearchAction;
  prompt?: string;
  keywords: string[];
  icon: React.ComponentType<{ className?: string }>;
};

type EntityResult = {
  type: 'customer' | 'supplier' | 'product' | 'document';
  title: string;
  subtitle: string;
  href: string;
  amount?: number;
  count?: number;
  latestDate?: string;
};

const QUICK_ITEMS: SmartSearchItem[] = [
  {
    id: 'page-dashboard',
    group: 'หน้า',
    title: 'ภาพรวมธุรกิจ',
    subtitle: 'ดูยอดขาย รายได้ ค่าใช้จ่าย รายการขายล่าสุด และ alert',
    href: '/',
    action: 'navigate',
    keywords: ['dashboard', 'ภาพรวม', 'ธุรกิจ', 'ยอดขายรวม', 'alert', 'แจ้งเตือน'],
    icon: BarChart3,
  },
  {
    id: 'page-sales',
    group: 'หน้า',
    title: 'ยอดขายและลูกค้า',
    subtitle: 'KPI ยอดขาย สินค้าขายดี ลูกค้าหลัก และลูกหนี้',
    href: '/sales',
    action: 'navigate',
    keywords: ['ขาย', 'ยอดขาย', 'ลูกค้า', 'สินค้า', 'invoice', 'ใบขาย', 'ar'],
    icon: ShoppingCart,
  },
  {
    id: 'page-accounting',
    group: 'หน้า',
    title: 'การเงินและบัญชี',
    subtitle: 'กำไรขาดทุน งบดุล กระแสเงินสด AR/AP aging',
    href: '/accounting',
    action: 'navigate',
    keywords: ['บัญชี', 'การเงิน', 'กำไร', 'ขาดทุน', 'งบดุล', 'กระแสเงินสด', 'ลูกหนี้', 'เจ้าหนี้'],
    icon: Calculator,
  },
  {
    id: 'page-inventory',
    group: 'หน้า',
    title: 'คลังสินค้าและสต็อก',
    subtitle: 'สินค้าใกล้หมด เกินคลัง หมุนเวียนช้า และ stock movement',
    href: '/inventory',
    action: 'navigate',
    keywords: ['คลัง', 'สต็อก', 'stock', 'สินค้าใกล้หมด', 'เกินคลัง', 'slow moving'],
    icon: Package,
  },
  {
    id: 'page-purchase',
    group: 'หน้า',
    title: 'จัดซื้อและ Supplier',
    subtitle: 'ยอดซื้อ PO supplier หลัก AP และหมวดจัดซื้อ',
    href: '/purchase',
    action: 'navigate',
    keywords: ['จัดซื้อ', 'ซื้อ', 'supplier', 'ซัพพลายเออร์', 'po', 'เจ้าหนี้'],
    icon: FileText,
  },
  {
    id: 'page-comparison',
    group: 'หน้า',
    title: 'เปรียบเทียบกิจการ',
    subtitle: 'เทียบยอดขาย กำไร ลูกค้า และ performance ระหว่างกิจการ',
    href: '/comparison',
    action: 'navigate',
    keywords: ['เปรียบเทียบ', 'กิจการ', 'สาขา', 'ranking', 'อันดับ'],
    icon: TrendingUp,
  },
  {
    id: 'report-sales',
    group: 'หน้า',
    title: 'รายงานการขาย',
    subtitle: 'เปิดรายงานเจาะลึกด้านการขาย',
    href: '/reports/sales',
    action: 'navigate',
    keywords: ['รายงานขาย', 'รายงานการขาย', 'sales report'],
    icon: FileText,
  },
  {
    id: 'report-accounting-ar',
    group: 'หน้า',
    title: 'รายงานลูกหนี้ค้างชำระ',
    subtitle: 'เปิด AR aging เพื่อติดตามลูกหนี้',
    href: '/reports/accounting?report=ar-aging',
    action: 'navigate',
    keywords: ['ลูกหนี้', 'ค้างชำระ', 'ar aging', 'เก็บเงิน'],
    icon: Users,
  },
  {
    id: 'report-inventory-low',
    group: 'หน้า',
    title: 'รายงานสินค้าใกล้หมด',
    subtitle: 'ตรวจรายการที่ควรเติมสต็อก',
    href: '/reports/inventory#low-stock',
    action: 'navigate',
    keywords: ['สินค้าใกล้หมด', 'low stock', 'เติมสต็อก', 'reorder'],
    icon: Package,
  },
  {
    id: 'kpi-sales-today',
    group: 'KPI / Insight',
    title: 'ยอดขายวันนี้ / เดือนนี้',
    subtitle: 'ไปหน้าขายเพื่อดูยอดขายรวม แนวโน้ม และสินค้าขายดี',
    href: '/sales',
    action: 'navigate',
    keywords: ['ยอดขายวันนี้', 'ยอดขายเดือนนี้', 'ยอดขาย', 'ขายดี'],
    icon: TrendingUp,
  },
  {
    id: 'kpi-profit',
    group: 'KPI / Insight',
    title: 'กำไรและรายได้เทียบค่าใช้จ่าย',
    subtitle: 'ดู P&L และ breakdown รายได้/ค่าใช้จ่าย',
    href: '/accounting',
    action: 'navigate',
    keywords: ['กำไร', 'รายได้', 'ค่าใช้จ่าย', 'profit', 'p&l'],
    icon: Calculator,
  },
  {
    id: 'kpi-stock-risk',
    group: 'KPI / Insight',
    title: 'ความเสี่ยงสต็อก',
    subtitle: 'ดูสินค้าใกล้หมด เกินคลัง และหมุนเวียนช้า',
    href: '/inventory',
    action: 'navigate',
    keywords: ['ความเสี่ยงสต็อก', 'สต็อกเกิน', 'สินค้าใกล้หมด', 'หมุนเวียนช้า'],
    icon: Package,
  },
  {
    id: 'kpi-ap',
    group: 'KPI / Insight',
    title: 'เจ้าหนี้และยอดจัดซื้อ',
    subtitle: 'ดู AP outstanding supplier และแนวโน้ม PO',
    href: '/purchase',
    action: 'navigate',
    keywords: ['เจ้าหนี้', 'ap', 'ยอดซื้อ', 'po', 'supplier'],
    icon: FileText,
  },
];

const GROUP_ORDER: SearchGroup[] = ['หน้า', 'KPI / Insight', 'ข้อมูลธุรกิจ', 'AI'];
const QUESTION_HINTS = ['?', 'ไหม', 'ทำไม', 'อะไร', 'อย่างไร', 'เท่าไหร่', 'มีใคร', 'วิเคราะห์', 'สรุป', 'เพราะอะไร'];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function matchesItem(item: SmartSearchItem, query: string) {
  const text = `${item.title} ${item.subtitle} ${item.keywords.join(' ')}`.toLowerCase();
  return text.includes(query);
}

function isLikelyQuestion(query: string) {
  return QUESTION_HINTS.some((hint) => query.includes(hint.toLowerCase()));
}

function entityIcon(type: EntityResult['type']) {
  if (type === 'customer' || type === 'supplier') return Users;
  if (type === 'product') return Package;
  return FileText;
}

function toEntityItem(item: EntityResult): SmartSearchItem {
  return {
    id: `entity-${item.type}-${item.href}-${item.title}`,
    group: 'ข้อมูลธุรกิจ',
    title: item.title || 'ไม่ระบุชื่อ',
    subtitle: item.subtitle,
    href: item.href,
    action: 'navigate',
    keywords: [item.title, item.subtitle],
    icon: entityIcon(item.type),
  };
}

function buildAiItem(query: string): SmartSearchItem {
  return {
    id: 'ask-ai',
    group: 'AI',
    title: `ถาม AI: ${query}`,
    subtitle: 'ให้ AI Data Assistant วิเคราะห์จากข้อมูลและบริบทในระบบ',
    action: 'ask-ai',
    prompt: query,
    keywords: [query],
    icon: Bot,
  };
}

export function SmartSearch() {
  const router = useRouter();
  const dateRange = useDateRangeStore((s) => s.dateRange);
  const selectedBranches = useBranchStore((s) => s.selectedBranches);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [entityResults, setEntityResults] = useState<EntityResult[]>([]);
  const [isEntityLoading, setIsEntityLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const normalizedQuery = normalize(query);

  const results = useMemo(() => {
    if (normalizedQuery.length === 0) {
      return QUICK_ITEMS.slice(0, 6);
    }

    const quickResults = QUICK_ITEMS.filter((item) => matchesItem(item, normalizedQuery)).slice(0, 8);
    const entityItems = entityResults.map(toEntityItem);
    const shouldOfferAi = normalizedQuery.length >= 3 || isLikelyQuestion(normalizedQuery);

    return [
      ...quickResults,
      ...entityItems,
      ...(shouldOfferAi ? [buildAiItem(query.trim())] : []),
    ].slice(0, 14);
  }, [entityResults, normalizedQuery, query]);

  const groupedResults = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      items: results.filter((item) => item.group === group),
    })).filter((section) => section.items.length > 0);
  }, [results]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedQuery]);

  useEffect(() => {
    if (normalizedQuery.length < 2) {
      setEntityResults([]);
      setIsEntityLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({
        q: query.trim(),
        start_date: dateRange.start,
        end_date: dateRange.end,
      });

      if (!selectedBranches.includes('ALL')) {
        selectedBranches.forEach((branch) => params.append('branch', branch));
      }

      setIsEntityLoading(true);
      try {
        const response = await fetch(`/api/search/entities?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          setEntityResults([]);
          return;
        }
        const json = await response.json() as { data?: EntityResult[] };
        setEntityResults(json.data ?? []);
      } catch {
        if (!controller.signal.aborted) {
          setEntityResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsEntityLoading(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [dateRange.end, dateRange.start, normalizedQuery, query, selectedBranches]);

  const closeSearch = () => {
    setIsOpen(false);
    setQuery('');
    setEntityResults([]);
  };

  const runItem = (item: SmartSearchItem) => {
    if (item.action === 'ask-ai') {
      window.dispatchEvent(new CustomEvent('seaandhill:ask-ai', {
        detail: { prompt: item.prompt || query.trim() },
      }));
      closeSearch();
      return;
    }

    if (item.href) {
      router.push(item.href);
      closeSearch();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && ['ArrowDown', 'Enter'].includes(event.key)) {
      setIsOpen(true);
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      runItem(results[activeIndex]);
      return;
    }

    if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  let flatIndex = 0;

  return (
    <div ref={rootRef} className="relative hidden md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
      <input
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="ค้นหา..."
        className="h-9 w-44 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] pl-9 pr-4 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] lg:w-52 xl:w-64"
        role="combobox"
        aria-label="ค้นหาข้อมูลใน Dashboard"
        aria-expanded={isOpen}
        aria-controls="smart-search-results"
      />

      {isOpen && (
        <div
          id="smart-search-results"
          className="absolute right-0 top-11 z-[100] w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl"
        >
          <div className="max-h-[24rem] overflow-y-auto py-1.5">
            {groupedResults.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">ไม่พบผลลัพธ์</p>
                <button
                  type="button"
                  onClick={() => runItem(buildAiItem(query.trim()))}
                  className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3 text-sm font-medium text-white"
                >
                  <Bot className="h-4 w-4" />
                  ถาม AI
                </button>
              </div>
            ) : (
              groupedResults.map((section) => (
                <div key={section.group} className="py-1">
                  <p className="px-3 py-1 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">
                    {section.group}
                  </p>
                  {section.items.map((item) => {
                    const currentIndex = flatIndex;
                    flatIndex += 1;
                    const Icon = item.icon;
                    const isActive = currentIndex === activeIndex;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseEnter={() => setActiveIndex(currentIndex)}
                        onClick={() => runItem(item)}
                        className={cn(
                          'flex w-full items-center gap-2.5 border-l-2 px-3 py-2 text-left transition-colors',
                          isActive
                            ? 'border-indigo-500 bg-slate-100 !text-slate-950'
                            : 'border-transparent hover:bg-[hsl(var(--muted)/60)]'
                        )}
                      >
                        <span className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
                          isActive
                            ? 'border-indigo-100 bg-white !text-indigo-600'
                            : item.group === 'AI'
                            ? 'border-transparent bg-blue-50 text-blue-600 dark:bg-blue-500/10'
                            : 'border-transparent bg-[hsl(var(--muted))] text-[hsl(var(--primary))]'
                        )}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn(
                            'block truncate text-sm font-semibold',
                            isActive && '!text-slate-950'
                          )}>
                            {item.title}
                          </span>
                          <span className={cn(
                            'block truncate text-xs',
                            isActive
                              ? 'font-medium !text-slate-700'
                              : 'text-[hsl(var(--muted-foreground))]'
                          )}>
                            {item.subtitle}
                          </span>
                        </span>
                        <ArrowRight className={cn(
                          'h-3.5 w-3.5 shrink-0',
                          isActive ? '!text-slate-600' : 'text-[hsl(var(--muted-foreground))]'
                        )} />
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {isEntityLoading && (
            <div className="border-t border-[hsl(var(--border))] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
              กำลังค้นหาข้อมูล...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
