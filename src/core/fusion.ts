// Fusion (Space Age). All base stats from data.raw (space-age/prototypes/,
// wube/factorio-data).

import type { QualityTier } from "./quality";
import { scaleByQuality, scaleByQualityTenths } from "./quality";
import { ceilDiv } from "./math";
import type { Layout } from "./nuclear";
import { calculateSRE } from "./nuclear";

// Plasma output in MW, before neighbour bonus: the reactor turns coolant into
// plasma 1:1 at max_fluid_usage = 4/s, and one plasma unit at the default
// 1,000,000 degC carries 25 MJ (heat_capacity = "25J"), so 4 x 25 = 100 MW.
// The neighbour bonus (+100% per linked reactor) raises plasma *temperature*,
// not fluid volume, so output energy scales while the fluid loop rate doesn't.
export const FUSION_REACTOR_PLASMA_OUTPUT = scaleByQuality(100);

// Cold fluoroketone intake in tenths per second (max_fluid_usage = 4/s).
// Independent of the neighbour bonus; the closed loop returns the same flow
// as hot fluoroketone from the generators (plasma in = hot fluoroketone out).
export const FUSION_REACTOR_COOLANT_TENTHS = scaleByQualityTenths(4);

// Electric drain in MW while operating (fusion-reactor power_input = "10MW").
export const FUSION_REACTOR_POWER_INPUT = scaleByQuality(10);

// Max electric output in MW (fusion-generator output_flow_limit = "50MW").
// Energy-limited: consumption and output scale together, so plasma MW
// converts losslessly to electric MW at any quality.
export const FUSION_GENERATOR_OUTPUT = scaleByQuality(50);

// Fluoroketone cooled in tenths per second: the fluoroketone-cooling recipe
// converts 10 hot -> 10 cold in 5 s (2/s at speed 1) and the cryogenic
// plant's crafting_speed is 2, giving 4/s at normal quality.
export const CRYO_PLANT_COOLING_TENTHS = scaleByQualityTenths(4);

export const FUSION_CELL_ENERGY_MJ = 40000; // fuel_value = "40GJ" per fusion power cell

// A fusion reactor is a 2x2 token on the fine layout grid. Each 2-cell edge is
// the reactor's "two fluid connections per side": offsetting a row by one cell
// makes those two cells face two *different* reactors, which is exactly why a
// staggered array links more (and reaches the +500% ceiling) than a parallel
// one. Links are counted from real tile adjacency below.
export const FUSION_REACTOR_SIZE = 2; // token footprint, in fine grid cells
// +100% per linked reactor, but you must leave one adjacent tile open for a
// fuel-cell inserter, so the practical maximum is +500% (5 links).
export const FUSION_MAX_LINKS = 5;

// Top-left anchor of a 2x2 reactor token on the fine grid.
export interface ReactorToken {
  r: number;
  c: number;
}

export interface LinkInfo extends ReactorToken {
  links: number;
  enclosed: boolean;
}

export function fusionReactorLinks(reactors: ReactorToken[]): LinkInfo[] {
  // Returns, per reactor, the count of *distinct* other reactors occupying a
  // cell edge-adjacent to its footprint, and whether it is enclosed (no open
  // adjacent tile, so an inserter can't reach it to load fuel cells).
  const S = FUSION_REACTOR_SIZE;
  const owner = new Map<string, number>(); // "r,c" -> reactor index
  const key = (r: number, c: number) => r + "," + c;
  reactors.forEach((rr, idx) => {
    for (let dr = 0; dr < S; dr++) {
      for (let dc = 0; dc < S; dc++) owner.set(key(rr.r + dr, rr.c + dc), idx);
    }
  });
  return reactors.map((rr, idx) => {
    const perimeter: [number, number][] = [];
    for (let d = 0; d < S; d++) {
      perimeter.push([rr.r - 1, rr.c + d]); // top
      perimeter.push([rr.r + S, rr.c + d]); // bottom
      perimeter.push([rr.r + d, rr.c - 1]); // left
      perimeter.push([rr.r + d, rr.c + S]); // right
    }
    const neighbours = new Set<number>();
    let openCells = 0;
    for (const [pr, pc] of perimeter) {
      const o = owner.get(key(pr, pc));
      if (o === undefined) openCells += 1;
      else if (o !== idx) neighbours.add(o);
    }
    return { r: rr.r, c: rr.c, links: neighbours.size, enclosed: openCells === 0 };
  });
}

export interface FusionOptions {
  reactorQuality?: QualityTier;
  generatorQuality?: QualityTier;
  cryoPlantQuality?: QualityTier;
  neighbouringBonus?: number; // rectangular path only
  linkCap?: number; // free-form layout path only
}

export interface FusionRequirements {
  reactors: number;
  generators: number;
  cryoPlants: number;
  power: number;
  reactorDrain: number;
  netPower: number;
  fluoroketonePerSecond: number;
  fuelCellsPerMinute: number;
  fuelCellBurnTime: number;
}

export interface FusionLayoutResult extends FusionRequirements {
  sre: number;
  links: LinkInfo[];
  enclosedCount: number;
}

function fusionRequirements(reactorCount: number, sre: number, {
  reactorQuality = "normal",
  generatorQuality = "normal",
  cryoPlantQuality = "normal",
}: FusionOptions = {}): FusionRequirements {
  const reactorOutput = FUSION_REACTOR_PLASMA_OUTPUT[reactorQuality];
  const power = sre * reactorOutput; // MW of plasma, == MW of electricity once converted
  const reactorDrain = reactorCount * FUSION_REACTOR_POWER_INPUT[reactorQuality];
  const netPower = power - reactorDrain;

  // As with nuclear, flows stay exact and the only rounding is the final
  // ceilDiv per machine type. Generators are sized off total plasma energy
  // (one shared network); the last one just runs at partial load.
  const generators = ceilDiv(power, FUSION_GENERATOR_OUTPUT[generatorQuality]);

  // The coolant loop is closed 1:1:1 (cold -> plasma -> hot), so the flow
  // the cryo plants must cool equals the reactors' cold intake.
  const fluoroketoneTenths = reactorCount * FUSION_REACTOR_COOLANT_TENTHS[reactorQuality];
  const cryoPlants = ceilDiv(fluoroketoneTenths, CRYO_PLANT_COOLING_TENTHS[cryoPlantQuality]);

  // Fuel burns at the reactor's base output rate (the neighbour bonus is
  // free energy), and only on demand — fusion has no idle burn, so this is
  // the consumption at full load.
  const fuelCellBurnTime = FUSION_CELL_ENERGY_MJ / reactorOutput;
  const fuelCellsPerMinute = (reactorCount * 60) / fuelCellBurnTime;

  return {
    reactors: reactorCount,
    generators,
    cryoPlants,
    power,
    reactorDrain,
    netPower,
    fluoroketonePerSecond: fluoroketoneTenths / 10,
    fuelCellsPerMinute,
    fuelCellBurnTime,
  };
}

// Rectangular-layout entry point: every reactor is fuelled and the neighbour
// bonus is orthogonal edge-adjacency (the shape a solid block makes). Used by
// the nuclear-style grid and the tests; the free-form editor path is below.
export function calculateFusionRequirements(layout: Layout, options: FusionOptions = {}): FusionRequirements {
  const reactorCount = layout.flat().filter(Boolean).length;
  const sre = calculateSRE(layout, options.neighbouringBonus ?? 1);
  return fusionRequirements(reactorCount, sre, options);
}

// Free-form editor entry point: reactors placed anywhere as 2x2 tokens, links
// read from real tile adjacency and capped at the +500% practical maximum.
export function calculateFusionLayout(reactors: ReactorToken[], options: FusionOptions = {}): FusionLayoutResult {
  const cap = options.linkCap ?? FUSION_MAX_LINKS;
  const links = fusionReactorLinks(reactors);
  const sre = links.reduce((acc, x) => acc + 1 + Math.min(x.links, cap), 0);
  const req = fusionRequirements(reactors.length, sre, options);
  return {
    ...req,
    sre,
    links,
    enclosedCount: links.reduce((n, x) => n + (x.enclosed ? 1 : 0), 0),
  };
}

// A rows x cols field of 2x2 reactor tokens; stagger offsets odd rows by one
// cell so each side's two fluid connections face two different reactors.
// Tokens whose footprint would leave the optional bounds are dropped.
export function fusionFill(
  cols: number,
  rows: number,
  staggered: boolean,
  bounds?: { rows: number; cols: number }
): ReactorToken[] {
  const S = FUSION_REACTOR_SIZE;
  const tokens: ReactorToken[] = [];
  for (let i = 0; i < rows; i++) {
    const off = staggered && i % 2 ? 1 : 0;
    for (let j = 0; j < cols; j++) {
      const r = i * S;
      const c = j * S + off;
      if (bounds && (r + S > bounds.rows || c + S > bounds.cols)) continue;
      tokens.push({ r, c });
    }
  }
  return tokens;
}
