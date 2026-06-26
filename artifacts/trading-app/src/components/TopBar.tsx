import React from 'react';
import { useTradingStore } from '../store/useTradingStore';
import { useGetSymbols, getGetSymbolsQueryKey } from '@workspace/api-client-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';
import { useWebsocket } from '../hooks/useWebsocket';

export default function TopBar() {
  const {
    symbol,
    setSymbol,
    interval,
    setInterval,
    favoriteIntervals,
    theme,
    setTheme,
  } = useTradingStore();
  
  const { data: symbolsData } = useGetSymbols({
    query: { queryKey: getGetSymbolsQueryKey() }
  });
  const symbols = Array.isArray(symbolsData?.symbols) ? symbolsData.symbols : [symbol];

  const { status, lastCandle } = useWebsocket(symbol, interval);
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
