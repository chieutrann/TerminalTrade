import React from 'react';
import { useTradingStore } from '../store/useTradingStore';
import { useGetSymbols, getGetSymbolsQueryKey } from '@workspace/api-client-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Moon, Sun, Wifi, WifiOff } from 'lucide-react';
import { useWebsocket } from '../hooks/useWebsocket';

export default function TopBar() {
  const { symbol, setSymbol, interval, setInterval, theme, setTheme, favoriteIntervals } = useTradingStore();
  
  const { data: symbolsData } = useGetSymbols({
    query: { queryKey: getGetSymbolsQueryKey() }
  });
  const symbols = Array.isArray(symbolsData?.symbols) ? symbolsData.symbols : [symbol];

  const { status, lastCandle } = useWebsocket(symbol, interval);

  return (
    <div className="h-14 border-b border-border bg-card flex items-center justify-between px-4" data-testid="topbar">
      <div className="flex items-center gap-4">
        <Select value={symbol} onValueChange={setSymbol}>
          <SelectTrigger className="w-[180px] font-mono font-bold text-lg border-none bg-transparent shadow-none" data-testid="select-symbol">
            <SelectValue placeholder="Select Symbol" />
          </SelectTrigger>
          <SelectContent>
            {symbols.map(s => (
              <SelectItem key={s} value={s} className="font-mono">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {lastCandle && (
          <div className="flex items-center gap-3 font-mono text-sm">
            <span className={lastCandle.close >= lastCandle.open ? "text-green-500" : "text-red-500"}>
              ${lastCandle.close.toFixed(2)}
            </span>
          </div>
        )}

        <div className="h-6 w-px bg-border mx-2" />

        <div className="flex items-center gap-1">
          {favoriteIntervals.map(int => (
            <Button
              key={int}
              variant={interval === int ? "secondary" : "ghost"}
              size="sm"
              className={`font-mono text-xs px-2 py-1 h-8 ${interval === int ? 'font-bold' : ''}`}
              onClick={() => setInterval(int)}
              data-testid={`btn-interval-${int}`}
            >
              {int}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {status === 'connected' ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
          <span className="capitalize">{status}</span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          data-testid="btn-theme-toggle"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </Button>
      </div>
    </div>
  );
}
