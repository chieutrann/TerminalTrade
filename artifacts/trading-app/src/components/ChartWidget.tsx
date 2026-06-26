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

function resolveChartTimeZone(timeZone: string): string {
  if (timeZone === "local") {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }

  return timeZone;
}

function getTimeZoneAbbreviation(timeZone: string): string {
  const resolvedTimeZone = resolveChartTimeZone(timeZone);

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: resolvedTimeZone,
      timeZoneName: "short",
    }).formatToParts(new Date());

    return (
      parts.find((part) => part.type === "timeZoneName")?.value ??
      resolvedTimeZone
    );
  } catch {
    return "UTC";
  }
}

function formatChartTime(
  time: Time,
  timeZone: string,
  options?: { includeDate?: boolean; includeSeconds?: boolean },
): string {
  const timestamp = typeof time === "number" ? time : Number.NaN;

  if (!Number.isFinite(timestamp)) return "";

  const resolvedTimeZone = resolveChartTimeZone(timeZone);
  const date = new Date(timestamp * 1000);

  try {
    if (options?.includeDate) {
      const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: resolvedTimeZone,
        day: "2-digit",
        month: "short",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: options?.includeSeconds ? "2-digit" : undefined,
        hour12: false,
      });

      return formatter.format(date).replace(",", "");
    }

    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: resolvedTimeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: options?.includeSeconds ? "2-digit" : undefined,
      hour12: false,
    });

    return formatter.format(date);
  } catch {
    return new Date(timestamp * 1000).toISOString();
  }
}

function formatChartDate(time: Time, timeZone: string): string {
  const timestamp = typeof time === "number" ? time : Number.NaN;

  if (!Number.isFinite(timestamp)) return "";

  const resolvedTimeZone = resolveChartTimeZone(timeZone);
  const date = new Date(timestamp * 1000);

  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: resolvedTimeZone,
      day: "2-digit",
      month: "short",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(date)
      .replace(",", "");
  } catch {
    return new Date(timestamp * 1000).toISOString();
  }
}

type RsiLinePoint = { time: number; value?: number | null };
type IndexedLinePoint = LineData<Time> | WhitespaceData<Time>;

type SharedTimeScale = {
  indexToX: (index: number) => number | null;
};

function alignLineDataToCandleIndexes(
  points: RsiLinePoint[] | undefined,
  candles: Candle[],
): IndexedLinePoint[] {
  const valuesByTime = new Map<number, number | null>();
  points?.forEach((point) => {
    valuesByTime.set(point.time, point.value ?? null);
  });

  return candles.map((candle, index) => {
    const value = valuesByTime.get(candle.time);
    if (value === null || value === undefined) {
      return { time: index as Time } as WhitespaceData<Time>;
    }

    return { time: index as Time, value } as LineData<Time>;
  });
}

function makeLevelLineData(
  value: number,
  candles: Candle[],
): IndexedLinePoint[] {
  return candles.map((_, index) => ({ time: index as Time, value }));
}

function alignFieldDataToCandleIndexes<T extends { time: number }>(
  points: T[] | undefined,
  field: keyof T,
  candles: Candle[],
): IndexedLinePoint[] {
  const valuesByTime = new Map<number, number | null>();
  points?.forEach((point) => {
    const value = point[field];
    valuesByTime.set(point.time, typeof value === "number" ? value : null);
  });

  return candles.map((candle, index) => {
    const value = valuesByTime.get(candle.time);
    if (value === null || value === undefined) {
      return { time: index as Time } as WhitespaceData<Time>;
    }

    return { time: index as Time, value } as LineData<Time>;
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

const fixedRsiAutoscale = () => ({
  priceRange: {
    minValue: 0,
    maxValue: 100,
  },
});

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
    chartTimeZone,
  } = useTradingStore();

  const rootRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const timeScaleRef = useRef<SharedTimeScale | null>(null);
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
  const sortedCandlesRef = useRef<Candle[]>([]);
  const sortedCandleTimesRef = useRef<number[]>([]);
  const lastFetchEarliestRef = useRef<number | null>(null);
  const seedKeyRef = useRef<string>("");
  const initialRangeSetRef = useRef<boolean>(false);
  const isLoadingHistoryRef = useRef<boolean>(false);
  const isSyncingLogicalRangeRef = useRef(false);
  const synchronizedRenderFrameRef = useRef<number | null>(null);
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

  const chartTimeZoneLabel = useMemo(
    () => getTimeZoneAbbreviation(chartTimeZone),
    [chartTimeZone],
  );

  const formatIndexedChartTime = useCallback(
    (
      time: Time,
      options?: { includeDate?: boolean; includeSeconds?: boolean },
    ): string => {
      const index = typeof time === "number" ? Math.round(time) : Number.NaN;
      const timestamp = Number.isFinite(index)
        ? sortedCandleTimesRef.current[index]
        : undefined;

      if (timestamp === undefined) return "";
      return formatChartTime(timestamp as Time, chartTimeZone, options);
    },
    [chartTimeZone],
  );

  const formatIndexedChartDate = useCallback(
    (time: Time): string => {
      const index = typeof time === "number" ? Math.round(time) : Number.NaN;
      const timestamp = Number.isFinite(index)
        ? sortedCandleTimesRef.current[index]
        : undefined;

      if (timestamp === undefined) return "";
      return formatChartDate(timestamp as Time, chartTimeZone);
    },
    [chartTimeZone],
  );

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
        tickMarkFormatter: (time: Time) => formatIndexedChartTime(time),
      },
      localization: {
        timeFormatter: (time: Time) =>
          `${formatIndexedChartDate(time)} ${chartTimeZoneLabel}`,
      },
      rightPriceScale: { minimumWidth: 70 },
      handleScroll: true,
      handleScale: true,
    }),
    [theme, formatIndexedChartTime, formatIndexedChartDate, chartTimeZoneLabel],
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
        mouseWheel: true,
      },
      handleScale: {
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
        mouseWheel: true,
        pinch: true,
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

  const logAlignment = useCallback((index: number) => {
    const x = timeScaleRef.current?.indexToX(index) ?? null;
    const payload = {
      index,
      rsiX: x,
      maeX: x,
      waeX: x,
    };

    console.log("RSI alignment", payload);
    if (payload.rsiX !== payload.maeX || payload.rsiX !== payload.waeX) {
      throw new Error(`RSI alignment mismatch at index ${index}`);
    }

    return payload;
  }, []);

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

  const scheduleSynchronizedRender = useCallback(() => {
    if (synchronizedRenderFrameRef.current !== null) return;

    synchronizedRenderFrameRef.current = window.requestAnimationFrame(() => {
      synchronizedRenderFrameRef.current = null;
      syncRsiLogicalRange();
      updateRsiBandOverlay();
    });
  }, [syncRsiLogicalRange, updateRsiBandOverlay]);

  const syncRsiChartSize = useCallback(() => {
    if (!rsiContainerRef.current || !rsiChartRef.current) return;

    rsiChartRef.current.applyOptions({
      height: rsiContainerRef.current.clientHeight,
      width: rsiContainerRef.current.clientWidth,
    });
    scheduleSynchronizedRender();
  }, [scheduleSynchronizedRender]);

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
    timeScaleRef.current = {
      indexToX: (index: number) =>
        chart.timeScale().logicalToCoordinate(index),
    };
    (window as typeof window & {
      logAlignment?: (index: number) => {
        index: number;
        rsiX: number | null;
        maeX: number | null;
        waeX: number | null;
      };
    }).logAlignment = logAlignment;

    return () => {
      if (synchronizedRenderFrameRef.current !== null) {
        window.cancelAnimationFrame(synchronizedRenderFrameRef.current);
        synchronizedRenderFrameRef.current = null;
      }
      chart.remove();
      chartRef.current = null;
      timeScaleRef.current = null;
      candlestickSeriesRef.current = null;
      delete (window as typeof window & { logAlignment?: unknown })
        .logAlignment;
    };
  }, [chartOptions, logAlignment]);

  useEffect(() => {
    if (!showRsi || !rsiContainerRef.current) return;

    const chart = createChart(rsiContainerRef.current, rsiChartOptions);

    const rsiSeries = chart.addSeries(LineSeries, {
      color: "#a855f7",
      lineWidth: rsiLineWidth,
      priceLineVisible: false,
      autoscaleInfoProvider: fixedRsiAutoscale,
    });

    const smaRsiSeries = smaMa.show
      ? chart.addSeries(LineSeries, {
          color: smaMa.color,
          lineWidth: smaMa.lineWidth,
          lineStyle: smaMa.lineStyle,
          priceLineVisible: false,
          lastValueVisible: smaMa.showValue,
          autoscaleInfoProvider: fixedRsiAutoscale,
        })
      : null;

    const emaRsiSeries = emaMa.show
      ? chart.addSeries(LineSeries, {
          color: emaMa.color,
          lineWidth: emaMa.lineWidth,
          lineStyle: emaMa.lineStyle,
          priceLineVisible: false,
          lastValueVisible: emaMa.showValue,
          autoscaleInfoProvider: fixedRsiAutoscale,
        })
      : null;

    const wmaRsiSeries = wmaMa.show
      ? chart.addSeries(LineSeries, {
          color: wmaMa.color,
          lineWidth: wmaMa.lineWidth,
          lineStyle: wmaMa.lineStyle,
          priceLineVisible: false,
          lastValueVisible: wmaMa.showValue,
          autoscaleInfoProvider: fixedRsiAutoscale,
        })
      : null;

    const bbUpperSeries = showRsiBb
      ? chart.addSeries(LineSeries, {
          color: "#f472b6",
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          autoscaleInfoProvider: fixedRsiAutoscale,
        })
      : null;

    const bbMiddleSeries = showRsiBb
      ? chart.addSeries(LineSeries, {
          color: "#f9a8d4",
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          autoscaleInfoProvider: fixedRsiAutoscale,
        })
      : null;

    const bbLowerSeries = showRsiBb
      ? chart.addSeries(LineSeries, {
          color: "#f472b6",
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          autoscaleInfoProvider: fixedRsiAutoscale,
        })
      : null;

    const stochKSeries = showStochRsi
      ? chart.addSeries(LineSeries, {
          color: "#eab308",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          autoscaleInfoProvider: fixedRsiAutoscale,
        })
      : null;

    const stochDSeries = showStochRsi
      ? chart.addSeries(LineSeries, {
          color: "#14b8a6",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          autoscaleInfoProvider: fixedRsiAutoscale,
        })
      : null;

    const obSeries = chart.addSeries(LineSeries, {
      color: "#ef4444",
      lineWidth: 1,
      lineStyle: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      autoscaleInfoProvider: fixedRsiAutoscale,
    });

    const osSeries = chart.addSeries(LineSeries, {
      color: "#22c55e",
      lineWidth: 1,
      lineStyle: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      autoscaleInfoProvider: fixedRsiAutoscale,
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
        isSyncingLogicalRangeRef.current = true;
        window.requestAnimationFrame(() => {
          syncRsiLogicalRange(range);
          updateRsiBandOverlay();
          isSyncingLogicalRangeRef.current = false;
        });
      };
      const onRsiChange = (range: LogicalRange | null) => {
        if (!chartRef.current || isSyncingLogicalRangeRef.current) return;
        if (!range || range.from == null || range.to == null) return;

        isSyncingLogicalRangeRef.current = true;
        chartRef.current.timeScale().setVisibleLogicalRange(range);
        window.requestAnimationFrame(() => {
          syncRsiLogicalRange(range);
          updateRsiBandOverlay();
          isSyncingLogicalRangeRef.current = false;
        });
      };
      mainTs.subscribeVisibleLogicalRangeChange(onMainChange);
      rsiTs.subscribeVisibleLogicalRangeChange(onRsiChange);
      scheduleSynchronizedRender();
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
        scheduleSynchronizedRender();
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
    scheduleSynchronizedRender,
    updateRsiBandOverlay,
  ]);

  useLayoutEffect(() => {
    if (!rsiContainerRef.current || !rsiChartRef.current) return;
    resizeRsiChart();
  }, [resizeRsiChart, rsiPanelHeight, showRsi]);

  useLayoutEffect(() => {
    if (!showRsi) return;
    scheduleSynchronizedRender();
  }, [showRsi, obLevel, osLevel, rsiPanelHeight, theme, scheduleSynchronizedRender]);

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
      const sortedCandles = [...allCandles].sort((a, b) => a.time - b.time);
      sortedCandlesRef.current = sortedCandles;
      sortedCandleTimesRef.current = sortedCandles.map((candle) => candle.time);

      const formattedData: CandlestickData[] = sortedCandles
        .map((c, index) => ({
          time: index as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
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
          scheduleSynchronizedRender();
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
        scheduleSynchronizedRender();
      }
    }
  }, [allCandles, scheduleSynchronizedRender]);

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

    const mainTs = chartRef.current.timeScale();

    const onScroll = (range: LogicalRange | null) => {
      if (range && !isLoadingHistory) {
        if (range.from <= 200) {
          loadOlderCandles();
        }
      }
    };

    mainTs.subscribeVisibleLogicalRangeChange(onScroll);
    return () => {
      try {
        mainTs.unsubscribeVisibleLogicalRangeChange(onScroll);
      } catch {}
    };
  }, [allCandles, isLoadingHistory, loadOlderCandles]);

  useEffect(() => {
    if (showRsi && rsiSeriesRef.current && allRsiData.rsi) {
      const indexedCandles =
        sortedCandlesRef.current.length > 0
          ? sortedCandlesRef.current
          : [...allCandles].sort((a, b) => a.time - b.time);

      rsiSeriesRef.current.setData(
        alignLineDataToCandleIndexes(allRsiData.rsi, indexedCandles),
      );
      if (smaRsiSeriesRef.current && allRsiData.sma_rsi) {
        smaRsiSeriesRef.current.setData(
          alignLineDataToCandleIndexes(allRsiData.sma_rsi, indexedCandles),
        );
      }
      if (emaRsiSeriesRef.current && allRsiData.ema_rsi) {
        emaRsiSeriesRef.current.setData(
          alignLineDataToCandleIndexes(allRsiData.ema_rsi, indexedCandles),
        );
      }
      if (wmaRsiSeriesRef.current && allRsiData.wma_rsi) {
        wmaRsiSeriesRef.current.setData(
          alignLineDataToCandleIndexes(allRsiData.wma_rsi, indexedCandles),
        );
      }
      if (bbUpperSeriesRef.current && allRsiData.bollinger_bands) {
        bbUpperSeriesRef.current.setData(
          alignFieldDataToCandleIndexes(
            allRsiData.bollinger_bands,
            "upper",
            indexedCandles,
          ),
        );
      }
      if (bbMiddleSeriesRef.current && allRsiData.bollinger_bands) {
        bbMiddleSeriesRef.current.setData(
          alignFieldDataToCandleIndexes(
            allRsiData.bollinger_bands,
            "middle",
            indexedCandles,
          ),
        );
      }
      if (bbLowerSeriesRef.current && allRsiData.bollinger_bands) {
        bbLowerSeriesRef.current.setData(
          alignFieldDataToCandleIndexes(
            allRsiData.bollinger_bands,
            "lower",
            indexedCandles,
          ),
        );
      }
      if (stochKSeriesRef.current && allRsiData.stoch_rsi) {
        stochKSeriesRef.current.setData(
          alignFieldDataToCandleIndexes(
            allRsiData.stoch_rsi,
            "k",
            indexedCandles,
          ),
        );
      }
      if (stochDSeriesRef.current && allRsiData.stoch_rsi) {
        stochDSeriesRef.current.setData(
          alignFieldDataToCandleIndexes(
            allRsiData.stoch_rsi,
            "d",
            indexedCandles,
          ),
        );
      }
      if (obSeriesRef.current) {
        obSeriesRef.current.setData(makeLevelLineData(obLevel, indexedCandles));
      }
      if (osSeriesRef.current) {
        osSeriesRef.current.setData(makeLevelLineData(osLevel, indexedCandles));
      }
      scheduleSynchronizedRender();
    }
  }, [
    showRsi,
    allRsiData,
    allCandles,
    obLevel,
    osLevel,
    scheduleSynchronizedRender,
  ]);

  useEffect(() => {
    if (showRsi) return;
    setHoveredRsiValues(null);
  }, [showRsi]);

  useEffect(() => {
    if (lastCandle) {
      setAllCandles((prev) => {
        const byTime = new Map<number, Candle>();
        prev.forEach((candle) => byTime.set(candle.time, candle));
        byTime.set(lastCandle.time, lastCandle);
        return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
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
