import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    positive: boolean;
  };
  className?: string;
}

export function StatsCard({ title, value, subtitle, icon: Icon, trend, className }: StatsCardProps) {
  return (
    <div className={cn("glass-card p-6 animate-fade-in", className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              "text-sm mt-2 font-medium",
              trend.positive ? "text-success" : "text-destructive"
            )}>
              {trend.positive ? "+" : "-"}{Math.abs(trend.value)}%
              <span className="text-muted-foreground ml-1">vs. letzte Woche</span>
            </p>
          )}
        </div>
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-6 h-6 text-primary" />
        </div>
      </div>
    </div>
  );
}
