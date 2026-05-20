'use client';

import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, LayoutDashboard, Menu } from 'lucide-react';
import { BranchSwitcher } from './layout/BranchSwitcher';
import { cn } from '@/lib/utils';
import { useComparison } from '@/lib/ComparisonContext';
import { useSidebar } from '@/lib/SidebarContext';
import { NotificationPanel } from './NotificationPanel';
import { SmartSearch } from './SmartSearch';

const pageNames: Record<string, string> = {
    '/': 'ภาพรวมธุรกิจ',
    '/accounting': 'การเงิน',
    '/purchase': 'จัดซื้อ',
    '/sales': 'การขาย',
    '/inventory': 'คลังสินค้า',
    '/settings': 'ตั้งค่า',
    '/comparison': 'เปรียบเทียบกิจการ',
    '/accounting/comparison': 'เปรียบเทียบการเงิน',
    '/sales/comparison': 'เปรียบเทียบการขาย',
    '/purchase/comparison': 'เปรียบเทียบจัดซื้อ',
    '/inventory/comparison': 'เปรียบเทียบคลังสินค้า',
    '/reports/sales': 'รายงานการขาย',
    '/reports/purchase': 'รายงานการจัดซื้อ',
    '/reports/inventory': 'รายงานคลังสินค้า',
    '/reports/accounting': 'รายงานการเงิน',
    '/test-chat': 'ทดสอบ Chat',
};

// Map from main page to comparison page
const comparisonRouteMap: Record<string, string> = {
    '/': '/comparison',
    '/accounting': '/accounting/comparison',
    '/sales': '/sales/comparison',
    '/inventory': '/inventory/comparison',
    '/purchase': '/purchase/comparison',
};

// Reverse: comparison page back to main page
const mainRouteFromComparison: Record<string, string> = {
    '/comparison': '/',
    '/accounting/comparison': '/accounting',
    '/sales/comparison': '/sales',
    '/inventory/comparison': '/inventory',
    '/purchase/comparison': '/purchase',
};

export function Header() {
    const pathname = usePathname();
    const router = useRouter();
    const { isComparisonMode, setComparisonMode, toggleComparisonMode } = useComparison();
    const { openMobileSidebar, isCollapsed } = useSidebar();

    const pageName = pageNames[pathname] || 'Dashboard';

    // ตรวจสอบว่าอยู่ในหน้าเปรียบเทียบหรือไม่
    const isComparisonView = pathname.includes('/comparison');

    // หน้า Reports: toggle mode ใน context โดยไม่ navigate ไปหน้าอื่น
    const isReportsPage = pathname.startsWith('/reports/');

    // สลับโหมดเปรียบเทียบ
    const handleToggleComparison = () => {
        if (isReportsPage) {
            // toggle context mode only, stay on same page
            toggleComparisonMode();
            return;
        }
        if (isComparisonView) {
            // ปิดโหมดเปรียบเทียบ → ไปหน้าหลัก
            setComparisonMode(false);
            const mainRoute = mainRouteFromComparison[pathname] || '/';
            router.push(mainRoute);
        } else {
            // เปิดโหมดเปรียบเทียบ → ไปหน้าเปรียบเทียบ
            setComparisonMode(true);
            const comparisonRoute = comparisonRouteMap[pathname] || '/comparison';
            router.push(comparisonRoute);
        }
    };

    return (
        <header className={cn(
            "h-16 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/80 backdrop-blur-md",
            "fixed top-0 right-0 z-40 px-4 lg:px-8 flex items-center justify-between",
            "transition-all duration-300",
            isCollapsed ? "left-0 lg:left-20" : "left-0 lg:left-72"
        )}>
            {/* Left: Hamburger (mobile) + Page Title */}
            <div className="flex items-center gap-3">
                {/* Hamburger button — mobile/tablet only */}
                <button
                    type="button"
                    onClick={openMobileSidebar}
                    className="lg:hidden p-2 rounded-lg hover:bg-[hsl(var(--accent))] transition-colors"
                    aria-label="Open menu"
                >
                    <Menu className="h-5 w-5" />
                </button>

                <div className="flex items-center text-sm text-[hsl(var(--muted-foreground))]">
                    <span className="font-medium text-[hsl(var(--foreground))]">{pageName}</span>
                </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 lg:gap-4">
                {/* Branch Switcher */}
                <BranchSwitcher />

                <SmartSearch />

                {/* Comparison Toggle Button — icon only on mobile */}
                <button
                    onClick={handleToggleComparison}
                    className={cn(
                        "inline-flex items-center gap-2 h-9 px-2 lg:px-4 rounded-lg border text-sm font-medium transition-colors",
                        (isComparisonView || (isReportsPage && isComparisonMode))
                            ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                            : "border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]"
                    )}
                >
                    {(isComparisonView || (isReportsPage && isComparisonMode)) ? (
                        <>
                            <LayoutDashboard className="h-4 w-4" />
                            <span className="hidden lg:inline">ภาพรวม</span>
                        </>
                    ) : (
                        <>
                            <BarChart3 className="h-4 w-4" />
                            <span className="hidden lg:inline">เปรียบเทียบกิจการ</span>
                        </>
                    )}
                </button>

                {/* Notifications */}
                <NotificationPanel />
            </div>
        </header>
    );
}
