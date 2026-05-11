'use client';

import { LucideIcon, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReactNode, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { KPIDetailModal, type KPIDetailActionButton, type KPIDetailItem } from '@/components/KPIDetailModal';
import { useAdminStatus } from '@/hooks/useAdminStatus';

interface QueryInfo {
    query: string;
    format?: string;
}

interface KPICardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    trend?: string;
    trendUp?: boolean;
    description?: string;
    subtitle?: string;
    className?: string;
    queryInfo?: QueryInfo;
    detailTitle?: string;
    detailNote?: string;
    detailItems?: KPIDetailItem[];
    detailContent?: ReactNode;
    detailActionButton?: KPIDetailActionButton;
    expandHref?: string;
}


// Separate Modal component to use Portal
function QueryModal({ 
    isOpen, 
    onClose, 
    title, 
    queryInfo 
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    title: string; 
    queryInfo: QueryInfo;
}) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(queryInfo.query.trim());
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999]">
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />
            {/* Popup */}
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[95vw] sm:w-[90vw] max-w-2xl mx-4 p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--popover))] shadow-2xl">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <svg 
                            className="w-5 h-5 text-blue-500 flex-shrink-0" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                        >
                            <path 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                strokeWidth={2} 
                                d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" 
                            />
                        </svg>
                        <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
                            SQL Query - {title}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            className="p-1.5 rounded-md hover:bg-[hsl(var(--muted))] transition-colors"
                            onClick={onClose}
                        >
                            <svg 
                                className="w-5 h-5 text-muted-foreground" 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                            >
                                <path 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    strokeWidth={2} 
                                    d="M6 18L18 6M6 6l12 12" 
                                />
                            </svg>
                        </button>
                    </div>
                </div>
                <div className="flex items-center justify-between mb-2">
                    {queryInfo.format && (
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                            Format: {queryInfo.format}
                        </span>
                    )}
                </div>
           
                <div className="relative">
                    <button
                        className={cn(
                            "absolute top-2 right-2 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 z-10 ",
                            copied 
                                ? "bg-green-500 text-white"
                                : "hover:bg-gray-300 text-gray-800"
                        )}
                        onClick={copyToClipboard}
                        title="คัดลอก SQL Query"
                    >
                        {copied ? (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>Copied!</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                <span>Copy</span>
                            </>
                        )}
                    </button>
                    <pre className="text-xs bg-[hsl(var(--muted))] p-4 rounded-md overflow-x-auto max-h-[60vh] overflow-y-auto">
                        <code className="text-[hsl(var(--foreground))] whitespace-pre-wrap break-words font-mono">
                            {queryInfo.query.trim()}
                        </code>
                    </pre>
                </div>

            </div>
        </div>,
        document.body
    );
}

export function KPICard({
    title,
    value,
    icon: Icon,
    trend,
    trendUp,
    description,
    subtitle,
    className,
    queryInfo,
    detailTitle,
    detailNote,
    detailItems,
    detailContent,
    detailActionButton,
    expandHref,
}: KPICardProps) {
    const isAdmin = useAdminStatus();
    const [showQueryPopup, setShowQueryPopup] = useState(false);
    const [showDetailPopup, setShowDetailPopup] = useState(false);

    const isCardClickable = true;
    const canViewQuery = Boolean(queryInfo && isAdmin);

    const openPopup = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (canViewQuery) {
            setShowQueryPopup(true);
        }
    };

    const closePopup = () => {
        setShowQueryPopup(false);
    };

    const openDetailPopup = () => {
        if (!isCardClickable) return;
        setShowDetailPopup(true);
    };

    const closeDetailPopup = () => {
        setShowDetailPopup(false);
    };

    const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!isCardClickable) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openDetailPopup();
        }
    };

    return (
        <>
            <div 
                className={cn(
                    "group relative overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/5 hover:-translate-y-1",
                    isCardClickable ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]' : '',
                    className
                )}
                role={isCardClickable ? 'button' : undefined}
                tabIndex={isCardClickable ? 0 : undefined}
                onClick={openDetailPopup}
                onKeyDown={handleCardKeyDown}
                aria-label={`ดูรายละเอียด ${title}`}
            >
                {/* Query Info Button - Top Right Corner */}
                {canViewQuery && (
                    <button
                        type="button"
                        className="absolute bottom-3 right-3 p-2 rounded-lg bg-[hsl(var(--muted))]/50 hover:bg-[hsl(var(--muted))] opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer z-10"
                        title="View SQL Query"
                        onClick={openPopup}
                    >
                        <svg 
                            className="w-6 h-6 text-muted-foreground hover:text-blue-500 transition-colors" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                        >
                            <path 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                strokeWidth={2} 
                                d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" 
                            />
                        </svg>
                    </button>
                )}

                <div className="flex items-center justify-between">
                    <div className="rounded-xl bg-[hsl(var(--primary))/10] p-2.5 text-[hsl(var(--primary))] transition-colors group-hover:bg-[hsl(var(--primary))] group-hover:text-white">
                        <Icon className="h-5 w-5" />
                    </div>
                    {trend && (
                        <div className={cn(
                            "flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
                            trendUp
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                                : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"
                        )}>
                            {trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            <span>{trend}</span>
                        </div>
                    )}
                </div>

                <div className="mt-4">
                    <h3 className="text-sm font-medium text-[hsl(var(--muted-foreground))]">{title}</h3>
                    <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
                            {value}
                        </span>
                        {subtitle && (
                            <span className="text-sm text-[hsl(var(--muted-foreground))]">
                                {subtitle}
                            </span>
                        )}
                    </div>
                    {description && (
                        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                            {description}
                        </p>
                    )}
                </div>

                {/* Decorative gradient blob */}
                <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-gradient-to-br from-[hsl(var(--primary))/20] to-violet-500/20 blur-2xl transition-opacity opacity-0 group-hover:opacity-100" />
            </div>

            {/* Query Info Modal - rendered via Portal */}
            {canViewQuery && queryInfo && (
                <QueryModal
                    isOpen={showQueryPopup}
                    onClose={closePopup}
                    title={title}
                    queryInfo={queryInfo}
                />
            )}

            <KPIDetailModal
                isOpen={showDetailPopup}
                onClose={closeDetailPopup}
                title={title}
                value={value}
                trend={trend}
                trendUp={trendUp}
                description={description}
                subtitle={subtitle}
                detailTitle={detailTitle}
                detailNote={detailNote}
                detailItems={detailItems}
                detailContent={detailContent}
                detailActionButton={detailActionButton}
                expandHref={expandHref}
            />
        </>
    );
}
