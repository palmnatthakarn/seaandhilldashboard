import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

export interface SimpleKPICardProps {
  icon: LucideIcon;
  iconColor?: string;
  label: string;
  value: string | number;
  subText?: string;
  barColor?: string;
  valueColor?: string;
  format?: 'money' | 'number' | 'percent' | 'decimal' | 'turnover' | 'custom';
  className?: string;
}

export function SimpleKPICard({
  icon: Icon,
  iconColor = 'text-indigo-600',
  label,
  value,
  subText,
  barColor = 'bg-indigo-500',
  valueColor,
  format = 'custom',
  className,
}: SimpleKPICardProps) {
  
  const formatValue = (val: string | number): string => {
    if (typeof val === 'string') return val;
    
    switch (format) {
      case 'money':
        if (Math.abs(val) >= 1_000_000) return `฿${(val / 1_000_000).toFixed(2)}M`;
        if (Math.abs(val) >= 1_000) return `฿${(val / 1_000).toFixed(1)}K`;
        return `฿${val.toFixed(0)}`;
      case 'number': {
        return val.toLocaleString('th-TH', { 
          minimumFractionDigits: 2,
          maximumFractionDigits: 2 
        });
      }
      case 'percent':
        return `${val.toFixed(1)}%`;
      case 'decimal':
        return val.toFixed(2);
      case 'turnover':
        return `${val.toFixed(2)}x`;
      default:
        return String(val);
    }
  };

  return (
    <div className={cn(
      'rounded-2xl border bg-card overflow-hidden transform transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 relative',
      className
    )}>
      {/* Background decoration circle */}
      <div className={cn(
        'absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-[0.08]',
        barColor
      )} />
      
      <div className="p-5 relative">
        <div className="flex items-center gap-3 mb-4">
          {/* Icon in colored box */}
          <div className={cn(
            'p-2 rounded-lg',
            barColor,
            'bg-opacity-10'
          )}>
            <Icon className={cn('h-5 w-5', iconColor)} />
          </div>
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
        </div>
        <div className={cn('text-2xl font-bold mb-1', valueColor)}>
          {formatValue(value)}
        </div>
        {subText && (
          <p className="text-xs text-muted-foreground">{subText}</p>
        )}
      </div>
    </div>
  );
}

export interface KPIGridProps {
  cards: SimpleKPICardProps[];
  columns?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}

export function KPIGrid({ cards, columns = 5, className }: KPIGridProps) {
  const gridCols = {
    2: 'lg:grid-cols-2',
    3: 'lg:grid-cols-3',
    4: 'lg:grid-cols-4',
    5: 'lg:grid-cols-5',
    6: 'lg:grid-cols-6',
  };

  return (
    <div className={cn('grid gap-4 grid-cols-2', gridCols[columns], className)}>
      {cards.map((card, idx) => (
        <SimpleKPICard key={idx} {...card} />
      ))}
    </div>
  );
}

// Export types
export type { LucideIcon };
