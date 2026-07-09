// Solar. Base stats from data.raw (base/prototypes/, quality/prototypes/ in
// wube/factorio-data). Exact values are kept as reduced [numerator,
// denominator] integer pairs; every intermediate integer stays far below
// 2^53, so plain number arithmetic is exact.

import type { QualityTier } from "./quality";
import { scaleByQuality, scaleByQualityLevel } from "./quality";
import type { Fraction } from "./math";
import { fReduce, ceilDiv } from "./math";

// Peak output in kW at 100% solar (solar-panel production = "60kW").
export const SOLAR_PANEL_OUTPUT_KW = scaleByQuality(60);

// Accumulator buffer_capacity = "5MJ", but the engine special-cases the
// quality scaling: +100% capacity per quality level (5/10/15/20/30 MJ),
// not the standard +30% per level.
export const ACCUMULATOR_CAPACITY_KJ = scaleByQualityLevel(5000);

// Accumulator input/output_flow_limit = "300kW", standard quality scaling.
// At night an accumulator can't discharge faster than this, so with big
// (high-quality) buffers on short-night planets the flow limit, not the
// capacity, can set the accumulator count.
export const ACCUMULATOR_FLOW_KW = scaleByQuality(300);

// Day/night cycle geometry, identical on every surface: full daylight 1/2
// of the cycle, linear dusk ramp 1/5, night 1/10, linear dawn ramp 1/5.
// Average output = day + (dusk+dawn)/2 = 7/10 of peak. Accumulator energy
// per cycle (drawing the average continuously) = the whole night at the
// average plus the below-average parts of each ramp (avg^2/2 per ramp)
// = 7/10*1/10 + (49/100)/2*(2/5) = 21/125 of peak x cycle length.
const SOLAR_AVG_OUTPUT_FACTOR: Fraction = [7, 10];
const SOLAR_ACC_DEFICIT_FACTOR: Fraction = [21, 125];

export interface SolarSurface {
  key: string;
  label: string;
  solarPercent: number;
  cycleSeconds: number | null; // null: space platform, no day/night cycle
}

// Surface solar-power (%) and day-night-cycle (s) from each planet's
// surface_properties (defaults 100 and 300 s in surface-property.lua;
// Nauvis overrides the cycle to 7 minutes). Space rows use the planets'
// solar_power_in_space; space platforms have no day/night cycle at all.
export const SOLAR_SURFACES: SolarSurface[] = [
  { key: "nauvis", label: "Nauvis", solarPercent: 100, cycleSeconds: 420 },
  { key: "vulcanus", label: "Vulcanus", solarPercent: 400, cycleSeconds: 90 },
  { key: "gleba", label: "Gleba", solarPercent: 50, cycleSeconds: 600 },
  { key: "fulgora", label: "Fulgora", solarPercent: 20, cycleSeconds: 180 },
  { key: "aquilo", label: "Aquilo", solarPercent: 1, cycleSeconds: 1200 },
  { key: "nauvis-orbit", label: "Space above Nauvis", solarPercent: 300, cycleSeconds: null },
  { key: "vulcanus-orbit", label: "Space above Vulcanus", solarPercent: 600, cycleSeconds: null },
  { key: "gleba-orbit", label: "Space above Gleba", solarPercent: 200, cycleSeconds: null },
  { key: "fulgora-orbit", label: "Space above Fulgora", solarPercent: 120, cycleSeconds: null },
  { key: "aquilo-orbit", label: "Space above Aquilo", solarPercent: 60, cycleSeconds: null },
];

export interface RatioApprox {
  panels: number;
  accumulators: number;
  errorPct: number;
}

export function bestSolarRatio(
  num: number,
  den: number,
  smallCap: number | null = null,
  cap = 99
): RatioApprox | null {
  // Closest panels:accumulators approximation of the exact accumulators-
  // per-panel ratio num/den (reduced), with both terms <= cap and (for the
  // "simple" ratio) the smaller term <= smallCap. Comparisons use integer
  // cross-multiplication so the search is exact and deterministic:
  // error of a/p is |a*den - p*num| / (p*den), so a/p beats a'/p' iff
  // |a*den - p*num| * p' < |a'*den - p'*num| * p. Ties prefer smaller
  // p+a, then p.
  if (num === 0) return null;
  let best: [number, number, number] | null = null; // [p, a, diff]
  const consider = (p: number, a: number) => {
    const diff = Math.abs(a * den - p * num);
    if (best === null || diff * best[0] < best[2] * p
        || (diff * best[0] === best[2] * p
            && (p + a < best[0] + best[1]
                || (p + a === best[0] + best[1] && p < best[0])))) {
      best = [p, a, diff];
    }
  };
  for (let p = 1; p <= cap; p++) {
    // a starts at 1: recommending zero accumulators for a surface that
    // needs them (however few) would be worse than over-provisioning.
    for (let a = 1; a <= cap; a++) {
      if (smallCap !== null && Math.min(p, a) > smallCap) continue;
      consider(p, a);
    }
  }
  // The (1,1) candidate is always considered above, so `best` is set.
  let [bp, ba] = best!;
  const bdiff: number = best![2];
  // The caps are a friendliness preference, not a hard constraint: for very
  // lopsided ratios (e.g. 1 accumulator per ~248 panels on Aquilo with
  // legendary accumulators) no capped ratio is honest. If the best capped
  // ratio is off by more than 1% (100*diff > p*num), redo the search with
  // only the smaller term capped: for each small-side value the optimal
  // uncapped partner is round(ideal), so checking its neighbours suffices.
  if (100 * bdiff > bp * num) {
    best = null;
    const scap = smallCap !== null ? smallCap : cap;
    for (let small = 1; small <= scap; small++) {
      if (num <= den) { // accumulators are the smaller side
        const ideal = Math.floor((2 * small * den + num) / (2 * num)); // round-half-up
        for (const p of [ideal - 1, ideal, ideal + 1]) {
          if (p >= 1) consider(p, small);
        }
      } else { // panels are the smaller side
        const ideal = Math.floor((2 * small * num + den) / (2 * den));
        for (const a of [ideal - 1, ideal, ideal + 1]) {
          if (a >= 1) consider(small, a);
        }
      }
    }
    // The re-search always considers at least one candidate.
    [bp, ba] = best!;
  }
  const errorPct = ((ba * den - bp * num) / (bp * num)) * 100;
  return { panels: bp, accumulators: ba, errorPct };
}

export interface SolarOptions {
  panelQuality?: QualityTier;
  accumulatorQuality?: QualityTier;
  targetMw?: number | null;
}

export interface SolarSurfaceResult {
  surface: string;
  label: string;
  solarPercent: number;
  avgKwPerPanel: Fraction;
  accPerPanel: Fraction;
  flowLimited: boolean;
  panelsPerMw: Fraction;
  accumulatorsPerMw: Fraction;
  exactRatio: Fraction | null;
  simpleRatio: RatioApprox | null;
  preciseRatio: RatioApprox | null;
  panels: number | null;
  accumulators: number | null;
}

export function calculateSolarSurface(surface: SolarSurface, {
  panelQuality = "normal",
  accumulatorQuality = "normal",
  targetMw = null,
}: SolarOptions = {}): SolarSurfaceResult {
  const peakKw = fReduce([SOLAR_PANEL_OUTPUT_KW[panelQuality] * surface.solarPercent, 100]);
  const capacityKj = ACCUMULATOR_CAPACITY_KJ[accumulatorQuality];
  const flowKw = ACCUMULATOR_FLOW_KW[accumulatorQuality];

  const cycle = surface.cycleSeconds;
  let avgKw: Fraction, accPerPanel: Fraction, flowLimited: boolean;
  if (cycle === null) {
    // Space platforms: constant full daylight, nothing to buffer.
    avgKw = peakKw;
    accPerPanel = [0, 1];
    flowLimited = false;
  } else {
    avgKw = fReduce([peakKw[0] * SOLAR_AVG_OUTPUT_FACTOR[0],
                     peakKw[1] * SOLAR_AVG_OUTPUT_FACTOR[1]]);
    // Accumulators must both store the night's energy and discharge fast
    // enough to carry the average draw through the darkest part; whichever
    // needs more accumulators wins (compared by cross-multiplication).
    const energyBased = fReduce([peakKw[0] * cycle * SOLAR_ACC_DEFICIT_FACTOR[0],
                                 peakKw[1] * SOLAR_ACC_DEFICIT_FACTOR[1] * capacityKj]);
    const flowBased = fReduce([avgKw[0], avgKw[1] * flowKw]);
    flowLimited = flowBased[0] * energyBased[1] > energyBased[0] * flowBased[1];
    accPerPanel = flowLimited ? flowBased : energyBased;
  }

  const panelsPerMw = fReduce([1000 * avgKw[1], avgKw[0]]);
  const accumulatorsPerMw = fReduce([panelsPerMw[0] * accPerPanel[0],
                                     panelsPerMw[1] * accPerPanel[1]]);

  const result: SolarSurfaceResult = {
    surface: surface.key,
    label: surface.label,
    solarPercent: surface.solarPercent,
    avgKwPerPanel: avgKw,
    accPerPanel,
    flowLimited,
    panelsPerMw,
    accumulatorsPerMw,
    exactRatio: accPerPanel[0] !== 0 ? [accPerPanel[1], accPerPanel[0]] : null,
    simpleRatio: bestSolarRatio(accPerPanel[0], accPerPanel[1], 20),
    preciseRatio: bestSolarRatio(accPerPanel[0], accPerPanel[1]),
    panels: null,
    accumulators: null,
  };

  if (targetMw !== null) {
    // floor(x*1000 + 0.5) gives explicit round-half-up on the MW target.
    // Counts are each ceiled independently off the exact target flow, per
    // the usual rule.
    const targetKw = Math.floor(targetMw * 1000 + 0.5);
    result.panels = ceilDiv(targetKw * avgKw[1], avgKw[0]);
    result.accumulators = ceilDiv(targetKw * accumulatorsPerMw[0],
                                  1000 * accumulatorsPerMw[1]);
  }

  return result;
}

export function calculateSolar(options: SolarOptions = {}): SolarSurfaceResult[] {
  return SOLAR_SURFACES.map((surface) => calculateSolarSurface(surface, options));
}
