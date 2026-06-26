import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type CandlestickData,
  type LineData,
  type WhitespaceData,
} from 'lightweight-charts';
import { useTradingStore } from '../store/useTradingStore';
import {
  useGetCandles,
  getGetCandlesQueryKey,
  useGetRsiAdvanced,
  getGetRsiAdvancedQueryKey,
  getCandles,
  getRsiAdvanced,
  type Candle,
  type RsiAdvancedResponse,
} from '@workspace/api-client-react';
import { useWebsocket } from '../hooks/useWebsocket';

function parseIntervalSeconds(interval: string): number {
  const value = parseInt(interval, 10);
  const unit = interval.slice(-1);
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[unit] || 60);
}

export default function ChartWidget() {
  const {
    symbol,
    interval,
    theme,
    rsiPeriod,
    rsiSource,
    showRsi,
    showRsiBb,
    showStochRsi,
    showDivergences,
    smaMa,
    emaMa,
    wmaMa,
    obLevel,
    osLevel,
  } = useTradingStore();

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const smaRsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const emaRsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const wmaRsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const obSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const osSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [allCandles, setAllCandles] = useState<Candle[]>([]);
  const [allRsiData, setAllRsiData] = useState<Partial<RsiAdvancedResponse>>({ rsi: [] });
  const historyFetchRef = useRef<AbortController | null>(null);
  const lastFetchEarliestRef = useRef<number | null>(null);
  const seedKeyRef = useRef<string>('');
  const initialRangeSetRef = useRef<boolean>(false);
  const isLoadingHistoryRef = useRef<boolean>(false);
  const lastRsiFetchEarliestRef = useRef<number | null>(null);
  const rsiHistoryFetchRef = useRef<AbortController | null>(null);

  const { data: candlesData, isLoading: isLoadingCandles, error: candlesError } = useGetCandles(
    { symbol, interval, limit: 500 },
    { query: { enabled: !!symbol && !!interval, queryKey: getGetCandlesQueryKey({ symbol, interval, limit: 500 }) } }
  );

  const { data: rsiData } = useGetRsiAdvanced(
    {
      symbol,
      interval,
      period: rsiPeriod,
      source: rsiSource as 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4',
      limit: 500,
      include_sma: smaMa.show,
      sma_period: smaMa.period,
      include_ema: emaMa.show,
      ema_period: emaMa.period,
      include_wma: wmaMa.show,
      wma_period: wmaMa.period,
      include_stoch_rsi: showStochRsi,
      include_bb: showRsiBb,
      include_divergence: showDivergences,
    },
    {
      query: {
        enabled: showRsi && !!symbol && !!interval,
        queryKey: getGetRsiAdvancedQueryKey({
          symbol,
          interval,
          period: rsiPeriod,
          source: rsiSource as 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4',
          limit: 500,
          include_sma: smaMa.show,
          sma_period: smaMa.period,
          include_ema: emaMa.show,
          ema_period: emaMa.period,
          include_wma: wmaMa.show,
          wma_period: wmaMa.period,
          include_stoch_rsi: showStochRsi,
          include_bb: showRsiBb,
          include_divergence: showDivergences,
        }),
      },
    }
  );

  const { lastCandle } = useWebsocket(symbol, interval);

  const chartOptions = useMemo(
    () => ({
      autoSize: true,
      layout: {
        background: { color: theme === 'dark' ? '#0f172a' : '#ffffff' },
        textColor: theme === 'dark' ? '#94a3b8' : '#64748b',
      },
      grid: {
        vertLines: { color: theme === 'dark' ? '#1e293b' : '#f1f5f9' },
        horzLines: { color: theme === 'dark' ? '#1e293b' : '#f1f5f9' },
      },
      crosshair: { mode: 1 },
      timeScale: { timeVisible: true, secondsVisible: false },
      handleScroll: true,
      handleScale: true,
    }),
    [theme]
  );

  const syncRsiTimeRange = useCallback(() => {
    setTimeout(() => {
      if (chartRef.current && rsiChartRef.current) {
        const mainTs = chartRef.current.timeScale();
        const rsiTs = rsiChartRef.current.timeScale();
        try {
          const range = mainTs.getVisibleRange();
          if (range && range.from != null && range.to != null) {
            rsiTs.setVisibleRange(range);
          }
        } catch { }
      }
    }, 150);
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, chartOptions);

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      candlestickSeriesRef.current = null;
    };
  }, [chartOptions]);

  useEffect(() => {
    if (!showRsi || !rsiContainerRef.current) return;

    const chart = createChart(rsiContainerRef.current, chartOptions);

    const rsiSeries = chart.addSeries(LineSeries, {
      color: '#8b5cf6',
      lineWidth: 2,
    });

    const smaRsiSeries = smaMa.show
      ? chart.addSeries(LineSeries, {
          color: smaMa.color,
          lineWidth: smaMa.lineWidth,
          lineStyle: smaMa.lineStyle,
          lastValueVisible: smaMa.showValue,
        })
      : null;

    const emaRsiSeries = emaMa.show
      ? chart.addSeries(LineSeries, {
          color: emaMa.color,
          lineWidth: emaMa.lineWidth,
          lineStyle: emaMa.lineStyle,
          lastValueVisible: emaMa.showValue,
        })
      : null;

    const wmaRsiSeries = wmaMa.show
      ? chart.addSeries(LineSeries, {
          color: wmaMa.color,
          lineWidth: wmaMa.lineWidth,
          lineStyle: wmaMa.lineStyle,
          lastValueVisible: wmaMa.showValue,
        })
      : null;

    const obSeries = chart.addSeries(LineSeries, {
      color: '#ef4444',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    obSeries.setData([
      { time: 1000000000 as Time, value: obLevel },
      { time: 2000000000 as Time, value: obLevel },
    ]);

    const osSeries = chart.addSeries(LineSeries, {
      color: '#22c55e',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    osSeries.setData([
      { time: 1000000000 as Time, value: osLevel },
      { time: 2000000000 as Time, value: osLevel },
    ]);

    rsiChartRef.current = chart;
    rsiSeriesRef.current = rsiSeries;
    smaRsiSeriesRef.current = smaRsiSeries;
    emaRsiSeriesRef.current = emaRsiSeries;
    wmaRsiSeriesRef.current = wmaRsiSeries;

    let unsubMain: (() => void) | null = null;

    if (chartRef.current) {
      const mainTs = chartRef.current.timeScale();
      const onMainChange = () => {
        requestAnimationFrame(syncRsiTimeRange);
      };
      mainTs.subscribeVisibleTimeRangeChange(onMainChange);
      requestAnimationFrame(syncRsiTimeRange);
      unsubMain = () => {
        try { mainTs.unsubscribeVisibleTimeRangeChange(onMainChange); } catch { }
      };
    }

    const handleResize = () => {
      if (rsiContainerRef.current && rsiChartRef.current) {
        rsiChartRef.current.applyOptions({
          height: rsiContainerRef.current.clientHeight,
          width: rsiContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      unsubMain?.();
      window.removeEventListener('resize', handleResize);
      chart.remove();
      rsiChartRef.current = null;
      rsiSeriesRef.current = null;
      smaRsiSeriesRef.current = null;
      emaRsiSeriesRef.current = null;
      wmaRsiSeriesRef.current = null;
    };
  }, [showRsi, chartOptions, obLevel, osLevel, smaMa.show, smaMa.color, smaMa.lineStyle, smaMa.lineWidth, smaMa.showValue, emaMa.show, emaMa.color, emaMa.lineStyle, emaMa.lineWidth, emaMa.showValue, wmaMa.show, wmaMa.color, wmaMa.lineStyle, wmaMa.lineWidth, wmaMa.showValue]);

  // Seed allCandles and allRsiData from initial data; reset pagination on symbol/interval change
  useEffect(() => {
    const key = `${symbol}:${interval}`;
    if (candlesData?.candles && seedKeyRef.current !== key) {
      seedKeyRef.current = key;
      initialRangeSetRef.current = false;
      setAllCandles(candlesData.candles);
      lastFetchEarliestRef.current = null;
      lastRsiFetchEarliestRef.current = null;
    }
    if (rsiData && seedKeyRef.current === key) {
      setAllRsiData(rsiData as Partial<RsiAdvancedResponse>);
    }
  }, [candlesData, rsiData, symbol, interval]);

  // Apply allCandles to the chart series
  useEffect(() => {
    if (candlestickSeriesRef.current && allCandles.length) {
      const formattedData: CandlestickData[] = allCandles
        .map((c) => ({
          time: c.time as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
        .sort((a, b) => (a.time as number) - (b.time as number));
      candlestickSeriesRef.current.setData(formattedData);
      if (chartRef.current && formattedData.length && !initialRangeSetRef.current) {
        initialRangeSetRef.current = true;
        const lastTime = formattedData[formattedData.length - 1].time as number;
        const intervalSeconds = parseIntervalSeconds(interval);
        const visibleCandles = 100;
        const startTime = lastTime - (visibleCandles * intervalSeconds);
        chartRef.current.timeScale().setVisibleRange({
          from: startTime as Time,
          to: lastTime as Time,
        });
      }
    }
  }, [allCandles, interval]);

  // Lazy-load older candles and RSI when user scrolls to the left edge
  const loadOlderCandles = useCallback(async () => {
    if (allCandles.length === 0 || isLoadingHistoryRef.current) return;
    const sorted = [...allCandles].sort((a, b) => a.time - b.time);
    const earliest = sorted[0].time;

    if (lastFetchEarliestRef.current === earliest) return;
    lastFetchEarliestRef.current = earliest;

    if (historyFetchRef.current) historyFetchRef.current.abort();
    const controller = new AbortController();
    historyFetchRef.current = controller;

    if (rsiHistoryFetchRef.current) rsiHistoryFetchRef.current.abort();
    const rsiController = new AbortController();
    rsiHistoryFetchRef.current = rsiController;

    isLoadingHistoryRef.current = true;
    setIsLoadingHistory(true);
    try {
      const [candlesResp, rsiResp] = await Promise.all([
        getCandles({ symbol, interval, limit: 300, before: earliest }, { signal: controller.signal }),
        showRsi && lastRsiFetchEarliestRef.current !== earliest
          ? getRsiAdvanced(
              {
                symbol,
                interval,
                period: rsiPeriod,
                source: rsiSource as 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4',
                limit: 300,
                include_sma: smaMa.show,
                sma_period: smaMa.period,
                include_ema: emaMa.show,
                ema_period: emaMa.period,
                include_wma: wmaMa.show,
                wma_period: wmaMa.period,
                include_stoch_rsi: showStochRsi,
                include_bb: showRsiBb,
                include_divergence: showDivergences,
                before: earliest,
              },
              { signal: rsiController.signal }
            )
          : Promise.resolve(null),
      ]);

      if (candlesResp.candles && candlesResp.candles.length > 0) {
        const newCandles = candlesResp.candles.filter((c) => c.time < earliest);
        if (newCandles.length > 0) {
          setAllCandles((prev) => {
            const merged = [...prev, ...newCandles];
            const deduped = new Map<number, Candle>();
            merged.forEach((c) => deduped.set(c.time, c));
            return Array.from(deduped.values()).sort((a, b) => a.time - b.time);
          });
        }
      }

      if (rsiResp && rsiResp.rsi && rsiResp.rsi.length > 0) {
        lastRsiFetchEarliestRef.current = earliest;
        const newRsi = rsiResp.rsi.filter((r) => r.time !== null && (r.time as number) < earliest);
        if (newRsi.length > 0) {
          setAllRsiData((prev) => {
            const dedup = (arr: Array<{ time: number; value?: number | null }>) => {
              const map = new Map<number, { time: number; value: number | null }>();
              arr.forEach((r) => map.set(r.time, { time: r.time, value: r.value ?? null }));
              return Array.from(map.values()).sort((a, b) => a.time - b.time);
            };
            const mergedRsi = [...(prev.rsi ?? []), ...newRsi];
            const mergedSma = prev.sma_rsi && rsiResp.sma_rsi
              ? [...prev.sma_rsi, ...rsiResp.sma_rsi].filter((r) => r.time !== null && (r.time as number) < earliest)
              : prev.sma_rsi;
            const mergedEma = prev.ema_rsi && rsiResp.ema_rsi
              ? [...prev.ema_rsi, ...rsiResp.ema_rsi].filter((r) => r.time !== null && (r.time as number) < earliest)
              : prev.ema_rsi;
            const mergedWma = prev.wma_rsi && rsiResp.wma_rsi
              ? [...prev.wma_rsi, ...rsiResp.wma_rsi].filter((r) => r.time !== null && (r.time as number) < earliest)
              : prev.wma_rsi;
            return {
              rsi: dedup(mergedRsi),
              sma_rsi: mergedSma ? dedup(mergedSma) : undefined,
              ema_rsi: mergedEma ? dedup(mergedEma) : undefined,
              wma_rsi: mergedWma ? dedup(mergedWma) : undefined,
              bollinger_bands: prev.bollinger_bands,
              stoch_rsi: prev.stoch_rsi,
              divergences: prev.divergences,
            };
          });
        }
      }
    } catch {
      // ignore — likely aborted or network error
    } finally {
      isLoadingHistoryRef.current = false;
      setIsLoadingHistory(false);
      historyFetchRef.current = null;
      rsiHistoryFetchRef.current = null;
    }
  }, [allCandles, symbol, interval, showRsi, rsiPeriod, rsiSource, smaMa, emaMa, wmaMa, showStochRsi, showRsiBb, showDivergences]);

  useEffect(() => {
    if (!chartRef.current || allCandles.length === 0) return;

    const sorted = [...allCandles].sort((a, b) => a.time - b.time);
    const earliestTime = sorted[0].time;
    const intervalSeconds = parseIntervalSeconds(interval);
    const mainTs = chartRef.current.timeScale();

    const onScroll = (range: { from: Time; to: Time } | null) => {
      if (range && !isLoadingHistory) {
        const fromTime = range.from as number;
        const threshold = earliestTime + intervalSeconds * 200;
        if (fromTime <= threshold) {
          loadOlderCandles();
        }
      }
    };

    mainTs.subscribeVisibleTimeRangeChange(onScroll);
    return () => {
      try { mainTs.unsubscribeVisibleTimeRangeChange(onScroll); } catch { }
    };
  }, [allCandles, isLoadingHistory, loadOlderCandles, interval]);

  useEffect(() => {
    if (showRsi && rsiSeriesRef.current && allRsiData.rsi) {
      const toLineData = (arr: Array<{ time: number; value?: number | null }>) =>
        arr
          .map((r) => {
            if (r.value === null || r.value === undefined) {
              return { time: r.time as Time } as WhitespaceData<Time>;
            }
            return { time: r.time as Time, value: r.value as number } as LineData<Time>;
          })
          .sort((a, b) => (a.time as number) - (b.time as number));
      rsiSeriesRef.current.setData(toLineData(allRsiData.rsi));
      if (smaRsiSeriesRef.current && allRsiData.sma_rsi) {
        smaRsiSeriesRef.current.setData(toLineData(allRsiData.sma_rsi));
      }
      if (emaRsiSeriesRef.current && allRsiData.ema_rsi) {
        emaRsiSeriesRef.current.setData(toLineData(allRsiData.ema_rsi));
      }
      if (wmaRsiSeriesRef.current && allRsiData.wma_rsi) {
        wmaRsiSeriesRef.current.setData(toLineData(allRsiData.wma_rsi));
      }
      requestAnimationFrame(syncRsiTimeRange);
    }
  }, [showRsi, allRsiData, syncRsiTimeRange]);

  useEffect(() => {
    if (lastCandle && candlestickSeriesRef.current) {
      candlestickSeriesRef.current.update({
        time: lastCandle.time as Time,
        open: lastCandle.open,
        high: lastCandle.high,
        low: lastCandle.low,
        close: lastCandle.close,
      });
    }
  }, [lastCandle]);

  return (
    <div className="flex flex-col w-full h-full bg-background">
      <div className="relative flex-1 min-h-[300px]">
        <div ref={chartContainerRef} className="w-full h-full" data-testid="main-chart" />
        {!isLoadingCandles && (candlesError || allCandles.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="rounded-lg border border-border bg-background/90 px-5 py-3 text-sm text-muted-foreground shadow-lg">
              {candlesError ? 'Could not load candles from backend' : 'No candle data available'}
            </div>
          </div>
        )}
        {isLoadingHistory && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
            <div className="flex items-center gap-3 bg-background px-5 py-3 rounded-lg shadow-lg border border-border">
              <svg className="animate-spin h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm font-medium text-foreground">Loading history...</span>
            </div>
          </div>
        )}
      </div>
      {showRsi && (
        <div
          className="h-[25%] min-h-[150px] border-t border-border"
          ref={rsiContainerRef}
          data-testid="rsi-chart"
        />
      )}
    </div>
  );
}
