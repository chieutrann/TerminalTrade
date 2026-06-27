import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { intervalToChartInterval, normalizeIntervalKey } from '../lib/intervals';

const MAX_FAVORITE_INTERVALS = 10;

export type MaConfig = {
  show: boolean;
  period: number;
  color: string;
  lineStyle: 0 | 1 | 2 | 3 | 4;
  lineWidth: 1 | 2 | 3 | 4;
  showValue: boolean;
};

export const defaultMaConfig: MaConfig = {
  show: false,
  period: 14,
  color: '#8b5cf6',
  lineStyle: 0,
  lineWidth: 2,
  showValue: true,
};

export type ChartProfileData = {
  symbol: string;
  interval: string;
  theme: 'light' | 'dark';
  chartTimeZone: string;
  rsiPeriod: number;
  rsiSource: string;
  rsiLineWidth: 1 | 2 | 3 | 4;
  showRsi: boolean;
  showRsiBb: boolean;
  showStochRsi: boolean;
  showDivergences: boolean;
  showMtf: boolean;
  smaMa: MaConfig;
  emaMa: MaConfig;
  wmaMa: MaConfig;
  obLevel: number;
  osLevel: number;
  favoriteIntervals: string[];
  customIntervals?: string[];
};

export type ChartProfile = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  data: ChartProfileData;
};

type StoreState = {
  symbol: string;
  interval: string;
  theme: 'light' | 'dark';
  chartTimeZone: string;
  rsiPeriod: number;
  rsiSource: string;
  rsiLineWidth: 1 | 2 | 3 | 4;
  showRsi: boolean;
  showRsiBb: boolean;
  showStochRsi: boolean;
  showDivergences: boolean;
  showMtf: boolean;
  smaMa: MaConfig;
  emaMa: MaConfig;
  wmaMa: MaConfig;
  obLevel: number;
  osLevel: number;
  favoriteIntervals: string[];
  customIntervals: string[];
  profiles: ChartProfile[];
  activeProfileId: string | null;

  setSymbol: (s: string) => void;
  setInterval: (i: string) => void;
  setTheme: (t: 'light' | 'dark') => void;
  setChartTimeZone: (timeZone: string) => void;
  setRsiPeriod: (p: number) => void;
  setRsiSource: (s: string) => void;
  setRsiLineWidth: (w: 1 | 2 | 3 | 4) => void;
  setShowRsi: (s: boolean) => void;
  setShowRsiBb: (s: boolean) => void;
  setShowStochRsi: (s: boolean) => void;
  setShowDivergences: (s: boolean) => void;
  setShowMtf: (s: boolean) => void;
  setSmaMa: (c: Partial<MaConfig>) => void;
  setEmaMa: (c: Partial<MaConfig>) => void;
  setWmaMa: (c: Partial<MaConfig>) => void;
  setObLevel: (l: number) => void;
  setOsLevel: (l: number) => void;
  setFavoriteIntervals: (ints: string[]) => void;
  addCustomInterval: (interval: string) => void;
  toggleFavoriteInterval: (interval: string) => void;
  saveProfile: (name: string) => void;
  loadProfile: (id: string) => void;
  deleteProfile: (id: string) => void;
};

function createProfileData(state: StoreState): ChartProfileData {
  return {
    symbol: state.symbol,
    interval: state.interval,
    theme: state.theme,
    chartTimeZone: state.chartTimeZone,
    rsiPeriod: state.rsiPeriod,
    rsiSource: state.rsiSource,
    rsiLineWidth: state.rsiLineWidth,
    showRsi: state.showRsi,
    showRsiBb: state.showRsiBb,
    showStochRsi: state.showStochRsi,
    showDivergences: state.showDivergences,
    showMtf: state.showMtf,
    smaMa: { ...state.smaMa },
    emaMa: { ...state.emaMa },
    wmaMa: { ...state.wmaMa },
    obLevel: state.obLevel,
    osLevel: state.osLevel,
    favoriteIntervals: [...state.favoriteIntervals],
    customIntervals: [...state.customIntervals],
  };
}

function sanitizeIntervalKeys(intervals: string[], limit?: number): string[] {
  const unique = new Set<string>();
  intervals.forEach((interval) => {
    const normalized = normalizeIntervalKey(interval);
    if (normalized) unique.add(normalized);
  });

  const result = Array.from(unique);
  return typeof limit === 'number' ? result.slice(0, limit) : result;
}

export const useTradingStore = create<StoreState>()(
  persist(
    (set) => ({
      symbol: 'BTC/USD',
      interval: '1m',
      theme: 'dark',
      chartTimeZone: 'UTC',
      rsiPeriod: 14,
      rsiSource: 'close',
      rsiLineWidth: 2,
      showRsi: true,
      showRsiBb: false,
      showStochRsi: false,
      showDivergences: false,
      showMtf: false,
      smaMa: { ...defaultMaConfig, color: '#f59e0b' },
      emaMa: { ...defaultMaConfig, color: '#0ea5e9' },
      wmaMa: { ...defaultMaConfig, color: '#22c55e' },
      obLevel: 70,
      osLevel: 30,
      favoriteIntervals: ['1s', '3s', '10s', '1m', '7m', '15m', '2h', '4h', '1d'],
      customIntervals: [],
      profiles: [],
      activeProfileId: null,

      setSymbol: (symbol) => set({ symbol }),
      setInterval: (interval) => {
        const normalized = intervalToChartInterval(interval);
        return normalized ? set({ interval: normalized }) : undefined;
      },
      setTheme: (theme) => set({ theme }),
      setChartTimeZone: (chartTimeZone) => set({ chartTimeZone }),
      setRsiPeriod: (rsiPeriod) => set({ rsiPeriod }),
      setRsiSource: (rsiSource) => set({ rsiSource }),
      setRsiLineWidth: (rsiLineWidth) => set({ rsiLineWidth }),
      setShowRsi: (showRsi) => set({ showRsi }),
      setShowRsiBb: (showRsiBb) => set({ showRsiBb }),
      setShowStochRsi: (showStochRsi) => set({ showStochRsi }),
      setShowDivergences: (showDivergences) => set({ showDivergences }),
      setShowMtf: (showMtf) => set({ showMtf }),
      setSmaMa: (c) => set((s) => ({ smaMa: { ...s.smaMa, ...c } })),
      setEmaMa: (c) => set((s) => ({ emaMa: { ...s.emaMa, ...c } })),
      setWmaMa: (c) => set((s) => ({ wmaMa: { ...s.wmaMa, ...c } })),
      setObLevel: (obLevel) => set({ obLevel }),
      setOsLevel: (osLevel) => set({ osLevel }),
      setFavoriteIntervals: (favoriteIntervals) =>
        set({
          favoriteIntervals: sanitizeIntervalKeys(favoriteIntervals, MAX_FAVORITE_INTERVALS),
        }),
      addCustomInterval: (interval) => set((state) => {
        const normalized = normalizeIntervalKey(interval);
        if (!normalized) return {};
        return {
          customIntervals: sanitizeIntervalKeys([...state.customIntervals, normalized]),
        };
      }),
      toggleFavoriteInterval: (interval) => set((state) => {
        const normalized = normalizeIntervalKey(interval);
        if (!normalized) return {};

        const current = sanitizeIntervalKeys(state.favoriteIntervals, MAX_FAVORITE_INTERVALS);
        const exists = current.includes(normalized);
        return {
          favoriteIntervals: exists
            ? current.filter((item) => item !== normalized)
            : [...current, normalized].slice(0, MAX_FAVORITE_INTERVALS),
        };
      }),
      saveProfile: (rawName) => set((state) => {
        const name = rawName.trim();
        if (!name) return {};

        const existing = state.profiles.find((profile) => profile.name.toLowerCase() === name.toLowerCase());
        const now = Date.now();
        const data = createProfileData(state);

        if (existing) {
          return {
            profiles: state.profiles.map((profile) =>
              profile.id === existing.id
                ? { ...profile, name, updatedAt: now, data }
                : profile
            ),
            activeProfileId: existing.id,
          };
        }

        const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
        return {
          profiles: [
            ...state.profiles,
            { id, name, createdAt: now, updatedAt: now, data },
          ],
          activeProfileId: id,
        };
      }),
      loadProfile: (id) => set((state) => {
        const profile = state.profiles.find((item) => item.id === id);
        if (!profile) return {};

        return {
          ...profile.data,
          rsiLineWidth: profile.data.rsiLineWidth ?? state.rsiLineWidth ?? 2,
          smaMa: { ...profile.data.smaMa },
          emaMa: { ...profile.data.emaMa },
          wmaMa: { ...profile.data.wmaMa },
          chartTimeZone: profile.data.chartTimeZone ?? state.chartTimeZone ?? 'UTC',
          favoriteIntervals: sanitizeIntervalKeys(
            profile.data.favoriteIntervals,
            MAX_FAVORITE_INTERVALS,
          ),
          customIntervals: sanitizeIntervalKeys(
            profile.data.customIntervals ?? state.customIntervals ?? [],
          ),
          activeProfileId: id,
        };
      }),
      deleteProfile: (id) => set((state) => ({
        profiles: state.profiles.filter((profile) => profile.id !== id),
        activeProfileId: state.activeProfileId === id ? null : state.activeProfileId,
      })),
    }),
    {
      name: 'trading-terminal-storage',
      version: 2,
    }
  )
);
