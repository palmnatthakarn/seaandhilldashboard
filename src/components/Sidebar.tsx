'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard,
    ShoppingCart,
    Package,
    Settings,
    LogOut,
    ChevronRight,
    ChevronLeft,
    ChevronDown,
    PieChart,
    Calculator,
    FileText,
    TrendingUp,
    BarChart3,
    ClipboardList,
    X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/lib/SidebarContext';
import { useComparison } from '@/lib/ComparisonContext';
import { signOut, useSession } from '@/lib/auth-client';

const menuItems = [
    { name: 'ภาพรวม', icon: LayoutDashboard, href: '/' },
    { name: 'บัญชี', icon: Calculator, href: '/accounting' },
    { name: 'การขาย', icon: ShoppingCart, href: '/sales' },
    { name: 'สินค้าคงคลัง', icon: Package, href: '/inventory' },
    { name: 'จัดซื้อ', icon: ClipboardList, href: '/purchase' },
];

// Map main hrefs to comparison hrefs
const comparisonHrefMap: Record<string, string> = {
    '/': '/comparison',
    '/accounting': '/accounting/comparison',
    '/sales': '/sales/comparison',
    '/inventory': '/inventory/comparison',
    '/purchase': '/purchase/comparison',
};

// Report menu with submenus
const reportMenu = {
    name: 'รายงาน',
    icon: FileText,
    subItems: [
        { name: 'รายงานบัญชี', icon: Calculator, href: '/reports/accounting' },
        { name: 'รายงานการขาย', icon: TrendingUp, href: '/reports/sales' },
        { name: 'รายงานสินค้าคงคลัง', icon: BarChart3, href: '/reports/inventory' },
        { name: 'รายงานการจัดซื้อ', icon: ClipboardList, href: '/reports/purchase' },
    ]
};

const secondaryItems = [
    { name: 'ตั้งค่า', icon: Settings, href: '/settings' },
];

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05
        }
    }
};

const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0, transition: { type: 'spring' as const, bounce: 0, duration: 0.4 } }
};

const subscribeToClientSnapshot = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function getInitials(name: string, email: string) {
    const source = name.trim() || email.split('@')[0] || 'User';
    const words = source.split(/\s+/).filter(Boolean);

    if (words.length >= 2) {
        return `${words[0][0]}${words[1][0]}`.toUpperCase();
    }

    return source.substring(0, 2).toUpperCase();
}

export function Sidebar() {
    const { data: session } = useSession();
    const user = session?.user;
    const hasMounted = useSyncExternalStore(subscribeToClientSnapshot, getClientSnapshot, getServerSnapshot);
    const userEmail = user?.email ?? '';
    const userName = user?.name || userEmail.split('@')[0] || 'User';
    const displayEmail = hasMounted ? userEmail : '';
    const displayName = hasMounted ? userName : 'User';
    const displayInitials = getInitials(displayName, displayEmail);
    const pathname = usePathname();
    const router = useRouter();
    const { isCollapsed, toggleSidebar, isMobileSidebarOpen, closeMobileSidebar, setIsCollapsed } = useSidebar();
    const { isComparisonMode } = useComparison();
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        let active = true;

        fetch('/api/admin/me')
            .then((response) => response.ok ? response.json() : null)
            .then((json) => {
                if (active) {
                    setIsAdmin(Boolean(json?.data?.isAdmin));
                }
            })
            .catch(() => {
                if (active) {
                    setIsAdmin(false);
                }
            });

        return () => {
            active = false;
        };
    }, [displayEmail]);

    // Check if any report submenu is active
    const isReportActive = reportMenu.subItems.some(item => pathname.startsWith(item.href));

    const handleNavClick = () => {
        // Close mobile overlay when navigating
        closeMobileSidebar();
    };

    // Handle report menu click
    const handleReportMenuClick = () => {
        if (displayCollapsed) {
            // If collapsed, expand sidebar, open report menu, and navigate to first report
            setIsCollapsed(false);
            setIsReportOpen(true);
            router.push(reportMenu.subItems[0].href); // Navigate to รายงานบัญชี
        } else {
            // If expanded, just toggle report menu
            setIsReportOpen(!isReportOpen);
        }
    };

    const handleSignOut = async () => {
        await signOut({
            fetchOptions: {
                onSuccess: () => {
                    window.location.href = '/login';
                },
            },
        });
    };

    // On mobile drawer, always show full content regardless of collapsed state
    const displayCollapsed = isCollapsed && !isMobileSidebarOpen;

    return (
        <>
            {/* Mobile overlay backdrop */}
            {isMobileSidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm xl:hidden"
                    onClick={closeMobileSidebar}
                />
            )}
        <aside className={cn(
            "fixed inset-y-0 left-0 z-50 bg-[hsl(var(--card))] border-r border-[hsl(var(--border))] flex flex-col transition-all duration-300",
            // Wide desktop: always visible, collapsible
            "xl:translate-x-0",
            // Mobile: hidden off-screen, slide in when open
            isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full xl:translate-x-0",
            // Width: on mobile always full (w-72), on desktop collapsible
            isCollapsed ? "xl:w-20 w-72" : "w-72"
        )}>
            {/* Logo Section */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-[hsl(var(--border))]">
                <div className={cn(
                    "flex items-center gap-3 transition-all duration-300",
                    displayCollapsed && "justify-center w-full"
                )}>
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 flex-shrink-0">
                        <PieChart className="h-5 w-5 text-white" />
                    </div>
                    {!displayCollapsed && (
                        <span className="text-lg font-bold tracking-tight text-[hsl(var(--foreground))] whitespace-nowrap">
                            MIS Dashboard
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={closeMobileSidebar}
                    className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] xl:hidden"
                    aria-label="ปิดเมนู"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            {/* Toggle Button — desktop only */}
            <button
                onClick={toggleSidebar}
                className="hidden xl:flex absolute -right-3 top-[3.25rem] h-6 w-6 rounded-full bg-[hsl(var(--primary))] text-white shadow-lg items-center justify-center hover:scale-110 transition-transform z-50"
            >
                {isCollapsed ? (
                    <ChevronRight className="h-4 w-4" />
                ) : (
                    <ChevronLeft className="h-4 w-4" />
                )}
            </button>

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto py-6 px-3 space-y-6">
                <div>
                    {!displayCollapsed && (
                        <p className="px-4 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">
                            Menu
                        </p>
                    )}
                    <motion.nav 
                        className="space-y-1"
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                    >
                        {menuItems.map((item) => {
                            const actualHref = isComparisonMode
                                ? (comparisonHrefMap[item.href] || item.href)
                                : item.href;
                            const isActive = isComparisonMode
                                ? pathname === comparisonHrefMap[item.href]
                                : pathname === item.href;
                            return (
                                <motion.div key={item.href} variants={itemVariants}>
                                    <Link
                                        href={actualHref}
                                        onClick={handleNavClick}
                                        title={displayCollapsed ? item.name : undefined}
                                        className={cn(
                                            "flex items-center gap-3 py-3 text-sm font-medium rounded-xl transition-all duration-300 group",
                                            displayCollapsed ? "px-3 justify-center" : "px-4",
                                            isActive
                                                ? "bg-[hsl(var(--primary))] text-white shadow-lg shadow-indigo-500/25"
                                                : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]"
                                        )}
                                    >
                                        <item.icon className={cn(
                                            "h-5 w-5 transition-colors flex-shrink-0",
                                            isActive ? "text-white" : "text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]"
                                        )} />
                                        {!displayCollapsed && (
                                            <>
                                                <span className="flex-1">{item.name}</span>
                                                {isActive && (
                                                    <ChevronRight className="ml-auto h-4 w-4 text-white/50" />
                                                )}
                                            </>
                                        )}
                                    </Link>
                                </motion.div>
                            );
                        })}

                        {/* Report Dropdown Menu */}
                        <motion.div variants={itemVariants} className="relative group">
                            <button
                                onClick={handleReportMenuClick}
                                title={displayCollapsed ? reportMenu.name : undefined}
                                className={cn(
                                    "w-full flex items-center gap-3 py-3 text-sm font-medium rounded-xl transition-all duration-200 group",
                                    displayCollapsed ? "px-3 justify-center" : "px-4",
                                    isReportActive
                                        ? "bg-[hsl(var(--primary))] text-white shadow-lg shadow-indigo-500/25"
                                        : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]"
                                )}
                            >
                                <reportMenu.icon className={cn(
                                    "h-5 w-5 transition-colors flex-shrink-0",
                                    isReportActive ? "text-white" : "text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]"
                                )} />
                                {!displayCollapsed && (
                                    <>
                                        <span className="flex-1 text-left">{reportMenu.name}</span>
                                        <ChevronDown className={cn(
                                            "h-4 w-4 transition-transform duration-200",
                                            isReportOpen && "rotate-180",
                                            isReportActive ? "text-white/50" : ""
                                        )} />
                                    </>
                                )}
                            </button>

                            {/* Submenu */}
                            <AnimatePresence>
                                {!displayCollapsed && isReportOpen && (
                                    <motion.div 
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="mt-1 ml-4 pl-4 border-l-2 border-[hsl(var(--border))] space-y-1">
                                            {reportMenu.subItems.map((subItem) => {
                                                const isSubActive = pathname === subItem.href;
                                                return (
                                                    <Link
                                                        key={subItem.href}
                                                        href={subItem.href}
                                                        onClick={handleNavClick}
                                                        className={cn(
                                                            "flex items-center gap-3 py-2.5 px-3 text-sm font-medium rounded-lg transition-all duration-200 group",
                                                            isSubActive
                                                                ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                                                                : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]"
                                                        )}
                                                    >
                                                        <subItem.icon className={cn(
                                                            "h-4 w-4 transition-colors flex-shrink-0",
                                                            isSubActive ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]"
                                                        )} />
                                                        <span>{subItem.name}</span>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                        </motion.div>
                    </motion.nav>
                </div>

                <div>
                    {!displayCollapsed && (
                        <p className="px-4 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">
                            Other
                        </p>
                    )}
                    <motion.nav 
                        className="space-y-1"
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                    >
                        {secondaryItems.filter((item) => item.href !== '/settings' || isAdmin).map((item) => (
                            <motion.div key={item.href} variants={itemVariants}>
                                <Link
                                    href={item.href}
                                    onClick={handleNavClick}
                                    title={displayCollapsed ? item.name : undefined}
                                    className={cn(
                                        "flex items-center gap-3 py-3 text-sm font-medium rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))] transition-all duration-200 group",
                                        displayCollapsed ? "px-3 justify-center" : "px-4"
                                    )}
                                >
                                    <item.icon className="h-5 w-5 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))] transition-colors flex-shrink-0" />
                                    {!displayCollapsed && item.name}
                                </Link>
                            </motion.div>
                        ))}
                        <motion.div variants={itemVariants}>
                            <button
                                title={displayCollapsed ? "ออกจากระบบ" : undefined}
                                onClick={handleSignOut}
                                className={cn(
                                    "w-full flex items-center gap-3 py-3 text-sm font-medium rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all duration-200 group",
                                    displayCollapsed ? "px-3 justify-center" : "px-4"
                                )}
                            >
                                <LogOut className="h-5 w-5 group-hover:scale-110 transition-transform flex-shrink-0" />
                                {!displayCollapsed && "ออกจากระบบ"}
                            </button>
                        </motion.div>
                    </motion.nav>
                </div>
            </div>

            {/* User Profile */}
            <div className={cn(
                "bg-[hsl(var(--card))] p-3 transition-all duration-300",
                displayCollapsed && "p-2"
            )}>
                <div
                    title={displayCollapsed ? `${displayName} ${displayEmail}` : undefined}
                    className={cn(
                        "flex min-w-0 items-center",
                        displayCollapsed ? "justify-center p-2" : "gap-3 px-3 py-3"
                    )}
                >
                    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-md shadow-indigo-500/20">
                        {displayInitials}
                        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[hsl(var(--background))] bg-emerald-500" />
                    </div>
                    {!displayCollapsed && (
                        <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                                <p className="min-w-0 truncate text-sm font-semibold text-[hsl(var(--foreground))]" title={displayName}>
                                    {displayName}
                                </p>
                                {isAdmin && (
                                    <span className="shrink-0 rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--primary))]">
                                        Admin
                                    </span>
                                )}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]" title={displayEmail}>
                                {displayEmail || 'กำลังโหลดข้อมูล'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </aside>
        </>
    );
}
