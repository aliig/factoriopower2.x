import type { QualityTier } from "../core/quality";
import type { ReactorToken } from "../core/fusion";
import { fusionFill } from "../core/fusion";

export type Mode = "nuclear" | "fusion" | "solar";

// Nuclear layout state lives in a fixed MAX_DIM x MAX_DIM backing grid so
// shrinking and re-growing the dimensions preserves toggled cells.
export const MAX_DIM = 20;

export const QUALITY_COMPONENTS = [
  "reactor",
  "heatExchanger",
  "turbine",
  "pump",
  "fusionReactor",
  "fusionGenerator",
  "cryoPlant",
  "solarPanel",
  "accumulator",
] as const;
export type QualityComponent = (typeof QUALITY_COMPONENTS)[number];

export interface AppState {
  mode: Mode;
  quality: Record<QualityComponent, QualityTier>;
  nuclear: { width: number; height: number; backing: boolean[][] };
  fusion: { reactors: ReactorToken[] };
  solar: { targetMw: number | null };
}

export interface Store {
  get(): AppState;
  set(patch: Partial<AppState>): void;
  subscribe(fn: (state: AppState) => void): () => void;
}

export function createStore(initial: AppState): Store {
  let state = initial;
  const listeners = new Set<(state: AppState) => void>();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      for (const fn of listeners) fn(state);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function defaultState(mode: Mode = "nuclear"): AppState {
  const quality = {} as Record<QualityComponent, QualityTier>;
  for (const c of QUALITY_COMPONENTS) quality[c] = "normal";
  return {
    mode,
    quality,
    nuclear: {
      width: 2,
      height: 2,
      backing: Array.from({ length: MAX_DIM }, () => Array(MAX_DIM).fill(true)),
    },
    fusion: { reactors: fusionFill(4, 4, true) }, // seed a staggered 4x4 so it isn't empty
    solar: { targetMw: null },
  };
}
