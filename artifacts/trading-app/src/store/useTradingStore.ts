import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  profiles: ChartProfile[];
  activeProfileId: string | null;

  setSymbol: (s: string) => void;
  setInterval: (i: string) => void;
  setTheme: (t: 'light' | 'dark') => void;
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
  saveProfile: (name: string) => void;
  loadProfile: (id: string) => void;
  deleteProfile: (id: string) => void;
};

function createProfileData(state: StoreState): ChartProfileData {
  return {
    symbol: state.symbol,
    interval: state.interval,
    theme: state.theme,
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
  };
}

export const useTradingStore = create<StoreState>()(
  persist(
    (set) => ({
      symbol: 'BTC/USD',
      interval: '1m',
      theme: 'dark',
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
      favoriteIntervals: ['1s', '1m', '5m', '15m', '1h', '4h', '1d'],
      profiles: [],
      activeProfileId: null,

      setSymbol: (symbol) => set({ symbol }),
      setInterval: (interval) => set({ interval }),
      setTheme: (theme) => set({ theme }),
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
      setFavoriteIntervals: (favoriteIntervals) => set({ favoriteIntervals }),
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
          favoriteIntervals: [...profile.data.favoriteIntervals],
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
