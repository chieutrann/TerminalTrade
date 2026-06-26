import React, { useEffect, useMemo, useState } from 'react';
import { useTradingStore } from '../store/useTradingStore';
import { useGetSymbols, getGetSymbolsQueryKey } from '@workspace/api-client-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';
import { useWebsocket } from '../hooks/useWebsocket';

const TIME_ZONE_OPTIONS = [
  { label: 'UTC', value: 'UTC' },
  { label: 'Local', value: 'local' },
  { label: 'New York', value: 'America/New_York' },
  { label: 'London', value: 'Europe/London' },
  { label: 'Berlin / Vienna', value: 'Europe/Vienna' },
  { label: 'Tokyo', value: 'Asia/Tokyo' },
  { label: 'Shanghai', value: 'Asia/Shanghai' },
  { label: 'Singapore', value: 'Asia/Singapore' },
  { label: 'Sydney', value: 'Australia/Sydney' },
];

function resolveChartTimeZone(timeZone: string): string {
  if (timeZone === 'local') {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  }

  return timeZone;
}

function getTimeZoneAbbreviation(timeZone: string): string {
  const resolvedTimeZone = resolveChartTimeZone(timeZone);

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: resolvedTimeZone,
      timeZoneName: 'short',
    }).formatToParts(new Date());

    return parts.find((part) => part.type === 'timeZoneName')?.value ?? resolvedTimeZone;
  } catch {
    return 'UTC';
  }
}

function formatClockForTimeZone(date: Date, timeZone: string): string {
  const resolvedTimeZone = resolveChartTimeZone(timeZone);

  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: resolvedTimeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 19);
  }
}

export default function TopBar() {
  const {
    symbol,
    setSymbol,
    interval,
    setInterval,
    favoriteIntervals,
    chartTimeZone,
    setChartTimeZone,
    theme,
    setTheme,
  } = useTradingStore();
  
  const { data: symbolsData } = useGetSymbols({
    query: { queryKey: getGetSymbolsQueryKey() }
  });
  const symbols = Array.isArray(symbolsData?.symbols) ? symbolsData.symbols : [symbol];

  const { status, lastCandle } = useWebsocket(symbol, interval);
  const [currentClockTime, setCurrentClockTime] = useState(() => new Date());
  const chartTimeZoneLabel = useMemo(() => getTimeZoneAbbreviation(chartTimeZone), [chartTimeZone]);
  const bottomClockLabel = useMemo(
    () => `${formatClockForTimeZone(currentClockTime, chartTimeZone)} ${chartTimeZoneLabel}`,
    [chartTimeZone, chartTimeZoneLabel, currentClockTime],
  );

  useEffect(() => {
    const timerId = window.setInterval(() => setCurrentClockTime(new Date()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const change = lastCandle ? lastCandle.close - lastCandle.open : null;
  const changePercent = lastCandle && lastCandle.open !== 0 ? (change! / lastCandle.open) * 100 : null;
  const isUp = (change ?? 0) >= 0;

  return (
    <div className="h-14 shrink-0 border-b border-border bg-card flex items-center justify-between px-3" data-testid="topbar">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Select value={symbol} onValueChange={setSymbol}>
          <SelectTrigger className="h-9 w-[126px] shrink-0 border-border bg-secondary/50 font-mono text-sm font-bold shadow-none sm:w-[180px] sm:text-lg" data-testid="select-symbol">
            <SelectValue placeholder="Select Symbol" />
          </SelectTrigger>
          <SelectContent>
            {symbols.map(s => (
              <SelectItem key={s} value={s} className="font-mono">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-w-max items-center gap-1">
            {favoriteIntervals.map((item) => {
              const active = interval === item;
              return (
                <Button
                  key={item}
                  variant="ghost"
                  size="sm"
                  className={`h-8 min-w-9 rounded-md px-2.5 font-mono text-xs ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-[0_0_18px_rgba(139,92,246,0.45)]'
                      : 'text-muted-foreground hover:bg-secondary'
                  }`}
                  onClick={() => setInterval(item)}
                  data-testid={`btn-interval-${item}`}
                >
                  {item}
                </Button>
              );
            })}

            <div className="ml-2 flex h-8 items-center overflow-hidden rounded-md border border-border bg-secondary/50 font-mono text-xs">
              <Select value={chartTimeZone} onValueChange={setChartTimeZone}>
                <SelectTrigger
                  className="h-8 w-[86px] border-0 bg-transparent px-2 font-mono text-xs shadow-none focus:ring-0"
                  data-testid="select-chart-timezone"
                  title={`Chart timezone: ${resolveChartTimeZone(chartTimeZone)}`}
                >
                  <SelectValue placeholder="UTC" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_ZONE_OPTIONS.map((timeZone) => (
                    <SelectItem key={timeZone.value} value={timeZone.value} className="font-mono">
                      {timeZone.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="hidden h-full min-w-[112px] items-center justify-center border-l border-border px-2 font-semibold tabular-nums text-foreground sm:flex">
                {bottomClockLabel}
              </div>
            </div>
          </div>
        </div>

        {lastCandle && (
          <div className="hidden shrink-0 items-baseline gap-2 font-mono text-xs sm:flex sm:text-sm">
            <span className={isUp ? "text-emerald-400" : "text-red-400"}>
              {lastCandle.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className={isUp ? "text-emerald-400" : "text-red-400"}>
              {changePercent === null ? '' : `${isUp ? '+' : ''}${changePercent.toFixed(2)}%`}
            </span>
          </div>
        )}
      </div>

      <div className="ml-2 flex shrink-0 items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`h-2.5 w-2.5 rounded-full ${status === 'connected' ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]' : 'bg-red-500'}`} />
          <span className="hidden capitalize sm:inline">{status}</span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          data-testid="btn-theme-toggle"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
