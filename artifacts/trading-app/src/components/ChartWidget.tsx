import {
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useState,
  useCallback,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type CandlestickData,
  type LineData,
  type WhitespaceData,
  type LogicalRange,
} from "lightweight-charts";
import { useTradingStore } from "../store/useTradingStore";
import {
  useGetCandles,
  getGetCandlesQueryKey,
  useGetRsiAdvanced,
  getGetRsiAdvancedQueryKey,
  getCandles,
  getRsiAdvanced,
  type Candle,
  type RsiAdvancedResponse,
} from "@workspace/api-client-react";
import { useWebsocket } from "../hooks/useWebsocket";
import { GripHorizontal } from "lucide-react";

function parseIntervalSeconds(interval: string): number {
  const value = parseInt(interval, 10);
  const unit = interval.slice(-1);
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return value * (multipliers[unit] || 60);
}

type RsiLinePoint = { time: number; value?: number | null };

function alignLineDataToTimes(
  points: RsiLinePoint[] | undefined,
  times: number[],
): Array<LineData<Time> | WhitespaceData<Time>> {
  const valuesByTime = new Map<number, number | null>();
  points?.forEach((point) => {
    valuesByTime.set(point.time, point.value ?? null);
  });

  return times.map((time) => {
    const value = valuesByTime.get(time);
    if (value === null || value === undefined) {
      return { time: time as Time } as WhitespaceData<Time>;
    }

    return { time: time as Time, value } as LineData<Time>;
  });
}

function makeLevelLineData(
  value: number,
  times: number[],
): Array<LineData<Time> | WhitespaceData<Time>> {
  return times.map((time) => ({ time: time as Time, value }));
}

function alignFieldDataToTimes<T extends { time: number }>(
  points: T[] | undefined,
  field: keyof T,
  times: number[],
): Array<LineData<Time> | WhitespaceData<Time>> {
  const valuesByTime = new Map<number, number | null>();
  points?.forEach((point) => {
    const value = point[field];
    valuesByTime.set(point.time, typeof value === "number" ? value : null);
  });

  return times.map((time) => {
    const value = valuesByTime.get(time);
    if (value === null || value === undefined) {
      return { time: time as Time } as WhitespaceData<Time>;
    }

    return { time: time as Time, value } as LineData<Time>;
  });
}

function mergeByTime<T extends { time: number }>(
  current: T[] | undefined,
  incoming: T[] | undefined,
  before?: number,
): T[] | undefined {
  if (!current && !incoming) return undefined;

  const merged = new Map<number, T>();
  current?.forEach((point) => merged.set(point.time, point));
  incoming
    ?.filter((point) => before === undefined || point.time < before)
    .forEach((point) => merged.set(point.time, point));

  return Array.from(merged.values()).sort((a, b) => a.time - b.time);
}

function latestValue(points: RsiLinePoint[] | undefined): number | null {
  if (!points) return null;

  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index]?.value;
    if (value !== null && value !== undefined) {
      return value;
    }
  }

  return null;
}

type HoveredRsiValues = {
  rsi: number | null;
  sma: number | null;
  ema: number | null;
  wma: number | null;
};

function readSeriesValue(
  params: MouseEventParams<Time>,
  series: ISeriesApi<"Line"> | null,
): number | null {
  if (!series) return null;

  const data = params.seriesData.get(series);
  if (!data || typeof data !== "object" || !("value" in data)) return null;

  const value = data.value;
  return typeof value === "number" ? value : null;
}

export default function ChartWidget() {
  const {
    symbol,
    interval,
    theme,
    rsiPeriod,
    rsiSource,
    rsiLineWidth,
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

  const rootRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const rsiBandOverlayRef = useRef<HTMLDivElement>(null);
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const smaRsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const emaRsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const wmaRsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpperSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMiddleSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochKSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochDSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const obSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const osSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [rsiPanelHeight, setRsiPanelHeight] = useState(25);
  const [hoveredRsiValues, setHoveredRsiValues] =
    useState<HoveredRsiValues | null>(null);
  const [allCandles, setAllCandles] = useState<Candle[]>([]);
  const [allRsiData, setAllRsiData] = useState<Partial<RsiAdvancedResponse>>({
    rsi: [],
  });
  const historyFetchRef = useRef<AbortController | null>(null);
  const lastFetchEarliestRef = useRef<number | null>(null);
  const seedKeyRef = useRef<string>("");
  const initialRangeSetRef = useRef<boolean>(false);
  const isLoadingHistoryRef = useRef<boolean>(false);
  const isSyncingLogicalRangeRef = useRef(false);
  const lastRsiFetchEarliestRef = useRef<number | null>(null);
  const rsiHistoryFetchRef = useRef<AbortController | null>(null);
  const pendingPrependCountRef = useRef(0);
  const pendingVisibleLogicalRangeRef = useRef<LogicalRange | null>(null);

  const {
    data: candlesData,
    isLoading: isLoadingCandles,
    error: candlesError,
  } = useGetCandles(
    { symbol, interval, limit: 500 },
    {
      query: {
        enabled: !!symbol && !!interval,
        queryKey: getGetCandlesQueryKey({ symbol, interval, limit: 500 }),
      },
    },
  );

  const { data: rsiData } = useGetRsiAdvanced(
    {
      symbol,
      interval,
      period: rsiPeriod,
      source: rsiSource as
        | "close"
        | "open"
        | "high"
        | "low"
        | "hl2"
        | "hlc3"
        | "ohlc4",
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
          source: rsiSource as
            | "close"
            | "open"
            | "high"
            | "low"
            | "hl2"
            | "hlc3"
            | "ohlc4",
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
    },
  );

  const { lastCandle } = useWebsocket(symbol, interval);

  const chartOptions = useMemo(
    () => ({
      autoSize: true,
      layout: {
        background: { color: theme === "dark" ? "#000000" : "#ffffff" },
        textColor: theme === "dark" ? "#a78bfa" : "#64748b",
      },
      grid: {
        vertLines: {
          color: theme === "dark" ? "rgba(139,92,246,0.14)" : "#f1f5f9",
        },
        horzLines: {
          color: theme === "dark" ? "rgba(139,92,246,0.14)" : "#f1f5f9",
        },
      },
      crosshair: { mode: 1 },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 8,
        rightOffset: 12,
        borderVisible: true,
      },
      rightPriceScale: { minimumWidth: 70 },
      handleScroll: true,
      handleScale: true,
    }),
    [theme],
  );

  const rsiChartOptions = useMemo(
    () => ({
      ...chartOptions,
      layout: {
        ...chartOptions.layout,
        background: { color: theme === "dark" ? "#000000" : "#ffffff" },
      },
      timeScale: {
        ...chartOptions.timeScale,
        visible: false,
        borderVisible: false,
      },
      handleScroll: {
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
        mouseWheel: false,
      },
      handleScale: {
        axisPressedMouseMove: {
          time: false,
          price: true,
        },
        mouseWheel: false,
        pinch: false,
      },
    }),
    [chartOptions, theme],
  );

  const rsiValue = hoveredRsiValues?.rsi ?? latestValue(allRsiData.rsi);
  const visibleMaLegends = [
    smaMa.show
      ? {
          label: `SMA ${smaMa.period} RSI`,
          color: smaMa.color,
          value: hoveredRsiValues?.sma ?? latestValue(allRsiData.sma_rsi),
        }
      : null,
    emaMa.show
      ? {
          label: `EMA ${emaMa.period} RSI`,
          color: emaMa.color,
          value: hoveredRsiValues?.ema ?? latestValue(allRsiData.ema_rsi),
        }
      : null,
    wmaMa.show
      ? {
          label: `WMA ${wmaMa.period} RSI`,
          color: wmaMa.color,
          value: hoveredRsiValues?.wma ?? latestValue(allRsiData.wma_rsi),
        }
      : null,
  ].filter(
    (entry): entry is { label: string; color: string; value: number | null } =>
      entry !== null,
  );

  const updateRsiBandOverlay = useCallback(() => {
    const overlay = rsiBandOverlayRef.current;
    const rsiSeries = rsiSeriesRef.current;

    if (!overlay || !rsiSeries) return;

    const upperLevel = Math.max(obLevel, osLevel);
    const lowerLevel = Math.min(obLevel, osLevel);
    const upperY = rsiSeries.priceToCoordinate(upperLevel);
    const lowerY = rsiSeries.priceToCoordinate(lowerLevel);

    if (upperY === null || lowerY === null) {
      overlay.style.display = "none";
      return;
    }

    overlay.style.display = "block";
    overlay.style.top = `${Math.min(upperY, lowerY)}px`;
    overlay.style.height = `${Math.abs(lowerY - upperY)}px`;
    overlay.style.backgroundColor =
      theme === "dark"
        ? "rgba(244, 114, 182, 0.14)"
        : "rgba(244, 114, 182, 0.18)";
  }, [obLevel, osLevel, theme]);

  const syncRsiLogicalRange = useCallback((range?: LogicalRange | null) => {
    if (!chartRef.current || !rsiChartRef.current) return;

    const mainTs = chartRef.current.timeScale();
    const rsiTs = rsiChartRef.current.timeScale();
    const nextRange = range ?? mainTs.getVisibleLogicalRange();

    if (nextRange && nextRange.from != null && nextRange.to != null) {
      isSyncingLogicalRangeRef.current = true;
      rsiTs.setVisibleLogicalRange(nextRange);
      requestAnimationFrame(() => {
        isSyncingLogicalRangeRef.current = false;
      });
    }
  }, []);

  const syncRsiChartSize = useCallback(() => {
    if (!rsiContainerRef.current || !rsiChartRef.current) return;

    rsiChartRef.current.applyOptions({
      height: rsiContainerRef.current.clientHeight,
      width: rsiContainerRef.current.clientWidth,
    });
    syncRsiLogicalRange();
    requestAnimationFrame(updateRsiBandOverlay);
  }, [syncRsiLogicalRange, updateRsiBandOverlay]);

  const resizeRsiChart = useCallback(() => {
    requestAnimationFrame(() => {
      syncRsiChartSize();
    });
  }, [syncRsiChartSize]);

  const startRsiResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!rootRef.current) return;

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      const startY = event.clientY;
      const startHeight = rsiPanelHeight;
      const totalHeight = rootRef.current.clientHeight || 1;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaPercent = ((startY - moveEvent.clientY) / totalHeight) * 100;
        const nextHeight = Math.min(
          70,
          Math.max(14, startHeight + deltaPercent),
        );
        setRsiPanelHeight(nextHeight);
      };

      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        syncRsiChartSize();
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [syncRsiChartSize, rsiPanelHeight],
  );

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, chartOptions);

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
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

    const chart = createChart(rsiContainerRef.current, rsiChartOptions);

    const rsiSeries = chart.addSeries(LineSeries, {
      color: "#a855f7",
      lineWidth: rsiLineWidth,
      priceLineVisible: false,
    });

    const smaRsiSeries = smaMa.show
      ? chart.addSeries(LineSeries, {
          color: smaMa.color,
          lineWidth: smaMa.lineWidth,
          lineStyle: smaMa.lineStyle,
          priceLineVisible: false,
          lastValueVisible: smaMa.showValue,
        })
      : null;

    const emaRsiSeries = emaMa.show
      ? chart.addSeries(LineSeries, {
          color: emaMa.color,
          lineWidth: emaMa.lineWidth,
          lineStyle: emaMa.lineStyle,
          priceLineVisible: false,
          lastValueVisible: emaMa.showValue,
        })
      : null;

    const wmaRsiSeries = wmaMa.show
      ? chart.addSeries(LineSeries, {
          color: wmaMa.color,
          lineWidth: wmaMa.lineWidth,
          lineStyle: wmaMa.lineStyle,
          priceLineVisible: false,
          lastValueVisible: wmaMa.showValue,
        })
      : null;

    const bbUpperSeries = showRsiBb
      ? chart.addSeries(LineSeries, {
          color: "#f472b6",
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        })
      : null;

    const bbMiddleSeries = showRsiBb
      ? chart.addSeries(LineSeries, {
          color: "#f9a8d4",
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        })
      : null;

    const bbLowerSeries = showRsiBb
      ? chart.addSeries(LineSeries, {
          color: "#f472b6",
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        })
      : null;

    const stochKSeries = showStochRsi
      ? chart.addSeries(LineSeries, {
          color: "#eab308",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        })
      : null;

    const stochDSeries = showStochRsi
      ? chart.addSeries(LineSeries, {
          color: "#14b8a6",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        })
      : null;

    const obSeries = chart.addSeries(LineSeries, {
      color: "#ef4444",
      lineWidth: 1,
      lineStyle: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const osSeries = chart.addSeries(LineSeries, {
      color: "#22c55e",
      lineWidth: 1,
      lineStyle: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    rsiChartRef.current = chart;
    rsiSeriesRef.current = rsiSeries;
    smaRsiSeriesRef.current = smaRsiSeries;
    emaRsiSeriesRef.current = emaRsiSeries;
    wmaRsiSeriesRef.current = wmaRsiSeries;
    bbUpperSeriesRef.current = bbUpperSeries;
    bbMiddleSeriesRef.current = bbMiddleSeries;
    bbLowerSeriesRef.current = bbLowerSeries;
    stochKSeriesRef.current = stochKSeries;
    stochDSeriesRef.current = stochDSeries;
    obSeriesRef.current = obSeries;
    osSeriesRef.current = osSeries;
    chart.priceScale("right").setVisibleRange({ from: 0, to: 100 });

    let unsubMain: (() => void) | null = null;

    if (chartRef.current) {
      const mainTs = chartRef.current.timeScale();
      const rsiTs = chart.timeScale();
      const onMainChange = (range: LogicalRange | null) => {
        if (isSyncingLogicalRangeRef.current) return;
        requestAnimationFrame(() => syncRsiLogicalRange(range));
      };
      const onRsiChange = (range: LogicalRange | null) => {
        if (!chartRef.current || isSyncingLogicalRangeRef.current) return;
        if (!range || range.from == null || range.to == null) return;

        isSyncingLogicalRangeRef.current = true;
        chartRef.current.timeScale().setVisibleLogicalRange(range);
        requestAnimationFrame(() => {
          isSyncingLogicalRangeRef.current = false;
        });
      };
      mainTs.subscribeVisibleLogicalRangeChange(onMainChange);
      rsiTs.subscribeVisibleLogicalRangeChange(onRsiChange);
      requestAnimationFrame(() => syncRsiLogicalRange());
      unsubMain = () => {
        try {
          mainTs.unsubscribeVisibleLogicalRangeChange(onMainChange);
        } catch {}
        try {
          rsiTs.unsubscribeVisibleLogicalRangeChange(onRsiChange);
        } catch {}
      };
    }

    const onCrosshairMove = (param: MouseEventParams<Time>) => {
      updateRsiBandOverlay();

      if (!param.time || !param.seriesData.size) {
        setHoveredRsiValues(null);
        return;
      }

      setHoveredRsiValues({
        rsi: readSeriesValue(param, rsiSeries),
        sma: readSeriesValue(param, smaRsiSeries),
        ema: readSeriesValue(param, emaRsiSeries),
        wma: readSeriesValue(param, wmaRsiSeries),
      });
    };
    chart.subscribeCrosshairMove(onCrosshairMove);

    const handleResize = () => {
      if (rsiContainerRef.current && rsiChartRef.current) {
        rsiChartRef.current.applyOptions({
          height: rsiContainerRef.current.clientHeight,
          width: rsiContainerRef.current.clientWidth,
        });
        requestAnimationFrame(() => syncRsiLogicalRange());
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      unsubMain?.();
      try {
        chart.unsubscribeCrosshairMove(onCrosshairMove);
      } catch {}
      window.removeEventListener("resize", handleResize);
      chart.remove();
      rsiChartRef.current = null;
      rsiSeriesRef.current = null;
      smaRsiSeriesRef.current = null;
      emaRsiSeriesRef.current = null;
      wmaRsiSeriesRef.current = null;
      bbUpperSeriesRef.current = null;
      bbMiddleSeriesRef.current = null;
      bbLowerSeriesRef.current = null;
      stochKSeriesRef.current = null;
      stochDSeriesRef.current = null;
      obSeriesRef.current = null;
      osSeriesRef.current = null;
    };
  }, [
    showRsi,
    rsiChartOptions,
    rsiLineWidth,
    smaMa.show,
    smaMa.color,
    smaMa.lineStyle,
    smaMa.lineWidth,
    smaMa.showValue,
    emaMa.show,
    emaMa.color,
    emaMa.lineStyle,
    emaMa.lineWidth,
    emaMa.showValue,
    wmaMa.show,
    wmaMa.color,
    wmaMa.lineStyle,
    wmaMa.lineWidth,
    wmaMa.showValue,
    showRsiBb,
    showStochRsi,
    syncRsiLogicalRange,
    updateRsiBandOverlay,
  ]);

  useLayoutEffect(() => {
    if (!rsiContainerRef.current || !rsiChartRef.current) return;
    resizeRsiChart();
  }, [resizeRsiChart, rsiPanelHeight, showRsi]);

  useLayoutEffect(() => {
    if (!showRsi) return;
    requestAnimationFrame(updateRsiBandOverlay);
  }, [showRsi, obLevel, osLevel, rsiPanelHeight, theme, updateRsiBandOverlay]);

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
      if (chartRef.current && pendingPrependCountRef.current > 0) {
        const prependCount = pendingPrependCountRef.current;
        const previousRange = pendingVisibleLogicalRangeRef.current;
        pendingPrependCountRef.current = 0;
        pendingVisibleLogicalRangeRef.current = null;

        if (
          previousRange &&
          previousRange.from != null &&
          previousRange.to != null
        ) {
          chartRef.current.timeScale().setVisibleLogicalRange({
            from: previousRange.from + prependCount,
            to: previousRange.to + prependCount,
          });
          requestAnimationFrame(() => {
            syncRsiLogicalRange();
            requestAnimationFrame(() => syncRsiLogicalRange());
          });
        }
      } else if (
        chartRef.current &&
        formattedData.length &&
        !initialRangeSetRef.current
      ) {
        initialRangeSetRef.current = true;
        const visibleCandles = 100;
        const lastIndex = formattedData.length - 1;
        chartRef.current.timeScale().setVisibleLogicalRange({
          from: Math.max(0, lastIndex - visibleCandles),
          to: lastIndex + 12,
        });
        requestAnimationFrame(() => {
          syncRsiLogicalRange();
          requestAnimationFrame(() => syncRsiLogicalRange());
        });
      }
    }
  }, [allCandles, interval, syncRsiLogicalRange]);

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
        getCandles(
          { symbol, interval, limit: 300, before: earliest },
          { signal: controller.signal },
        ),
        showRsi && lastRsiFetchEarliestRef.current !== earliest
          ? getRsiAdvanced(
              {
                symbol,
                interval,
                period: rsiPeriod,
                source: rsiSource as
                  | "close"
                  | "open"
                  | "high"
                  | "low"
                  | "hl2"
                  | "hlc3"
                  | "ohlc4",
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
              { signal: rsiController.signal },
            )
          : Promise.resolve(null),
      ]);

      if (candlesResp.candles && candlesResp.candles.length > 0) {
        const newCandles = candlesResp.candles.filter((c) => c.time < earliest);
        if (newCandles.length > 0) {
          setAllCandles((prev) => {
            const existingTimes = new Set(prev.map((candle) => candle.time));
            const uniqueNewCandles = newCandles.filter(
              (candle) => !existingTimes.has(candle.time),
            );

            if (uniqueNewCandles.length > 0) {
              pendingPrependCountRef.current += uniqueNewCandles.length;
              pendingVisibleLogicalRangeRef.current =
                chartRef.current?.timeScale().getVisibleLogicalRange() ?? null;
            }

            const merged = [...prev, ...uniqueNewCandles];
            const deduped = new Map<number, Candle>();
            merged.forEach((c) => deduped.set(c.time, c));
            return Array.from(deduped.values()).sort((a, b) => a.time - b.time);
          });
        }
      }

      if (rsiResp && rsiResp.rsi && rsiResp.rsi.length > 0) {
        lastRsiFetchEarliestRef.current = earliest;
        const newRsi = rsiResp.rsi.filter(
          (r) => r.time !== null && (r.time as number) < earliest,
        );
        if (newRsi.length > 0) {
          setAllRsiData((prev) => {
            return {
              ...prev,
              rsi: mergeByTime(prev.rsi, rsiResp.rsi, earliest) ?? [],
              sma_rsi: mergeByTime(prev.sma_rsi, rsiResp.sma_rsi, earliest),
              ema_rsi: mergeByTime(prev.ema_rsi, rsiResp.ema_rsi, earliest),
              wma_rsi: mergeByTime(prev.wma_rsi, rsiResp.wma_rsi, earliest),
              bollinger_bands: mergeByTime(
                prev.bollinger_bands,
                rsiResp.bollinger_bands,
                earliest,
              ),
              stoch_rsi: mergeByTime(
                prev.stoch_rsi,
                rsiResp.stoch_rsi,
                earliest,
              ),
              divergences: mergeByTime(
                prev.divergences,
                rsiResp.divergences,
                earliest,
              ),
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
  }, [
    allCandles,
    symbol,
    interval,
    showRsi,
    rsiPeriod,
    rsiSource,
    smaMa,
    emaMa,
    wmaMa,
    showStochRsi,
    showRsiBb,
    showDivergences,
  ]);

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
      try {
        mainTs.unsubscribeVisibleTimeRangeChange(onScroll);
      } catch {}
    };
  }, [allCandles, isLoadingHistory, loadOlderCandles, interval]);

  useEffect(() => {
    if (showRsi && rsiSeriesRef.current && allRsiData.rsi) {
      const candleTimes = [
        ...new Set(allCandles.map((candle) => candle.time)),
      ].sort((a, b) => a - b);

      rsiSeriesRef.current.setData(
        alignLineDataToTimes(allRsiData.rsi, candleTimes),
      );
      if (smaRsiSeriesRef.current && allRsiData.sma_rsi) {
        smaRsiSeriesRef.current.setData(
          alignLineDataToTimes(allRsiData.sma_rsi, candleTimes),
        );
      }
      if (emaRsiSeriesRef.current && allRsiData.ema_rsi) {
        emaRsiSeriesRef.current.setData(
          alignLineDataToTimes(allRsiData.ema_rsi, candleTimes),
        );
      }
      if (wmaRsiSeriesRef.current && allRsiData.wma_rsi) {
        wmaRsiSeriesRef.current.setData(
          alignLineDataToTimes(allRsiData.wma_rsi, candleTimes),
        );
      }
      if (bbUpperSeriesRef.current && allRsiData.bollinger_bands) {
        bbUpperSeriesRef.current.setData(
          alignFieldDataToTimes(
            allRsiData.bollinger_bands,
            "upper",
            candleTimes,
          ),
        );
      }
      if (bbMiddleSeriesRef.current && allRsiData.bollinger_bands) {
        bbMiddleSeriesRef.current.setData(
          alignFieldDataToTimes(
            allRsiData.bollinger_bands,
            "middle",
            candleTimes,
          ),
        );
      }
      if (bbLowerSeriesRef.current && allRsiData.bollinger_bands) {
        bbLowerSeriesRef.current.setData(
          alignFieldDataToTimes(
            allRsiData.bollinger_bands,
            "lower",
            candleTimes,
          ),
        );
      }
      if (stochKSeriesRef.current && allRsiData.stoch_rsi) {
        stochKSeriesRef.current.setData(
          alignFieldDataToTimes(allRsiData.stoch_rsi, "k", candleTimes),
        );
      }
      if (stochDSeriesRef.current && allRsiData.stoch_rsi) {
        stochDSeriesRef.current.setData(
          alignFieldDataToTimes(allRsiData.stoch_rsi, "d", candleTimes),
        );
      }
      if (obSeriesRef.current) {
        obSeriesRef.current.setData(makeLevelLineData(obLevel, candleTimes));
      }
      if (osSeriesRef.current) {
        osSeriesRef.current.setData(makeLevelLineData(osLevel, candleTimes));
      }
      requestAnimationFrame(() => {
        syncRsiLogicalRange();
        updateRsiBandOverlay();
        requestAnimationFrame(() => {
          syncRsiLogicalRange();
          updateRsiBandOverlay();
        });
      });
    }
  }, [
    showRsi,
    allRsiData,
    allCandles,
    obLevel,
    osLevel,
    syncRsiLogicalRange,
    updateRsiBandOverlay,
  ]);

  useEffect(() => {
    if (showRsi) return;
    setHoveredRsiValues(null);
  }, [showRsi]);

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
    <div ref={rootRef} className="flex flex-col w-full h-full bg-background">
      <div className="relative flex-1 min-h-[300px]">
        <div
          ref={chartContainerRef}
          className="w-full h-full"
          data-testid="main-chart"
        />
        {!isLoadingCandles && (candlesError || allCandles.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="rounded-lg border border-border bg-background/90 px-5 py-3 text-sm text-muted-foreground shadow-lg">
              {candlesError
                ? "Could not load candles from backend"
                : "No candle data available"}
            </div>
          </div>
        )}
        {isLoadingHistory && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
            <div className="flex items-center gap-3 bg-background px-5 py-3 rounded-lg shadow-lg border border-border">
              <svg
                className="animate-spin h-5 w-5 text-primary"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-sm font-medium text-foreground">
                Loading history...
              </span>
            </div>
          </div>
        )}
      </div>
      {showRsi && (
        <div
          className="relative shrink-0 border-t border-border bg-background"
          style={{ height: `${rsiPanelHeight}%`, minHeight: 140 }}
          data-testid="rsi-panel"
        >
          <div
            ref={rsiContainerRef}
            className="absolute inset-0 z-0"
            data-testid="rsi-chart"
          />
          <div
            ref={rsiBandOverlayRef}
            className="pointer-events-none absolute left-0 right-[70px] z-[1] hidden"
            aria-hidden="true"
          />
          <div
            role="separator"
            tabIndex={0}
            aria-orientation="horizontal"
            aria-label="Resize RSI panel"
            onPointerDown={startRsiResize}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                setRsiPanelHeight((height) => {
                  const delta = event.key === "ArrowUp" ? 4 : -4;
                  return Math.min(70, Math.max(14, height + delta));
                });
              }
            }}
            className="absolute left-0 right-0 top-0 z-50 flex h-8 cursor-ns-resize touch-none select-none items-start justify-center border-t border-border/70 bg-background/20 pt-1 text-muted-foreground backdrop-blur-sm"
          >
            <GripHorizontal className="h-4 w-4" />
          </div>
          <div className="pointer-events-none absolute left-2 top-6 z-10 text-xs text-muted-foreground">
            <div className="space-y-1 rounded-sm bg-background/70 px-1.5 py-1 shadow-sm backdrop-blur">
              <div>
                <span>
                  RSI {rsiPeriod} {rsiSource}
                </span>
                <span className="ml-1 font-medium text-[#a855f7]">
                  {rsiValue === null ? "--" : rsiValue.toFixed(2)}
                </span>
              </div>
              {visibleMaLegends.map((legend) => (
                <div key={legend.label}>
                  <span>{legend.label}</span>
                  <span
                    className="ml-1 font-medium"
                    style={{ color: legend.color }}
                  >
                    {legend.value === null ? "--" : legend.value.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
