'use client';

import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { SidebarProvider, useSidebar } from '@/lib/SidebarContext';
import { useBranchAutoSwitch } from '@/hooks/useBranchAutoSwitch';
import { cn } from '@/lib/utils';

function MainLayoutContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();

  // Auto-switch from "ALL" to "B1" when leaving comparison page
  useBranchAutoSwitch();

  return (
    <div className="min-h-screen overflow-x-hidden">
      <Sidebar />
      <div className={cn(
        "min-h-screen flex flex-col transition-all duration-300",
        // Wide desktop: shift right based on sidebar width
        // Mobile/tablet: no margin (sidebar is overlay)
        isCollapsed ? "xl:ml-20" : "xl:ml-72"
      )}>
        <Header />
        <main className="flex-1 mt-16 p-3 sm:p-4 lg:p-8 w-full overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <MainLayoutContent>{children}</MainLayoutContent>
    </SidebarProvider>
  );
}
