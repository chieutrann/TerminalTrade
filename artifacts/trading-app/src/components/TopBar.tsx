import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTradingStore } from '../store/useTradingStore';
import { useGetSymbols, getGetSymbolsQueryKey } from '@workspace/api-client-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Moon, Star, Sun } from 'lucide-react';
import { useWebsocket } from '../hooks/useWebsocket';
import {
  formatDuration,
  formatIntervalButton,
  intervalGroup,
  intervalToChartInterval,
  normalizeInterval,
  normalizeIntervalKey,
  secondsUntilIntervalClose,
  supportsSecondIntervals,
  supportsTickIntervals,
  type IntervalGroupId,
} from '../lib/intervals';

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

type IntervalMenuItem = {
  label: string;
  value: string;
  kind: 'tick' | 'time';
  custom?: boolean;
};

type IntervalMenuGroup = {
  id: IntervalGroupId;
  label: string;
  items: IntervalMenuItem[];
};

const INTERVAL_MENU_GROUPS: IntervalMenuGroup[] = [
  {
    id: 'ticks',
    label: 'TICKS',
    items: [
      { label: '1 tick', value: '1t', kind: 'tick' },
      { label: '10 ticks', value: '10t', kind: 'tick' },
      { label: '100 ticks', value: '100t', kind: 'tick' },
      { label: '1000 ticks', value: '1000t', kind: 'tick' },
    ],
  },
  {
    id: 'seconds',
    label: 'SECONDS',
    items: [
      { label: '1 second', value: '1s', kind: 'time' },
      { label: '5 seconds', value: '5s', kind: 'time' },
      { label: '10 seconds', value: '10s', kind: 'time' },
      { label: '15 seconds', value: '15s', kind: 'time' },
      { label: '30 seconds', value: '30s', kind: 'time' },
      { label: '45 seconds', value: '45s', kind: 'time' },
    ],
  },
  {
    id: 'minutes',
    label: 'MINUTES',
    items: [
      { label: '1 minute', value: '1m', kind: 'time' },
      { label: '3 minutes', value: '3m', kind: 'time' },
      { label: '5 minutes', value: '5m', kind: 'time' },
      { label: '15 minutes', value: '15m', kind: 'time' },
      { label: '30 minutes', value: '30m', kind: 'time' },
      { label: '45 minutes', value: '45m', kind: 'time' },
    ],
  },
  {
    id: 'hours',
    label: 'HOURS',
    items: [
      { label: '1 hour', value: '1h', kind: 'time' },
      { label: '2 hours', value: '2h', kind: 'time' },
      { label: '4 hours', value: '4h', kind: 'time' },
    ],
  },
  {
    id: 'days',
    label: 'DAYS',
    items: [
      { label: '1 day', value: '1d', kind: 'time' },
    ],
  },
  {
    id: 'weeks',
    label: 'WEEKS',
    items: [
      { label: '1 week', value: '1w', kind: 'time' },
    ],
  },
  {
    id: 'months',
    label: 'MONTHS',
    items: [
      { label: '1 month', value: '1mo', kind: 'time' },
    ],
  },
];

const CUSTOM_INTERVAL_TYPES = [
  { label: 'ticks', unit: 't' },
  { label: 'seconds', unit: 's' },
  { label: 'minutes', unit: 'm' },
  { label: 'hours', unit: 'h' },
  { label: 'days', unit: 'd' },
  { label: 'weeks', unit: 'w' },
  { label: 'months', unit: 'mo' },
] as const;

type CustomIntervalUnit = (typeof CUSTOM_INTERVAL_TYPES)[number]['unit'];

type DataSourceId = 'coinbase' | 'binance';

const DATA_SOURCES: Array<{ id: DataSourceId; label: string }> = [
  { id: 'coinbase', label: 'Coinbase' },
  { id: 'binance', label: 'Binance' },
];

function dataSourceForSymbol(symbol: string): DataSourceId {
  return symbol.endsWith('/USD') ? 'coinbase' : 'binance';
}

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

function formatIntervalMenuLabel(interval: string): string {
  const value = interval.trim().toLowerCase();
  const match = value.match(/^([1-9][0-9]*)(t|s|m|h|d|w|mo)$/);
  if (!match) return interval;

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  const plural = amount === 1 ? '' : 's';
  const labels: Record<string, string> = {
    t: 'tick',
    s: 'second',
    m: 'minute',
    h: 'hour',
    d: 'day',
    w: 'week',
    mo: 'month',
  };

  return `${amount} ${labels[unit]}${plural}`;
}

function intervalSortValue(interval: string): number {
  const intervalKey = normalizeIntervalKey(interval);
  if (!intervalKey) return Number.MAX_SAFE_INTEGER;

  const match = intervalKey.match(/^([1-9][0-9]*)(t|s|m|h|d|w|mo)$/);
  if (!match) return Number.MAX_SAFE_INTEGER;

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 't':
      // Keep tick intervals before time-based intervals.
      return amount / 1000000;
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 60 * 60;
    case 'd':
      return amount * 24 * 60 * 60;
    case 'w':
      return amount * 7 * 24 * 60 * 60;
    case 'mo':
      return amount * 30 * 24 * 60 * 60;
    default:
      return Number.MAX_SAFE_INTEGER;
  }
}

export default function TopBar() {
  const {
    symbol,
    setSymbol,
    interval,
    setInterval,
    favoriteIntervals,
    customIntervals,
    addCustomInterval,
    toggleFavoriteInterval,
    chartTimeZone,
    setChartTimeZone,
    theme,
    setTheme,
  } = useTradingStore();
  
  const { data: symbolsData } = useGetSymbols({
    query: { queryKey: getGetSymbolsQueryKey() }
  });
  const symbols = Array.isArray(symbolsData?.symbols) ? symbolsData.symbols : [symbol];
  const dataSource = dataSourceForSymbol(symbol);
  const dataSourceLabel =
    DATA_SOURCES.find((source) => source.id === dataSource)?.label ?? dataSource;

  const { status, lastCandle } = useWebsocket(symbol, interval);
  const [currentClockTime, setCurrentClockTime] = useState(() => new Date());
  const [customIntervalDialogOpen, setCustomIntervalDialogOpen] = useState(false);
  const [customIntervalType, setCustomIntervalType] = useState<CustomIntervalUnit>('m');
  const [customIntervalValue, setCustomIntervalValue] = useState('');
  const intervalScrollerRef = useRef<HTMLDivElement>(null);
  const intervalSwipeRef = useRef({
    pointerId: null as number | null,
    startX: 0,
    scrollLeft: 0,
    didSwipe: false,
    suppressClickUntil: 0,
  });
  const chartTimeZoneLabel = useMemo(() => getTimeZoneAbbreviation(chartTimeZone), [chartTimeZone]);
  const secondsSupported = useMemo(() => supportsSecondIntervals(symbol), [symbol]);
  const ticksSupported = useMemo(() => supportsTickIntervals(), []);
  const sortedFavoriteIntervals = useMemo(
    () =>
      [...favoriteIntervals].sort((a, b) => {
        const sortDiff = intervalSortValue(a) - intervalSortValue(b);
        if (sortDiff !== 0) return sortDiff;

        return formatIntervalButton(normalizeIntervalKey(a) ?? a).localeCompare(
          formatIntervalButton(normalizeIntervalKey(b) ?? b),
        );
      }),
    [favoriteIntervals],
  );
  const intervalMenuGroups = useMemo(() => {
    const groups = INTERVAL_MENU_GROUPS.map((group) => ({
      ...group,
      items: [...group.items],
    }));

    customIntervals.forEach((rawInterval) => {
      const intervalKey = normalizeIntervalKey(rawInterval);
      if (!intervalKey) return;

      const groupId = intervalGroup(intervalKey);
      const group = groups.find((item) => item.id === groupId);
      if (!group) return;

      const exists = group.items.some((item) => item.value === intervalKey);
      if (exists) return;

      group.items.push({
        label: formatIntervalMenuLabel(intervalKey),
        value: intervalKey,
        kind: intervalKey.endsWith('t') ? 'tick' : 'time',
        custom: true,
      });
    });

    return groups;
  }, [customIntervals]);
  const bottomClockLabel = useMemo(
    () => `${formatClockForTimeZone(currentClockTime, chartTimeZone)} ${chartTimeZoneLabel}`,
    [chartTimeZone, chartTimeZoneLabel, currentClockTime],
  );
  const countdownLabel = useMemo(() => {
    const remainingSeconds = secondsUntilIntervalClose(currentClockTime.getTime(), interval);
    return remainingSeconds === null ? '--:--' : formatDuration(remainingSeconds);
  }, [currentClockTime, interval]);

  useEffect(() => {
    const timerId = window.setInterval(() => setCurrentClockTime(new Date()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    const scroller = intervalScrollerRef.current;
    if (!scroller) return;

    const activeButton = scroller.querySelector<HTMLElement>('[data-active-interval="true"]');
    if (!activeButton) return;

    activeButton.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [interval, sortedFavoriteIntervals]);

  const customIntervalCandidate = useMemo(() => {
    const value = customIntervalValue.trim();
    if (!/^[1-9][0-9]*$/.test(value)) return null;
    return normalizeIntervalKey(`${value}${customIntervalType}`);
  }, [customIntervalType, customIntervalValue]);

  const customIntervalDisabledReason = useMemo(() => {
    if (!customIntervalCandidate) return 'Enter a valid interval';
    if (customIntervalCandidate.endsWith('t') && !ticksSupported) {
      return 'Tick intervals are not supported by the current feed';
    }
    if (customIntervalCandidate.endsWith('s') && !secondsSupported) {
      return 'Second intervals require a Binance-backed symbol';
    }
    return null;
  }, [customIntervalCandidate, secondsSupported]);

  const applyCustomInterval = () => {
    if (!customIntervalCandidate || customIntervalDisabledReason) return;
    const chartInterval = intervalToChartInterval(customIntervalCandidate);
    if (!chartInterval) return;
    addCustomInterval(customIntervalCandidate);
    setInterval(chartInterval);
    setCustomIntervalDialogOpen(false);
    setCustomIntervalValue('');
  };

  const intervalDisabledReason = (item: IntervalMenuItem): string | null => {
    if (item.kind === 'tick' && !ticksSupported) return 'Tick intervals are not supported by the current feed';
    if (item.value.endsWith('s') && !secondsSupported) {
      return 'Second intervals require a Binance-backed symbol';
    }
    return null;
  };

  const selectMenuInterval = (item: IntervalMenuItem) => {
    if (intervalDisabledReason(item)) return;
    const normalized = intervalToChartInterval(item.value);
    if (normalized) setInterval(normalized);
  };

  const change = lastCandle ? lastCandle.close - lastCandle.open : null;
  const changePercent = lastCandle && lastCandle.open !== 0 ? (change! / lastCandle.open) * 100 : null;
  const isUp = (change ?? 0) >= 0;

  const startIntervalSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    const scroller = intervalScrollerRef.current;
    if (!scroller) return;

    intervalSwipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: scroller.scrollLeft,
      didSwipe: false,
      suppressClickUntil: 0,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveIntervalSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    const scroller = intervalScrollerRef.current;
    const swipe = intervalSwipeRef.current;

    if (!scroller || swipe.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - swipe.startX;

    if (Math.abs(deltaX) > 6) {
      swipe.didSwipe = true;
      swipe.suppressClickUntil = Date.now() + 250;
      scroller.scrollLeft = swipe.scrollLeft - deltaX;
      event.preventDefault();
    }
  };

  const endIntervalSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    const swipe = intervalSwipeRef.current;
    if (swipe.pointerId !== event.pointerId) return;

    if (swipe.didSwipe) {
      swipe.suppressClickUntil = Date.now() + 250;
    }

    swipe.pointerId = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const shouldSuppressIntervalClick = () => {
    const swipe = intervalSwipeRef.current;
    return swipe.didSwipe || Date.now() < swipe.suppressClickUntil;
  };

  return (
    <>
    <div className="relative z-50 h-14 shrink-0 border-b border-border bg-card flex items-center justify-between px-2 sm:px-3" data-testid="topbar">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Select value={symbol} onValueChange={setSymbol}>
          <SelectTrigger className="h-9 w-[104px] shrink-0 border-border bg-secondary/50 font-mono text-xs font-bold shadow-none sm:w-[180px] sm:text-lg" data-testid="select-symbol">
            <SelectValue placeholder="Select Symbol" />
          </SelectTrigger>
          <SelectContent>
            {symbols.map(s => (
              <SelectItem key={s} value={s} className="font-mono">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div
          className="hidden h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-2 font-mono text-xs text-muted-foreground sm:flex"
          data-testid="data-source-indicator"
          title={`API data source: ${dataSourceLabel}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="hidden sm:inline">Source</span>
          <span className="font-semibold text-foreground">{dataSourceLabel}</span>
        </div>

        <div
          ref={intervalScrollerRef}
          className="min-w-0 flex-1 cursor-grab touch-pan-x select-none overflow-x-auto overscroll-x-contain scroll-smooth active:cursor-grabbing [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:overflow-visible"
          style={{ touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' }}
          data-testid="mobile-interval-scroll"
          onPointerDown={startIntervalSwipe}
          onPointerMove={moveIntervalSwipe}
          onPointerUp={endIntervalSwipe}
          onPointerCancel={endIntervalSwipe}
        >
          <div className="flex w-max min-w-max items-center gap-1 pr-3">
            {sortedFavoriteIntervals.map((item) => {
              const chartInterval = intervalToChartInterval(item);
              if (!chartInterval) return null;
              const active = interval === chartInterval;
              const intervalKey = normalizeIntervalKey(item) ?? item;
              return (
                <Button
                  key={intervalKey}
                  variant="ghost"
                  size="sm"
                  data-active-interval={active ? 'true' : undefined}
                  className={`h-8 min-w-9 shrink-0 rounded-md px-2.5 font-mono text-xs ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-[0_0_18px_rgba(139,92,246,0.45)]'
                      : 'text-muted-foreground hover:bg-secondary'
                  }`}
                  onClick={(event) => {
                    if (shouldSuppressIntervalClick()) {
                      event.preventDefault();
                      return;
                    }

                    setInterval(chartInterval);
                  }}
                  data-testid={`btn-interval-${intervalKey}`}
                >
                  {formatIntervalButton(intervalKey)}
                </Button>
              );
            })}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-1 h-8 min-w-8 shrink-0 rounded-md border border-border bg-[#131722] px-2 font-mono text-xs text-slate-200 hover:bg-[#1e222d]"
                  data-testid="btn-interval-menu"
                  onClick={(event) => {
                    if (shouldSuppressIntervalClick()) {
                      event.preventDefault();
                      event.stopPropagation();
                    }
                  }}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-[248px] border-[#2a2e39] bg-[#131722] p-0 text-slate-200 shadow-2xl shadow-black/40"
                data-testid="interval-dropdown"
              >
                <DropdownMenuItem
                  className="h-9 rounded-none px-3 text-xs font-medium text-slate-100 focus:bg-[#1e222d] focus:text-white"
                  onSelect={() => setCustomIntervalDialogOpen(true)}
                  data-testid="btn-add-custom-interval"
                >
                  <span className="text-[#2962ff]">+</span>
                  Add custom interval…
                </DropdownMenuItem>

                <DropdownMenuSeparator className="m-0 bg-[#2a2e39]" />

                {intervalMenuGroups.map((group, groupIndex) => (
                  <div key={group.label}>
                    {groupIndex > 0 && <DropdownMenuSeparator className="m-0 bg-[#2a2e39]" />}
                    <DropdownMenuLabel className="px-3 pb-1 pt-2 text-[10px] font-semibold tracking-wider text-[#787b86]">
                      {group.label}
                    </DropdownMenuLabel>
                    {group.items.map((item) => {
                      const disabledReason = intervalDisabledReason(item);
                      const disabled = disabledReason !== null;
                      const normalized = item.kind === 'time' ? intervalToChartInterval(item.value) : null;
                      const intervalKey = normalizeIntervalKey(item.value);
                      const active = normalized !== null && normalized === interval;
                      const favorite = intervalKey !== null && favoriteIntervals.includes(intervalKey);
                      const favoriteLimitReached = !favorite && favoriteIntervals.length >= 10;

                      return (
                        <DropdownMenuItem
                          key={`${group.label}-${item.value}`}
                          disabled={disabled}
                          title={
                            disabledReason ??
                            (favoriteLimitReached ? 'Maximum of 10 favorite intervals' : undefined)
                          }
                          className={`h-7 rounded-none px-3 py-0 text-xs focus:bg-[#1e222d] focus:text-white ${
                            active ? 'bg-[#1e222d] text-[#4f8cff]' : 'text-slate-200'
                          } ${disabled ? 'text-[#4b5263] opacity-100' : ''}`}
                          onSelect={() => selectMenuInterval(item)}
                          data-testid={`menu-interval-${item.value}`}
                        >
                          <span className="min-w-0 flex-1">{item.label}</span>
                          {active && <span className="mr-1 text-[10px] text-[#4f8cff]">ACTIVE</span>}
                          {intervalKey && !disabled && (
                            <button
                              type="button"
                              disabled={favoriteLimitReached}
                              aria-label={favorite ? 'Remove favorite interval' : 'Add favorite interval'}
                              className={`flex h-6 w-6 items-center justify-center rounded-sm ${
                                favorite
                                  ? 'text-[#fbc02d]'
                                  : favoriteLimitReached
                                    ? 'text-[#4b5263]'
                                    : 'text-[#787b86] hover:text-[#fbc02d]'
                              }`}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                if (!favoriteLimitReached) toggleFavoriteInterval(intervalKey);
                              }}
                            >
                              <Star className={favorite ? 'h-3.5 w-3.5 fill-current' : 'h-3.5 w-3.5'} />
                            </button>
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div
              className="hidden h-8 min-w-[62px] items-center justify-center rounded-md border border-border bg-secondary/50 px-2 font-mono text-xs tabular-nums text-muted-foreground sm:flex"
              title={`Time until ${interval} candle closes`}
              data-testid="interval-countdown"
            >
              {countdownLabel}
            </div>

            <div className="ml-2 hidden h-8 items-center overflow-hidden rounded-md border border-border bg-secondary/50 font-mono text-xs sm:flex">
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

      <div className="ml-1 flex shrink-0 items-center gap-1 sm:ml-2 sm:gap-2">
        <div className="flex items-center gap-1 text-xs text-muted-foreground sm:gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${status === 'connected' ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]' : 'bg-red-500'}`} />
          <span className="hidden capitalize sm:inline">{status}</span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 sm:h-9 sm:w-9"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          data-testid="btn-theme-toggle"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
      </div>
    </div>

    <Dialog open={customIntervalDialogOpen} onOpenChange={setCustomIntervalDialogOpen}>
      <DialogContent className="max-w-[452px] gap-0 overflow-hidden border-[#3a3a3a] bg-[#1f1f1f] p-0 text-[#d1d4dc] shadow-2xl sm:rounded-md">
        <DialogHeader className="border-b border-[#343434] px-[18px] py-4">
          <DialogTitle className="text-[22px] font-semibold leading-8 text-[#d1d4dc]">
            Add custom interval
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            applyCustomInterval();
          }}
        >
          <div className="grid grid-cols-[96px_1fr] items-center gap-y-3 px-[18px] py-6 text-sm">
            <label className="text-[#d1d4dc]" htmlFor="custom-interval-type">
              Type
            </label>
            <Select
              value={customIntervalType}
              onValueChange={(value) => setCustomIntervalType(value as CustomIntervalUnit)}
            >
              <SelectTrigger
                id="custom-interval-type"
                className="h-10 w-[205px] rounded-md border-[#4a4a4a] bg-[#1f1f1f] px-3 text-sm text-[#f0f3fa] shadow-none focus:ring-[#2962ff]"
                data-testid="select-custom-interval-type"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-[#3a3a3a] bg-[#1f1f1f] text-[#f0f3fa]">
                {CUSTOM_INTERVAL_TYPES.map((type) => (
                  <SelectItem
                    key={type.unit}
                    value={type.unit}
                    disabled={
                      (type.unit === 's' && !secondsSupported) ||
                      (type.unit === 't' && !ticksSupported)
                    }
                    className="focus:bg-[#2a2e39] focus:text-white"
                  >
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="text-[#d1d4dc]" htmlFor="custom-interval-value">
              Interval
            </label>
            <Input
              id="custom-interval-value"
              value={customIntervalValue}
              onChange={(event) => setCustomIntervalValue(event.target.value.replace(/\D/g, ''))}
              autoFocus
              inputMode="numeric"
              className="h-10 w-[205px] rounded-md border-[#2962ff] bg-[#1f1f1f] px-3 font-mono text-sm text-[#f0f3fa] shadow-none focus-visible:ring-[#2962ff]"
              data-testid="input-custom-interval"
            />
          </div>

          <DialogFooter className="flex-row justify-end gap-3 border-t border-[#343434] px-6 py-[19px] sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-md border-[#f0f3fa] bg-transparent px-4 text-sm font-semibold text-[#f0f3fa] hover:bg-[#2a2e39] hover:text-white"
              onClick={() => setCustomIntervalDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={customIntervalDisabledReason !== null}
              title={customIntervalDisabledReason ?? undefined}
              className="h-10 rounded-md bg-[#363636] px-4 text-sm font-semibold text-[#787b86] hover:bg-[#4a4a4a] disabled:pointer-events-none disabled:opacity-100"
              data-testid="btn-confirm-custom-interval"
            >
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
