"use client";

import React from "react";

export interface CustomTooltipItem {
  name?: string;
  value?: number | string | null;
  color?: string;
  fill?: string;
  stroke?: string;
  unit?: string;
  dataKey?: string;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: CustomTooltipItem[];
  label?: string;
  formatter?: (value: number | string | null, name: string) => React.ReactNode;
  labelPrefix?: string;
  unit?: string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelPrefix = "",
  unit = "",
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border/80 bg-card/95 px-3.5 py-2.5 text-xs text-card-foreground shadow-xl backdrop-blur-md transition-all select-none min-w-[150px] z-50">
      {label && (
        <div className="font-semibold text-foreground mb-2 pb-1.5 border-b border-border/50 text-[11px] tracking-wide">
          {labelPrefix ? `${labelPrefix}: ` : ""}
          <span className="text-foreground/90">{label}</span>
        </div>
      )}

      <div className="space-y-1.5">
        {payload.map((item, index) => {
          const itemColor = item.color || item.fill || item.stroke || "#3b82f6";
          const itemName = item.name || item.dataKey || "Metric";
          
          let displayValue: React.ReactNode = "0";
          if (formatter) {
            displayValue = formatter(item.value ?? 0, itemName);
          } else if (item.value !== null && item.value !== undefined) {
            const num = Number(item.value);
            if (!isNaN(num)) {
              displayValue = (
                <span>
                  {num.toLocaleString()}
                  {item.unit || unit ? ` ${item.unit || unit}` : ""}
                </span>
              );
            } else {
              displayValue = String(item.value);
            }
          }

          return (
            <div key={`tooltip-item-${index}-${itemName}`} className="flex items-center justify-between gap-3 text-[11px]">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                  style={{ backgroundColor: itemColor }}
                  aria-hidden="true"
                />
                <span className="text-muted-foreground truncate font-medium">{itemName}:</span>
              </div>
              <span className="font-bold text-foreground font-mono shrink-0">
                {displayValue}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
