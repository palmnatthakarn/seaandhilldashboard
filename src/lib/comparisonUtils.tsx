import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── Shared branch color palette ─── */
export const BRANCH_PALETTE = [
  { gradient: 'from-indigo-500 to-indigo-600', bg: 'bg-indigo-50', text: 'text-indigo-700', hex: '#6366f1', light: 'bg-indigo-500' },
  { gradient: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-50', text: 'text-emerald-700', hex: '#10b981', light: 'bg-emerald-500' },
  { gradient: 'from-amber-500 to-amber-600', bg: 'bg-amber-50', text: 'text-amber-700', hex: '#f59e0b', light: 'bg-amber-500' },
  { gradient: 'from-rose-500 to-rose-600', bg: 'bg-rose-50', text: 'text-rose-700', hex: '#ef4444', light: 'bg-rose-500' },
  { gradient: 'from-cyan-500 to-cyan-600', bg: 'bg-cyan-50', text: 'text-cyan-700', hex: '#06b6d4', light: 'bg-cyan-500' },
  { gradient: 'from-violet-500 to-violet-600', bg: 'bg-violet-50', text: 'text-violet-700', hex: '#8b5cf6', light: 'bg-violet-500' },
] as const;

/* ─── Shared formatters ─── */
export const fmt = (v: number) =>
  `฿${v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtShort = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `฿${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `฿${(v / 1_000).toFixed(1)}K`;
  return `฿${v.toFixed(0)}`;
};

export const fmtNum = (v: number) =>
  v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtK = (v: number) =>
  Math.abs(v) >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1)}M`
    : Math.abs(v) >= 1_000
    ? `${(v / 1_000).toFixed(0)}K`
    : v.toFixed(0);

export const shortName = (name: string) =>
  name.replace(/บริษัท\s*|จำกัด/g, '').trim().substring(0, 25);

/* ─── Shared sub-components ─── */
export function GrowthBadge({ value }: { value?: number }) {
  if (value === undefined || value === null) return null;
  const isUp = value > 0;
  const isDown = value < 0;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md',
      isUp && 'bg-emerald-50 text-emerald-600',
      isDown && 'bg-rose-50 text-rose-600',
      !isUp && !isDown && 'bg-muted text-muted-foreground',
    )}>
      {isUp ? <ArrowUpRight className="w-3 h-3" /> : isDown ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export function SectionHeader({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="px-6 pt-5 pb-3">
      <h2 className="text-base font-bold text-foreground flex items-center gap-2">{icon}{title}</h2>
      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
    </div>
  );
}

export function BranchDot({ idx }: { idx: number }) {
  return (
    <div className={cn('h-2.5 w-2.5 rounded-full flex-shrink-0', BRANCH_PALETTE[idx % BRANCH_PALETTE.length].light)} />
  );
}
