'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Bell, AlertTriangle, CheckCircle, Info, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { useBranchStore } from '@/store/useBranchStore';
import { setSelectedBranch } from '@/app/actions/branch-actions';
import { useDateRangeStore } from '@/store/useDateRangeStore';
import type { Alert } from '@/lib/data/dashboard';

const READ_ALERTS_STORAGE_KEY = 'seaandhill:notification-read:v1';
const ALERT_PREVIEW_LIMIT = 5;

type AlertCategory = 'lowStock' | 'overstock' | 'overdue';

const alertTabs: Array<{ key: AlertCategory; label: string }> = [
  { key: 'lowStock', label: 'สินค้าใกล้หมด' },
  { key: 'overstock', label: 'เกินคลัง' },
  { key: 'overdue', label: 'ค้างชำระ' },
];

const alertConfig = {
  info: {
    icon: Info,
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    border: 'border-l-blue-400',
    dot: 'bg-blue-500',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-600',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    border: 'border-l-amber-400',
    dot: 'bg-amber-500',
  },
  success: {
    icon: CheckCircle,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    border: 'border-l-emerald-400',
    dot: 'bg-emerald-500',
  },
  error: {
    icon: XCircle,
    color: 'text-rose-600',
    bg: 'bg-rose-50 dark:bg-rose-500/10',
    border: 'border-l-rose-400',
    dot: 'bg-rose-500',
  },
};

function formatRelativeTime(timestamp?: string): string {
  if (!timestamp) return '';
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now.getTime() - time.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'เพิ่งเกิดขึ้น';
  if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
  if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
  return `${diffDays} วันที่แล้ว`;
}

function readStoredAlertKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const raw = window.localStorage.getItem(READ_ALERTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeStoredAlertKeys(keys: Set<string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(READ_ALERTS_STORAGE_KEY, JSON.stringify([...keys]));
}

function getBranchScope(selectedBranches: string[]) {
  return selectedBranches.includes('ALL') ? 'ALL' : [...selectedBranches].sort().join(',');
}

function getAlertReadKey(alert: Alert, branchScope: string) {
  return `${branchScope}:${alert.id}:${alert.type}:${alert.title}:${alert.message}`;
}

function getAlertCategory(alert: Alert): AlertCategory {
  if (alert.category) return alert.category;

  const text = `${alert.title} ${alert.message}`;

  if (text.includes('ค้างชำระ') || text.includes('ลูกหนี้')) {
    return 'overdue';
  }

  if (text.includes('เกินคลัง') || text.includes('> 90')) {
    return 'overstock';
  }

  return 'lowStock';
}

function getAlertDestination(alert: Alert) {
  const category = getAlertCategory(alert);

  if (category === 'overdue') {
    return '/reports/accounting?report=ar-aging';
  }

  if (category === 'overstock') {
    return '/reports/inventory#overstock';
  }

  return '/reports/inventory#low-stock';
}

export function NotificationPanel() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [activeTab, setActiveTab] = useState<AlertCategory>('lowStock');
  const [readAlertKeys, setReadAlertKeys] = useState<Set<string>>(() => readStoredAlertKeys());
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dateRange = useDateRangeStore((s) => s.dateRange);
  const selectedBranches = useBranchStore((s) => s.selectedBranches);
  const setSelectedBranches = useBranchStore((s) => s.setSelectedBranches);

  // Fetch alerts from the same API as dashboard
  const { data } = useQuery({
    queryKey: ['dashboardAlerts', selectedBranches, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (!selectedBranches.includes('ALL')) {
        selectedBranches.forEach((b) => params.append('branch', b));
      }
      params.append('startDate', dateRange.start);
      params.append('endDate', dateRange.end);
      const queryParams = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/dashboard${queryParams}`);
      if (!res.ok) return { alerts: [] };
      const json = await res.json();
      return json;
    },
    staleTime: 60_000,
  });

  const alerts: Alert[] = data?.alerts || [];
  const branchScope = useMemo(() => getBranchScope(selectedBranches), [selectedBranches]);
  const unreadCount = alerts.filter((alert) => !readAlertKeys.has(getAlertReadKey(alert, branchScope))).length;
  const alertCounts = useMemo(() => {
    return alerts.reduce<Record<AlertCategory, number>>(
      (acc, alert) => {
        acc[getAlertCategory(alert)] += 1;
        return acc;
      },
      { lowStock: 0, overstock: 0, overdue: 0 }
    );
  }, [alerts]);
  const filteredAlerts = useMemo(
    () => alerts.filter((alert) => getAlertCategory(alert) === activeTab),
    [alerts, activeTab]
  );
  const hasMoreAlerts = filteredAlerts.length > ALERT_PREVIEW_LIMIT;
  const visibleAlerts = showAllAlerts ? filteredAlerts : filteredAlerts.slice(0, ALERT_PREVIEW_LIMIT);
  const hiddenAlertCount = Math.max(filteredAlerts.length - ALERT_PREVIEW_LIMIT, 0);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setShowAllAlerts(false);
    }
  }, [isOpen]);

  useEffect(() => {
    setShowAllAlerts(false);
  }, [activeTab]);

  useEffect(() => {
    if (alerts.length === 0 || alertCounts[activeTab] > 0) return;

    const firstAvailableTab = alertTabs.find((tab) => alertCounts[tab.key] > 0);
    if (firstAvailableTab) {
      setActiveTab(firstAvailableTab.key);
    }
  }, [activeTab, alertCounts, alerts.length]);

  const markAllRead = () => {
    setReadAlertKeys((prev) => {
      const next = new Set(prev);
      alerts.forEach((alert) => next.add(getAlertReadKey(alert, branchScope)));
      writeStoredAlertKeys(next);
      return next;
    });
  };

  const markRead = (alert: Alert) => {
    setReadAlertKeys((prev) => {
      const next = new Set(prev);
      next.add(getAlertReadKey(alert, branchScope));
      writeStoredAlertKeys(next);
      return next;
    });
  };

  const openAlertDetail = async (alert: Alert) => {
    markRead(alert);

    if (alert.branchSync) {
      const nextBranches = [alert.branchSync];
      setSelectedBranches(nextBranches);
      await setSelectedBranch(nextBranches);
    }

    setIsOpen(false);
    router.push(getAlertDestination(alert));
  };

  // Calculate panel position from button
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPanelPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [isOpen]);

  const panel = mounted && isOpen ? createPortal(
    <>
      {/* Backdrop (subtle) */}
      <div className="fixed inset-0 z-[9998]" />

      {/* Panel */}
      <div
        ref={panelRef}
        style={{ top: panelPos.top, right: panelPos.right }}
        className="fixed z-[9999] w-[520px] max-w-[calc(100vw-2rem)] max-h-[80vh] flex flex-col rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
      >
        {/* Header */}
        <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <Bell className="h-5 w-5 text-[hsl(var(--primary))]" />
            <span className="text-base font-semibold text-[hsl(var(--foreground))]">Notifications</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-[hsl(var(--primary))] px-2 py-0.5 text-xs font-bold text-white">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-sm font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"
              >
                อ่านทั้งหมด
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg hover:bg-[hsl(var(--muted))] transition-colors"
              aria-label="ปิด"
            >
              <X className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            </button>
          </div>
          </div>
          <div className="flex items-end gap-1 overflow-x-auto px-5">
            {alertTabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'relative flex min-w-0 items-center gap-2 px-2.5 pb-3 pt-1 text-sm font-semibold transition-colors',
                    isActive
                      ? 'text-[hsl(var(--foreground))]'
                      : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                  )}
                >
                  <span className="truncate">{tab.label}</span>
                  <span className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                    isActive
                      ? 'bg-[hsl(var(--foreground))] text-[hsl(var(--background))]'
                      : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                  )}>
                    {alertCounts[tab.key]}
                  </span>
                  {isActive && (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[hsl(var(--foreground))]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--muted))]">
                <Bell className="h-7 w-7 text-[hsl(var(--muted-foreground))]" />
              </div>
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">ไม่มีการแจ้งเตือน</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">ทุกอย่างเรียบร้อยดี!</p>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--muted))]">
                <Bell className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
              </div>
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">ไม่มีรายการในหมวดนี้</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">ลองเลือกหมวดอื่นเพื่อดูการแจ้งเตือน</p>
            </div>
          ) : (
            <div className="divide-y divide-[hsl(var(--border))]">
              {visibleAlerts.map((alert) => {
                const config = alertConfig[alert.type];
                const Icon = config.icon;
                const isRead = readAlertKeys.has(getAlertReadKey(alert, branchScope));

                return (
                  <button
                    key={alert.id}
                    onClick={() => void openAlertDetail(alert)}
                    className={cn(
                      'w-full text-left flex gap-3 px-4 py-3 transition-colors hover:bg-[hsl(var(--muted)/50)]',
                      'border-l-[3px]',
                      isRead ? 'border-l-transparent opacity-60' : config.border
                    )}
                  >
                    {/* Icon */}
                    <div className={cn(
                      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                      config.bg, config.color
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-semibold leading-tight text-[hsl(var(--foreground))]">
                          {alert.title}
                        </p>
                        {!isRead && (
                          <span className={cn('h-2 w-2 shrink-0 rounded-full', config.dot)} />
                        )}
                      </div>

                      {(alert.branchName || alert.timestamp) && (
                        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-[hsl(var(--muted-foreground))]">
                          {alert.branchName && (
                            <span className="min-w-0 truncate font-medium">
                              {alert.branchName}
                            </span>
                          )}
                          {alert.branchName && alert.timestamp && (
                            <span className="shrink-0 text-[hsl(var(--border))]">•</span>
                          )}
                          {alert.timestamp && (
                            <span className="shrink-0">
                              {formatRelativeTime(alert.timestamp)}
                            </span>
                          )}
                        </div>
                      )}

                      <p className="mt-1 line-clamp-2 text-xs leading-snug text-[hsl(var(--muted-foreground))]">
                        {alert.message}
                      </p>
                      <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--primary))/10] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">
                        <span>{alert.actionLabel || 'ดูรายละเอียด'}</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {alerts.length > 0 && (
          <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/30)] px-5 py-3 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-xs text-[hsl(var(--muted-foreground))]">
              {showAllAlerts || !hasMoreAlerts
                ? `${filteredAlerts.length} รายการในหมวดนี้`
                : `แสดง ${visibleAlerts.length} จาก ${filteredAlerts.length} รายการ`}
            </p>
            {hasMoreAlerts && (
              <button
                type="button"
                onClick={() => setShowAllAlerts((prev) => !prev)}
                className="shrink-0 text-xs font-medium text-[hsl(var(--primary))] hover:underline"
              >
                {showAllAlerts ? 'ย่อกลับ' : `ดูทั้งหมด (+${hiddenAlertCount})`}
              </button>
            )}
          </div>
        )}
      </div>
    </>,
    document.body
  ) : null;

  return (
    <>
      {/* Bell Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'relative rounded-lg p-2 transition-all focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]',
          isOpen
            ? 'bg-[hsl(var(--primary)/10)] text-[hsl(var(--primary))]'
            : 'hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
        )}
        aria-label="เปิดการแจ้งเตือน"
        aria-expanded={isOpen}
      >
        <Bell className="h-5 w-5" />
        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
        )}
      </button>

      {panel}
    </>
  );
}
