import Link from 'next/link';
import { AlertTriangle, CheckCircle, Info, XCircle, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Alert } from '@/lib/data/dashboard';

function getAlertDestination(alert: Alert): string {
    const text = `${alert.title} ${alert.message}`;
    if (alert.category === 'overdue' || text.includes('ค้างชำระ') || text.includes('ลูกหนี้')) {
        return '/reports/accounting?report=ar-aging';
    }
    if (alert.category === 'overstock' || text.includes('เกินคลัง')) {
        return '/reports/inventory#overstock';
    }
    return '/reports/inventory#low-stock';
}

interface AlertsCardProps {
    alerts: Alert[];
}

const alertConfig = {
    info: {
        icon: Info,
        color: 'text-blue-600',
        bg: 'bg-blue-50 dark:bg-blue-500/10',
        border: 'border-blue-100 dark:border-blue-500/20',
        accent: 'bg-blue-500'
    },
    warning: {
        icon: AlertTriangle,
        color: 'text-amber-600',
        bg: 'bg-amber-50 dark:bg-amber-500/10',
        border: 'border-amber-100 dark:border-amber-500/20',
        accent: 'bg-amber-500'
    },
    success: {
        icon: CheckCircle,
        color: 'text-emerald-600',
        bg: 'bg-emerald-50 dark:bg-emerald-500/10',
        border: 'border-emerald-100 dark:border-emerald-500/20',
        accent: 'bg-emerald-500'
    },
    error: {
        icon: XCircle,
        color: 'text-rose-600',
        bg: 'bg-rose-50 dark:bg-rose-500/10',
        border: 'border-rose-100 dark:border-rose-500/20',
        accent: 'bg-rose-500'
    },
};

export function AlertsCard({ alerts }: AlertsCardProps) {
    const counts = alerts.reduce(
        (acc, alert) => {
            acc[alert.type] += 1;
            return acc;
        },
        { info: 0, warning: 0, success: 0, error: 0 }
    );

    const sortedAlerts = [...alerts].sort((a, b) => {
        const priority = { error: 0, warning: 1, info: 2, success: 3 };
        return priority[a.type] - priority[b.type];
    });

    if (alerts.length === 0) {
        return (
            <div className="flex h-full min-h-[360px] flex-col rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-3 py-3 sm:px-6 sm:py-4">
                    <div className="flex min-w-0 items-center gap-2">
                        <Bell className="h-5 w-5 shrink-0 text-[hsl(var(--primary))]" />
                        <h3 className="truncate font-semibold tracking-tight text-[hsl(var(--foreground))]">Notifications</h3>
                    </div>
                </div>
                <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(var(--muted))]">
                        <Bell className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
                    </div>
                    <h4 className="mt-4 text-sm font-semibold text-[hsl(var(--foreground))]">ไม่มีการแจ้งเตือน</h4>
                    <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">ทุกอย่างเรียบร้อยดี</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-[360px] max-h-[520px] min-w-0 flex-col overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm transition-all duration-200 hover:shadow-md">
            <div className="flex flex-col gap-3 border-b border-[hsl(var(--border))] px-3 py-3 sm:px-6 sm:py-4">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <Bell className="h-5 w-5 shrink-0 text-[hsl(var(--primary))]" />
                        <h3 className="truncate font-semibold tracking-tight text-[hsl(var(--foreground))]">Notifications</h3>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {(['error', 'warning', 'info'] as const).map((type) => {
                            if (counts[type] === 0) return null;
                            const config = alertConfig[type];
                            return (
                                <span
                                    key={type}
                                    className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--foreground))]"
                                >
                                    <span className={cn('h-1.5 w-1.5 rounded-full', config.accent)} />
                                    {counts[type]}
                                </span>
                            );
                        })}
                        <span className="rounded-full bg-[hsl(var(--primary))/10] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--primary))]">
                            {alerts.length}
                        </span>
                    </div>
                </div>

            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
                {sortedAlerts.map((alert) => {
                    const config = alertConfig[alert.type];
                    const Icon = config.icon;

                    return (
                        <Link
                            key={alert.id}
                            href={getAlertDestination(alert)}
                            className="group flex gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-[hsl(var(--muted)/60)]"
                        >
                            <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md", config.bg, config.color)}>
                                <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="min-w-0 truncate text-sm font-semibold text-[hsl(var(--foreground))]">{alert.title}</p>
                                    {alert.timestamp && (
                                        <span className="shrink-0 whitespace-nowrap text-[10px] text-[hsl(var(--muted-foreground))]">
                                            {new Date(alert.timestamp).toLocaleDateString('th-TH', {
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </span>
                                    )}
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                                    {alert.message}
                                </p>
                                <div className="mt-2 flex items-center justify-between gap-2">
                                    {alert.branchName ? (
                                        <p className="inline-flex min-w-0 max-w-full rounded-md bg-[hsl(var(--muted))] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--muted-foreground))]">
                                            <span className="truncate">{alert.branchName}</span>
                                        </p>
                                    ) : (
                                        <span />
                                    )}
                                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full opacity-70', config.accent)} />
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>
            <div className="flex items-center justify-between border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))/20] px-3 py-2 sm:px-6">
                <span className="truncate text-xs text-[hsl(var(--muted-foreground))]">เลื่อนดูรายการทั้งหมด</span>
                <span className="ml-3 shrink-0 text-xs font-semibold text-[hsl(var(--primary))]">{alerts.length} รายการ</span>
            </div>
        </div>
    );
}
