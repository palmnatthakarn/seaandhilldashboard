'use client';

import { cn } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ExternalLink, MoreVertical, Database, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { useAdminStatus } from '@/hooks/useAdminStatus';

interface QueryInfo {
    query: string;
    format?: string;
}

interface DataCardProps {
    title: string;
    children: React.ReactNode;
    className?: string;
    action?: React.ReactNode;
    description?: string;
    queryInfo?: QueryInfo;
    linkTo?: string; // URL to navigate when clicking on the card
    id?: string; // ID for scroll target
    headerExtra?: React.ReactNode; // Extra content in header (e.g., filters)
    onExportExcel?: () => void; // Export to Excel callback
    onExportPDF?: () => void; // Export to PDF callback
}

// Query Modal component
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
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[95vw] sm:w-[90vw] max-w-3xl mx-4 p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--popover))] shadow-2xl">
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
                    <button
                        className="p-1.5 rounded-md hover:bg-[hsl(var(--muted))] transition-colors"
                        onClick={onClose}
                    >
                        <svg
                            className="w-6 h-6 text-muted-foreground"
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

                {queryInfo.format && (
                    <div className="mb-3">
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                            Format: {queryInfo.format}
                        </span>
                    </div>
                )}

                <div className="relative">
                    <button
                        className={cn(
                            "absolute top-2 right-2 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 z-10",
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
                    <pre className="text-xs bg-[hsl(var(--muted))] p-4  rounded-md overflow-x-auto max-h-[60vh] overflow-y-auto">
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

export function DataCard({ title, children, className, action, description, queryInfo, linkTo, id, headerExtra, onExportExcel, onExportPDF }: DataCardProps) {
    const isAdmin = useAdminStatus();
    const [showQueryPopup, setShowQueryPopup] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const exportMenuRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
            if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
                setShowExportMenu(false);
            }
        };

        if (showMenu || showExportMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showMenu, showExportMenu]);

    const openPopup = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShowMenu(false);
        if (queryInfo) {
            setShowQueryPopup(true);
        }
    };

    const closePopup = () => {
        setShowQueryPopup(false);
    };

    const handleNavigate = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShowMenu(false);
        if (linkTo) {
            router.push(linkTo);
        }
    };

    const toggleMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShowMenu(!showMenu);
    };

    const toggleExportMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShowExportMenu(!showExportMenu);
    };

    const hasExportActions = Boolean(onExportExcel || onExportPDF);

    // Check if we have any menu items to show
    const canViewQuery = Boolean(queryInfo && isAdmin);
    const hasMenuItems = linkTo || canViewQuery;

    return (
        <>
            <div
                id={id}
                className={cn(
                    "group flex flex-col rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm transition-all duration-200 hover:shadow-md scroll-mt-24",
                    className
                )}
            >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[hsl(var(--border))] px-3 py-3 sm:px-6 sm:py-4">
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-[hsl(var(--foreground))] tracking-tight">
                            {title}
                        </h3>
                        {description && (
                            <p className="text-sm text-muted-foreground mt-0.5">
                                {description}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                        {/* Header Extra (e.g., filters) */}
                        {headerExtra && (
                            <div className="flex items-center flex-wrap gap-2">
                                {headerExtra}
                            </div>
                        )}
                        {/* Export Excel button */}
                        {hasExportActions && (
                            <div className="relative" ref={exportMenuRef}>
                                <button
                                    className="p-2 rounded-lg hover:bg-[hsl(var(--muted))] transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="ดาวน์โหลดรายงาน"
                                    onClick={toggleExportMenu}
                                    disabled={isExporting}
                                >
                                    {isExporting ? (
                                        <Loader2 className="w-5 h-5 text-green-600 animate-spin" />
                                    ) : (
                                        <Download className="w-5 h-5 text-green-600" />
                                    )}
                                </button>

                                {showExportMenu && (
                                    <div className="absolute right-0 top-full mt-1 w-44 bg-[hsl(var(--popover))] border border-[hsl(var(--border))] rounded-lg shadow-lg z-50 py-1">
                                        {onExportExcel && (
                                            <button
                                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                disabled={isExporting}
                                                onClick={async (e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setShowExportMenu(false);
                                                    setIsExporting(true);
                                                    
                                                    // Give UI thread time to render the loading spinner
                                                    await new Promise(resolve => setTimeout(resolve, 100));
                                                    
                                                    try {
                                                        await Promise.resolve(onExportExcel());
                                                    } finally {
                                                        setIsExporting(false);
                                                    }
                                                }}
                                            >
                                                {isExporting ? (
                                                    <Loader2 className="w-4 h-4 text-green-600 animate-spin" />
                                                ) : (
                                                    <FileSpreadsheet className="w-4 h-4 text-green-600" />
                                                )}
                                                <span>Excel (.xlsx)</span>
                                            </button>
                                        )}
                                        {onExportPDF && (
                                            <button
                                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                disabled={isExporting}
                                                onClick={async (e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setShowExportMenu(false);
                                                    setIsExporting(true);
                                                    
                                                    // Give UI thread time to render the loading spinner
                                                    await new Promise(resolve => setTimeout(resolve, 100));
                                                    
                                                    try {
                                                        await Promise.resolve(onExportPDF());
                                                    } finally {
                                                        setIsExporting(false);
                                                    }
                                                }}
                                            >
                                                {isExporting ? (
                                                    <Loader2 className="w-4 h-4 text-rose-600 animate-spin" />
                                                ) : (
                                                    <FileText className="w-4 h-4 text-rose-600" />
                                                )}
                                                <span>PDF (.pdf)</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        {/* More menu button */}
                        {hasMenuItems && (
                            <div className="relative" ref={menuRef}>
                                <button
                                    className="p-2 rounded-lg hover:bg-[hsl(var(--muted))] transition-all duration-200 cursor-pointer"
                                    title="เมนู"
                                    onClick={toggleMenu}
                                >
                                    <MoreVertical className="w-5 h-5 text-muted-foreground" />
                                </button>

                                {/* Dropdown Menu */}
                                {showMenu && (
                                    <div className="absolute right-0 top-full mt-1 w-48 bg-[hsl(var(--popover))] border border-[hsl(var(--border))] rounded-lg shadow-lg z-50 py-1">
                                        {linkTo && (
                                            <button
                                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
                                                onClick={handleNavigate}
                                            >
                                                <ExternalLink className="w-4 h-4 text-muted-foreground" />
                                                <span>ดูรายงาน</span>
                                            </button>
                                        )}
                                        {canViewQuery && (
                                            <button
                                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
                                                onClick={openPopup}
                                            >
                                                <Database className="w-4 h-4 text-muted-foreground" />
                                                <span>ดู SQL Query</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        {action}
                    </div>
                </div>
                <div className="flex-1 p-2 flex flex-col min-h-0">
                    {children}
                </div>
            </div>

            {/* Query Info Modal */}
            {canViewQuery && queryInfo && (
                <QueryModal
                    isOpen={showQueryPopup}
                    onClose={closePopup}
                    title={title}
                    queryInfo={queryInfo}
                />
            )}
        </>
    );
}
