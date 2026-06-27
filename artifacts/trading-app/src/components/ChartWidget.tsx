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
  type Logical,
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


function intervalToSeconds(interval: string): number | null {
  const normalized = interval.trim();
  const match = normalized.match(/^(\d+)?([smhHdDwWM])$/);
  if (!match) return null;

  const value = Number(match[1] ?? 1);
  const unit = match[2];

  if (!Number.isFinite(value) || value <= 0) return null;

  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
    case "H":
      return value * 60 * 60;
    case "d":
    case "D":
      return value * 24 * 60 * 60;
    case "w":
    case "W":
      return value * 7 * 24 * 60 * 60;
    case "M":
      return value * 30 * 24 * 60 * 60;
    default:
      return null;
  }
}

function formatCandleCountdown(secondsLeft: number | null): string {
  if (secondsLeft === null || !Number.isFinite(secondsLeft)) return "--";

  const safe = Math.max(0, Math.floor(secondsLeft));
  const days = Math.floor(safe / 86_400);
  const hours = Math.floor((safe % 86_400) / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const seconds = safe % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;

  return `${seconds}s`;
}

function formatPriceLabel(price: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type RsiLinePoint = { time: number; value?: number | null };
type IndexedLinePoint = LineData<Time> | WhitespaceData<Time>;
type BollingerBandsLinePoint = {
  time: number;
  upper?: number | null;
  middle?: number | null;
  lower?: number | null;
};
type StochRsiLinePoint = { time: number; k?: number | null; d?: number | null };

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

function closedSortedCandles(candles: Candle[] | undefined): Candle[] {
  const deduped = new Map<number, Candle>();
  candles
    ?.filter((candle) => candle.is_closed !== false)
    .forEach((candle) => {
      deduped.set(candle.time, { ...candle, is_closed: true });
    });

  return Array.from(deduped.values()).sort((a, b) => a.time - b.time);
}

function upsertLockedClosedCandle(current: Candle[], candle: Candle): Candle[] {
  const closed = { ...candle, is_closed: true };
  const deduped = new Map<number, Candle>();
  current.forEach((item) => deduped.set(item.time, item));
  if (deduped.has(closed.time)) return current;

  deduped.set(closed.time, closed);

  return Array.from(deduped.values()).sort((a, b) => a.time - b.time);
}

function withPreviewCandle(closedCandles: Candle[], preview: Candle | null): Candle[] {
  const locked = closedSortedCandles(closedCandles);
  if (!preview || preview.is_closed === true) return locked;

  const lastLockedTime = locked.at(-1)?.time ?? Number.NEGATIVE_INFINITY;
  if (preview.time <= lastLockedTime) return locked;

  return [...locked, { ...preview, is_closed: false }];
}

function filterPointsToTimes<T extends { time: number }>(
  points: T[] | undefined,
  times: Set<number>,
): T[] | undefined {
  if (!points) return undefined;
  return points
    .filter((point) => times.has(point.time))
    .sort((a, b) => a.time - b.time);
}

function filterRsiDataToClosedTimes(
  data: Partial<RsiAdvancedResponse>,
  candles: Candle[],
): Partial<RsiAdvancedResponse> {
  const closedTimes = new Set(closedSortedCandles(candles).map((candle) => candle.time));

  return {
    ...data,
    rsi: filterPointsToTimes(data.rsi, closedTimes) ?? [],
    sma_rsi: filterPointsToTimes(data.sma_rsi, closedTimes),
    ema_rsi: filterPointsToTimes(data.ema_rsi, closedTimes),
    wma_rsi: filterPointsToTimes(data.wma_rsi, closedTimes),
    bollinger_bands: filterPointsToTimes(data.bollinger_bands, closedTimes),
    stoch_rsi: filterPointsToTimes(data.stoch_rsi, closedTimes),
    divergences: filterPointsToTimes(data.divergences, closedTimes),
  };
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

function candleSourceValue(candle: Candle, source: string): number {
  switch (source) {
    case "open":
      return candle.open;
    case "high":
      return candle.high;
    case "low":
      return candle.low;
    case "hl2":
      return (candle.high + candle.low) / 2;
    case "hlc3":
      return (candle.high + candle.low + candle.close) / 3;
    case "ohlc4":
      return (candle.open + candle.high + candle.low + candle.close) / 4;
    case "close":
    default:
      return candle.close;
  }
}

function calculatePreviewRsiValues(
  candles: Candle[],
  period: number,
  source: string,
): Array<number | null> {
  const prices = candles.map((candle) => candleSourceValue(candle, source));
  const result: Array<number | null> = Array(prices.length).fill(null);

  if (prices.length < period + 1) return result;

  const gains: number[] = [];
  const losses: number[] = [];
  for (let index = 1; index < prices.length; index += 1) {
    const delta = prices[index] - prices[index - 1];
    gains.push(Math.max(delta, 0));
    losses.push(Math.abs(Math.min(delta, 0)));
  }

  let avgGain = gains.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((sum, value) => sum + value, 0) / period;

  const compute = (gain: number, loss: number) => {
    if (gain === 0 && loss === 0) return 50;
    if (loss === 0) return 100;
    const rs = gain / loss;
    return 100 - 100 / (1 + rs);
  };

  result[period] = compute(avgGain, avgLoss);

  for (let index = period + 1; index < prices.length; index += 1) {
    const gain = gains[index - 1];
    const loss = losses[index - 1];
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[index] = compute(avgGain, avgLoss);
  }

  return result;
}

function calculatePreviewRsiMaValues(
  rsiValues: Array<number | null>,
  period: number,
  maType: "sma" | "ema" | "wma",
): Array<number | null> {
  const result: Array<number | null> = Array(rsiValues.length).fill(null);
  const valid = rsiValues
    .map((value, index) => ({ value, index }))
    .filter((point): point is { value: number; index: number } => point.value !== null);

  if (valid.length < period) return result;

  const values = valid.map((point) => point.value);
  const maValues: Array<number | null> = Array(values.length).fill(null);

  if (maType === "sma") {
    for (let index = period - 1; index < values.length; index += 1) {
      const window = values.slice(index - period + 1, index + 1);
      maValues[index] = window.reduce((sum, value) => sum + value, 0) / period;
    }
  } else if (maType === "ema") {
    const multiplier = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
    maValues[period - 1] = ema;
    for (let index = period; index < values.length; index += 1) {
      ema = values[index] * multiplier + ema * (1 - multiplier);
      maValues[index] = ema;
    }
  } else {
    const weights = Array.from({ length: period }, (_, index) => index + 1);
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    for (let index = period - 1; index < values.length; index += 1) {
      const window = values.slice(index - period + 1, index + 1);
      maValues[index] =
        window.reduce((sum, value, weightIndex) => sum + value * weights[weightIndex], 0) /
        totalWeight;
    }
  }

  valid.forEach((point, index) => {
    result[point.index] = maValues[index];
  });

  return result;
}

function calculatePreviewBollingerPoint(
  rsiValues: Array<number | null>,
  time: number,
  period = 20,
  stdDev = 2,
): BollingerBandsLinePoint {
  const valid = rsiValues.filter((value): value is number => value !== null);
  if (valid.length < period) return { time, upper: null, middle: null, lower: null };

  const window = valid.slice(-period);
  const middle = window.reduce((sum, value) => sum + value, 0) / period;
  const variance = window.reduce((sum, value) => sum + (value - middle) ** 2, 0) / period;
  const deviation = Math.sqrt(variance);

  return {
    time,
    upper: middle + stdDev * deviation,
    middle,
    lower: middle - stdDev * deviation,
  };
}

function calculatePreviewStochPoint(
  rsiValues: Array<number | null>,
  time: number,
  period = 14,
  smoothK = 3,
  smoothD = 3,
): StochRsiLinePoint {
  const valid = rsiValues.filter((value): value is number => value !== null);
  if (valid.length < period + smoothK + smoothD - 2) return { time, k: null, d: null };

  const rawK: Array<number | null> = Array(valid.length).fill(null);
  for (let index = period - 1; index < valid.length; index += 1) {
    const window = valid.slice(index - period + 1, index + 1);
    const low = Math.min(...window);
    const high = Math.max(...window);
    rawK[index] = high === low ? 50 : (100 * (valid[index] - low)) / (high - low);
  }

  const smoothedK: Array<number | null> = Array(valid.length).fill(null);
  for (let index = period + smoothK - 2; index < valid.length; index += 1) {
    const window = rawK
      .slice(index - smoothK + 1, index + 1)
      .filter((value): value is number => value !== null);
    if (window.length === smoothK) {
      smoothedK[index] = window.reduce((sum, value) => sum + value, 0) / smoothK;
    }
  }

  const smoothedD: Array<number | null> = Array(valid.length).fill(null);
  for (let index = period + smoothK + smoothD - 3; index < valid.length; index += 1) {
    const window = smoothedK
      .slice(index - smoothD + 1, index + 1)
      .filter((value): value is number => value !== null);
    if (window.length === smoothD) {
      smoothedD[index] = window.reduce((sum, value) => sum + value, 0) / smoothD;
    }
  }

  return {
    time,
    k: smoothedK[smoothedK.length - 1],
    d: smoothedD[smoothedD.length - 1],
  };
}

function appendPreviewPoint<T extends { time: number }>(
  locked: T[] | undefined,
  preview: T,
): T[] {
  const withoutPreviewTime = (locked ?? []).filter((point) => point.time !== preview.time);
  return [...withoutPreviewTime, preview].sort((a, b) => a.time - b.time);
}

function buildPreviewRsiData(
  lockedData: Partial<RsiAdvancedResponse>,
  renderCandles: Candle[],
  previewCandle: Candle | null,
  options: {
    period: number;
    source: string;
    smaPeriod: number;
    includeSma: boolean;
    emaPeriod: number;
    includeEma: boolean;
    wmaPeriod: number;
    includeWma: boolean;
    includeBb: boolean;
    includeStochRsi: boolean;
  },
): Partial<RsiAdvancedResponse> {
  if (!previewCandle || previewCandle.is_closed === true) return lockedData;
  if (renderCandles.at(-1)?.time !== previewCandle.time) return lockedData;

  const rsiValues = calculatePreviewRsiValues(renderCandles, options.period, options.source);
  const previewIndex = renderCandles.length - 1;
  const previewTime = previewCandle.time;
  const previewRsi = rsiValues[previewIndex];

  const nextData: Partial<RsiAdvancedResponse> = {
    ...lockedData,
    rsi: appendPreviewPoint(lockedData.rsi, { time: previewTime, value: previewRsi }),
  };

  if (options.includeSma) {
    const values = calculatePreviewRsiMaValues(rsiValues, options.smaPeriod, "sma");
    nextData.sma_rsi = appendPreviewPoint(lockedData.sma_rsi, {
      time: previewTime,
      value: values[previewIndex],
    });
  }

  if (options.includeEma) {
    const values = calculatePreviewRsiMaValues(rsiValues, options.emaPeriod, "ema");
    nextData.ema_rsi = appendPreviewPoint(lockedData.ema_rsi, {
      time: previewTime,
      value: values[previewIndex],
    });
  }

  if (options.includeWma) {
    const values = calculatePreviewRsiMaValues(rsiValues, options.wmaPeriod, "wma");
    nextData.wma_rsi = appendPreviewPoint(lockedData.wma_rsi, {
      time: previewTime,
      value: values[previewIndex],
    });
  }

  if (options.includeBb) {
    nextData.bollinger_bands = appendPreviewPoint(
      lockedData.bollinger_bands,
      calculatePreviewBollingerPoint(rsiValues, previewTime),
    );
  }

  if (options.includeStochRsi) {
    nextData.stoch_rsi = appendPreviewPoint(
      lockedData.stoch_rsi,
      calculatePreviewStochPoint(rsiValues, previewTime),
    );
  }

  return nextData;
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
  const [nowSeconds, setNowSeconds] = useState(() =>
    Math.floor(Date.now() / 1000),
  );
  const [currentPriceY, setCurrentPriceY] = useState<number | null>(null);
  const [rsiPanelHeight, setRsiPanelHeight] = useState(25);
  const [hoveredRsiValues, setHoveredRsiValues] =
    useState<HoveredRsiValues | null>(null);
  const [allCandles, setAllCandles] = useState<Candle[]>([]);
  const [previewCandle, setPreviewCandle] = useState<Candle | null>(null);
  const [allRsiData, setAllRsiData] = useState<Partial<RsiAdvancedResponse>>({
    rsi: [],
  });
  const historyFetchRef = useRef<AbortController | null>(null);
  const lockedCandlesRef = useRef<Candle[]>([]);
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
  const isSyncingCrosshairRef = useRef(false);
  const renderCandlesRef = useRef<Candle[]>([]);
  const visibleRsiDataRef = useRef<Partial<RsiAdvancedResponse>>({ rsi: [] });

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

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const renderCandles = useMemo(
    () => withPreviewCandle(allCandles, previewCandle),
    [allCandles, previewCandle],
  );

  const visibleRsiData = useMemo(
    () =>
      buildPreviewRsiData(allRsiData, renderCandles, previewCandle, {
        period: rsiPeriod,
        source: rsiSource,
        includeSma: smaMa.show,
        smaPeriod: smaMa.period,
        includeEma: emaMa.show,
        emaPeriod: emaMa.period,
        includeWma: wmaMa.show,
        wmaPeriod: wmaMa.period,
        includeBb: showRsiBb,
        includeStochRsi: showStochRsi,
      }),
    [
      allRsiData,
      renderCandles,
      previewCandle,
      rsiPeriod,
      rsiSource,
      smaMa.show,
      smaMa.period,
      emaMa.show,
      emaMa.period,
      wmaMa.show,
      wmaMa.period,
      showRsiBb,
      showStochRsi,
    ],
  );

  useEffect(() => {
    lockedCandlesRef.current = allCandles;
  }, [allCandles]);

  useEffect(() => {
    renderCandlesRef.current = renderCandles;
  }, [renderCandles]);

  useEffect(() => {
    visibleRsiDataRef.current = visibleRsiData;
  }, [visibleRsiData]);

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
        visible: !showRsi,
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
    [
      theme,
      showRsi,
      formatIndexedChartTime,
      formatIndexedChartDate,
      chartTimeZoneLabel,
    ],
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
        visible: true,
        borderVisible: true,
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

  const rsiValue = hoveredRsiValues?.rsi ?? latestValue(visibleRsiData.rsi);
  const visibleMaLegends = [
    smaMa.show
      ? {
          label: `SMA ${smaMa.period} RSI`,
          color: smaMa.color,
          value: hoveredRsiValues?.sma ?? latestValue(visibleRsiData.sma_rsi),
        }
      : null,
    emaMa.show
      ? {
          label: `EMA ${emaMa.period} RSI`,
          color: emaMa.color,
          value: hoveredRsiValues?.ema ?? latestValue(visibleRsiData.ema_rsi),
        }
      : null,
    wmaMa.show
      ? {
          label: `WMA ${wmaMa.period} RSI`,
          color: wmaMa.color,
          value: hoveredRsiValues?.wma ?? latestValue(visibleRsiData.wma_rsi),
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

  const clearSyncedCrosshair = useCallback(() => {
    (chartRef.current as unknown as { clearCrosshairPosition?: () => void })
      ?.clearCrosshairPosition?.();
    (rsiChartRef.current as unknown as { clearCrosshairPosition?: () => void })
      ?.clearCrosshairPosition?.();
  }, []);

  const syncCrosshairAtIndex = useCallback((index: number, source: "main" | "rsi") => {
    if (!Number.isFinite(index)) {
      clearSyncedCrosshair();
      return;
    }

    const roundedIndex = Math.round(index);
    const candle = renderCandlesRef.current[roundedIndex];
    if (!candle) {
      clearSyncedCrosshair();
      return;
    }

    const time = roundedIndex as Time;
    const rsiPoint = visibleRsiDataRef.current.rsi?.find(
      (point) => point.time === candle.time,
    );
    const rsiValue =
      typeof rsiPoint?.value === "number" ? rsiPoint.value : 50;

    isSyncingCrosshairRef.current = true;

    if (source !== "main" && chartRef.current && candlestickSeriesRef.current) {
      (
        chartRef.current as unknown as {
          setCrosshairPosition?: (
            price: number,
            horizontalPosition: Time,
            series: ISeriesApi<"Candlestick">,
          ) => void;
        }
      ).setCrosshairPosition?.(candle.close, time, candlestickSeriesRef.current);
    }

    if (source !== "rsi" && rsiChartRef.current && rsiSeriesRef.current) {
      (
        rsiChartRef.current as unknown as {
          setCrosshairPosition?: (
            price: number,
            horizontalPosition: Time,
            series: ISeriesApi<"Line">,
          ) => void;
        }
      ).setCrosshairPosition?.(rsiValue, time, rsiSeriesRef.current);
    }

    window.requestAnimationFrame(() => {
      isSyncingCrosshairRef.current = false;
    });
  }, [clearSyncedCrosshair]);

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
      lastValueVisible: false,
      priceLineVisible: true,
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    timeScaleRef.current = {
      indexToX: (index: number) =>
        chart.timeScale().logicalToCoordinate(index as Logical),
    };
    (window as typeof window & {
      logAlignment?: (index: number) => {
        index: number;
        rsiX: number | null;
        maeX: number | null;
        waeX: number | null;
      };
    }).logAlignment = logAlignment;

    const onCrosshairMove = (param: MouseEventParams<Time>) => {
      if (isSyncingCrosshairRef.current) return;
      if (typeof param.time !== "number") {
        clearSyncedCrosshair();
        return;
      }

      syncCrosshairAtIndex(param.time, "main");
    };
    chart.subscribeCrosshairMove(onCrosshairMove);

    return () => {
      if (synchronizedRenderFrameRef.current !== null) {
        window.cancelAnimationFrame(synchronizedRenderFrameRef.current);
        synchronizedRenderFrameRef.current = null;
      }
      try {
        chart.unsubscribeCrosshairMove(onCrosshairMove);
      } catch {}
      chart.remove();
      chartRef.current = null;
      timeScaleRef.current = null;
      candlestickSeriesRef.current = null;
      delete (window as typeof window & { logAlignment?: unknown })
        .logAlignment;
    };
  }, [chartOptions, logAlignment, clearSyncedCrosshair, syncCrosshairAtIndex]);

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
      if (isSyncingCrosshairRef.current) return;
      updateRsiBandOverlay();

      if (typeof param.time !== "number" || !param.seriesData.size) {
        setHoveredRsiValues(null);
        clearSyncedCrosshair();
        return;
      }

      syncCrosshairAtIndex(param.time, "rsi");
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
    clearSyncedCrosshair,
    syncCrosshairAtIndex,
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
      const lockedCandles = closedSortedCandles(candlesData.candles);
      seedKeyRef.current = key;
      initialRangeSetRef.current = false;
      setAllCandles(lockedCandles);
      setPreviewCandle(null);
      lastFetchEarliestRef.current = null;
      lastRsiFetchEarliestRef.current = null;
    }
    if (rsiData && seedKeyRef.current === key) {
      const lockedCandles = candlesData?.candles
        ? closedSortedCandles(candlesData.candles)
        : lockedCandlesRef.current;
      setAllRsiData(
        filterRsiDataToClosedTimes(
          rsiData as Partial<RsiAdvancedResponse>,
          lockedCandles,
        ),
      );
    }
  }, [candlesData, rsiData, symbol, interval]);

  // Apply allCandles to the chart series
  useEffect(() => {
    if (candlestickSeriesRef.current && renderCandles.length) {
      const sortedCandles = [...renderCandles].sort((a, b) => a.time - b.time);
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
  }, [renderCandles, scheduleSynchronizedRender]);

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
        const newCandles = closedSortedCandles(candlesResp.candles).filter(
          (c) => c.time < earliest,
        );
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
    if (showRsi && rsiSeriesRef.current && visibleRsiData.rsi) {
      const indexedCandles =
        sortedCandlesRef.current.length > 0
          ? sortedCandlesRef.current
          : [...renderCandles].sort((a, b) => a.time - b.time);

      rsiSeriesRef.current.setData(
        alignLineDataToCandleIndexes(visibleRsiData.rsi, indexedCandles),
      );
      if (smaRsiSeriesRef.current && visibleRsiData.sma_rsi) {
        smaRsiSeriesRef.current.setData(
          alignLineDataToCandleIndexes(visibleRsiData.sma_rsi, indexedCandles),
        );
      }
      if (emaRsiSeriesRef.current && visibleRsiData.ema_rsi) {
        emaRsiSeriesRef.current.setData(
          alignLineDataToCandleIndexes(visibleRsiData.ema_rsi, indexedCandles),
        );
      }
      if (wmaRsiSeriesRef.current && visibleRsiData.wma_rsi) {
        wmaRsiSeriesRef.current.setData(
          alignLineDataToCandleIndexes(visibleRsiData.wma_rsi, indexedCandles),
        );
      }
      if (bbUpperSeriesRef.current && visibleRsiData.bollinger_bands) {
        bbUpperSeriesRef.current.setData(
          alignFieldDataToCandleIndexes(
            visibleRsiData.bollinger_bands,
            "upper",
            indexedCandles,
          ),
        );
      }
      if (bbMiddleSeriesRef.current && visibleRsiData.bollinger_bands) {
        bbMiddleSeriesRef.current.setData(
          alignFieldDataToCandleIndexes(
            visibleRsiData.bollinger_bands,
            "middle",
            indexedCandles,
          ),
        );
      }
      if (bbLowerSeriesRef.current && visibleRsiData.bollinger_bands) {
        bbLowerSeriesRef.current.setData(
          alignFieldDataToCandleIndexes(
            visibleRsiData.bollinger_bands,
            "lower",
            indexedCandles,
          ),
        );
      }
      if (stochKSeriesRef.current && visibleRsiData.stoch_rsi) {
        stochKSeriesRef.current.setData(
          alignFieldDataToCandleIndexes(
            visibleRsiData.stoch_rsi,
            "k",
            indexedCandles,
          ),
        );
      }
      if (stochDSeriesRef.current && visibleRsiData.stoch_rsi) {
        stochDSeriesRef.current.setData(
          alignFieldDataToCandleIndexes(
            visibleRsiData.stoch_rsi,
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
    visibleRsiData,
    renderCandles,
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
      if (lastCandle.is_closed === true) {
        setPreviewCandle((current) =>
          current?.time === lastCandle.time ? null : current,
        );
        if (lockedCandlesRef.current.some((candle) => candle.time === lastCandle.time)) {
          return;
        }

        const lockedCandles = upsertLockedClosedCandle(
          lockedCandlesRef.current,
          lastCandle,
        );
        lockedCandlesRef.current = lockedCandles;
        setAllCandles(lockedCandles);
        setAllRsiData((current) =>
          buildPreviewRsiData(
            current,
            lockedCandles,
            { ...lastCandle, is_closed: false },
            {
              period: rsiPeriod,
              source: rsiSource,
              includeSma: smaMa.show,
              smaPeriod: smaMa.period,
              includeEma: emaMa.show,
              emaPeriod: emaMa.period,
              includeWma: wmaMa.show,
              wmaPeriod: wmaMa.period,
              includeBb: showRsiBb,
              includeStochRsi: showStochRsi,
            },
          ),
        );
      } else {
        const lastLockedTime =
          lockedCandlesRef.current.at(-1)?.time ?? Number.NEGATIVE_INFINITY;
        if (lastCandle.time > lastLockedTime) {
          setPreviewCandle({ ...lastCandle, is_closed: false });
        }
      }
    }
  }, [
    lastCandle,
    rsiPeriod,
    rsiSource,
    smaMa.show,
    smaMa.period,
    emaMa.show,
    emaMa.period,
    wmaMa.show,
    wmaMa.period,
    showRsiBb,
    showStochRsi,
  ]);

  const latestCandle = renderCandles.at(-1) ?? null;
  const latestPrice = latestCandle?.close ?? null;
  const intervalSeconds = intervalToSeconds(interval);
  const candleCloseTime =
    latestCandle !== null && intervalSeconds !== null
      ? latestCandle.time + intervalSeconds
      : null;
  const candleCountdown = formatCandleCountdown(
    candleCloseTime !== null ? candleCloseTime - nowSeconds : null,
  );
  const currentPriceLabelColor =
    latestCandle !== null && latestCandle.close >= latestCandle.open
      ? "#22c55e"
      : "#ef4444";

  useEffect(() => {
    if (!candlestickSeriesRef.current || latestPrice === null) {
      setCurrentPriceY(null);
      return;
    }

    const updatePriceLabelPosition = () => {
      const y = candlestickSeriesRef.current?.priceToCoordinate(latestPrice);
      setCurrentPriceY(y ?? null);
    };

    updatePriceLabelPosition();

    const frame = window.requestAnimationFrame(updatePriceLabelPosition);

    return () => window.cancelAnimationFrame(frame);
  }, [latestPrice, nowSeconds, renderCandles, showRsi, rsiPanelHeight]);

  return (
    <div ref={rootRef} className="flex flex-col w-full h-full bg-background">
      <div className="relative flex-1 min-h-[300px]">
        <div
          ref={chartContainerRef}
          className="w-full h-full"
          data-testid="main-chart"
        />
        {latestPrice !== null && currentPriceY !== null && (
          <div
            className="pointer-events-none absolute right-0 z-30 flex w-[70px] flex-col items-end justify-center px-1 py-0.5 text-right text-[11px] font-semibold leading-tight text-white shadow-sm"
            style={{
              top: `${currentPriceY}px`,
              transform: "translateY(-50%)",
              backgroundColor: currentPriceLabelColor,
            }}
          >
            <div>{formatPriceLabel(latestPrice)}</div>
            <div className="font-medium">{candleCountdown}</div>
          </div>
        )}
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
          <div className="pointer-events-none absolute left-2 top-12 z-20 text-xs leading-tight text-muted-foreground">
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
