// Calculation core, ported from main.py. UI-free so it runs in the browser
// (globals via window.NuclearCalc) and in Node (module.exports) for tests.

// Quality strengths are 0/1/2/3/5 and stats gain +30% per strength level
// (https://wiki.factorio.com/Quality), i.e. x1.0/1.3/1.6/1.9/2.5. Multipliers
// are expressed in tenths so scaling stays exact integer arithmetic; every
// base stat below is a multiple of 10, so no scaled value is ever fractional.
const QUALITY_MULTIPLIER_TENTHS = { normal: 10, uncommon: 13, rare: 16, epic: 19, legendary: 25 };
const QUALITY_TIERS = Object.keys(QUALITY_MULTIPLIER_TENTHS);

function scaleByQuality(baseStat) {
  const scaled = {};
  for (const [q, tenths] of Object.entries(QUALITY_MULTIPLIER_TENTHS)) {
    scaled[q] = (baseStat * tenths) / 10;
  }
  return scaled;
}

function scaleByQualityTenths(baseStat) {
  // For base stats that are not multiples of 10 (e.g. 4/s coolant becomes
  // 5.2/s at uncommon): values are kept in *tenths* of a unit so all the
  // arithmetic below stays on exact integers.
  const scaled = {};
  for (const [q, tenths] of Object.entries(QUALITY_MULTIPLIER_TENTHS)) {
    scaled[q] = baseStat * tenths;
  }
  return scaled;
}

// Heat output in MW, before neighbour bonus. https://wiki.factorio.com/Nuclear_reactor
const REACTOR_HEAT_OUTPUT = scaleByQuality(40);

// Heat consumption in MW. https://wiki.factorio.com/Heat_exchanger
const HEAT_EXCHANGER_CONSUMPTION = scaleByQuality(10);

// Steam consumption per second. https://wiki.factorio.com/Steam_turbine
const STEAM_TURBINE_CONSUMPTION = scaleByQuality(60);

// Water output per second. https://wiki.factorio.com/Offshore_pump
const OFFSHORE_PUMP_OUTPUT = scaleByQuality(1200);

// Energy per unit of 500°C steam: steam heat_capacity is 0.2 kJ/°C (data.raw),
// heated from 15°C default temperature = 485 x 0.2 = 97 kJ. Turbines convert
// it losslessly (effectivity = 1), so MW of heat == MW of electricity.
const STEAM_ENERGY_KJ = 97;

// Since 2.0.7 one unit of water becomes ten units of steam: water's
// heat_capacity is 2 kJ/°C vs steam's 0.2 kJ/°C, so the energy of one heated
// water is carried away by ten steam.
const WATER_TO_STEAM_RATIO = 10;

const FUEL_CELL_ENERGY_MJ = 8000; // fuel_value = "8GJ" per uranium fuel cell

// --- Fusion (Space Age) ----------------------------------------------------
// All base stats from data.raw (space-age/prototypes/, wube/factorio-data).

// Plasma output in MW, before neighbour bonus: the reactor turns coolant into
// plasma 1:1 at max_fluid_usage = 4/s, and one plasma unit at the default
// 1,000,000 degC carries 25 MJ (heat_capacity = "25J"), so 4 x 25 = 100 MW.
// The neighbour bonus (+100% per linked reactor) raises plasma *temperature*,
// not fluid volume, so output energy scales while the fluid loop rate doesn't.
const FUSION_REACTOR_PLASMA_OUTPUT = scaleByQuality(100);

// Cold fluoroketone intake in tenths per second (max_fluid_usage = 4/s).
// Independent of the neighbour bonus; the closed loop returns the same flow
// as hot fluoroketone from the generators (plasma in = hot fluoroketone out).
const FUSION_REACTOR_COOLANT_TENTHS = scaleByQualityTenths(4);

// Electric drain in MW while operating (fusion-reactor power_input = "10MW").
const FUSION_REACTOR_POWER_INPUT = scaleByQuality(10);

// Max electric output in MW (fusion-generator output_flow_limit = "50MW").
// Energy-limited: consumption and output scale together, so plasma MW
// converts losslessly to electric MW at any quality.
const FUSION_GENERATOR_OUTPUT = scaleByQuality(50);

// Fluoroketone cooled in tenths per second: the fluoroketone-cooling recipe
// converts 10 hot -> 10 cold in 5 s (2/s at speed 1) and the cryogenic
// plant's crafting_speed is 2, giving 4/s at normal quality.
const CRYO_PLANT_COOLING_TENTHS = scaleByQualityTenths(4);

const FUSION_CELL_ENERGY_MJ = 40000; // fuel_value = "40GJ" per fusion power cell

// --- Solar ------------------------------------------------------------------
// Base stats from data.raw (base/prototypes/, quality/prototypes/ in
// wube/factorio-data). Exact values are kept as reduced [numerator,
// denominator] integer pairs; every intermediate integer stays far below
// 2^53, so plain number arithmetic is exact.

// Peak output in kW at 100% solar (solar-panel production = "60kW").
const SOLAR_PANEL_OUTPUT_KW = scaleByQuality(60);

// Quality strength levels (quality/prototypes/quality.lua `level` fields).
const QUALITY_LEVELS = { normal: 0, uncommon: 1, rare: 2, epic: 3, legendary: 5 };

// Accumulator buffer_capacity = "5MJ", but the engine special-cases the
// quality scaling: +100% capacity per quality level (5/10/15/20/30 MJ),
// not the standard +30% per level.
const ACCUMULATOR_CAPACITY_KJ = {};
for (const [q, level] of Object.entries(QUALITY_LEVELS)) {
  ACCUMULATOR_CAPACITY_KJ[q] = 5000 * (1 + level);
}

// Accumulator input/output_flow_limit = "300kW", standard quality scaling.
// At night an accumulator can't discharge faster than this, so with big
// (high-quality) buffers on short-night planets the flow limit, not the
// capacity, can set the accumulator count.
const ACCUMULATOR_FLOW_KW = scaleByQuality(300);

// Day/night cycle geometry, identical on every surface: full daylight 1/2
// of the cycle, linear dusk ramp 1/5, night 1/10, linear dawn ramp 1/5.
// Average output = day + (dusk+dawn)/2 = 7/10 of peak. Accumulator energy
// per cycle (drawing the average continuously) = the whole night at the
// average plus the below-average parts of each ramp (avg^2/2 per ramp)
// = 7/10*1/10 + (49/100)/2*(2/5) = 21/125 of peak x cycle length.
const SOLAR_AVG_OUTPUT_FACTOR = [7, 10];
const SOLAR_ACC_DEFICIT_FACTOR = [21, 125];

// Surface solar-power (%) and day-night-cycle (s) from each planet's
// surface_properties (defaults 100 and 300 s in surface-property.lua;
// Nauvis overrides the cycle to 7 minutes). Space rows use the planets'
// solar_power_in_space; space platforms have no day/night cycle at all.
const SOLAR_SURFACES = [
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

function gcd(a, b) {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

function fReduce([n, d]) {
  const g = gcd(n, d) || 1;
  return [n / g, d / g];
}

function ceilDiv(a, b) {
  return Math.floor((a + b - 1) / b);
}

function getNeighbourCount(layout, rowIdx, cellIdx) {
  const maxRow = layout.length;
  const maxCol = layout[0].length;
  if (!layout[rowIdx][cellIdx]) return 0;
  let count = 0;
  if (rowIdx > 0 && layout[rowIdx - 1][cellIdx]) count += 1;
  if (rowIdx < maxRow - 1 && layout[rowIdx + 1][cellIdx]) count += 1;
  if (cellIdx > 0 && layout[rowIdx][cellIdx - 1]) count += 1;
  if (cellIdx < maxCol - 1 && layout[rowIdx][cellIdx + 1]) count += 1;
  return count;
}

function calculateSRE(layout, neighbouringBonus = 1) {
  // Sum of reactor equivalents: each reactor contributes its base output
  // times (1 + neighbours), since the neighbour bonus is +100% per adjacent
  // fuelled reactor.
  let accum = 0;
  for (let i = 0; i < layout.length; i++) {
    for (let j = 0; j < layout[0].length; j++) {
      if (layout[i][j]) {
        accum += 1 + getNeighbourCount(layout, i, j) * neighbouringBonus;
      }
    }
  }
  return accum;
}

function calculateRequirements(layout, {
  reactorQuality = "normal",
  heatExchangerQuality = "normal",
  turbineQuality = "normal",
  pumpQuality = "normal",
  neighbouringBonus = 1,
} = {}) {
  const reactorCount = layout.flat().filter(Boolean).length;
  const sre = calculateSRE(layout, neighbouringBonus);

  const reactorOutput = REACTOR_HEAT_OUTPUT[reactorQuality];
  const power = sre * reactorOutput; // MW of heat, == MW of electricity once converted

  // All flows are exact integer ratios; the only rounding anywhere is the
  // final ceilDiv per machine type, taken on the exact steady-state flow
  // (never on another machine's rounded-up count, which would over-provision).
  const steamPerSecond = (power * 1000) / STEAM_ENERGY_KJ; // steam/s to carry all the heat
  const waterPerSecond = steamPerSecond / WATER_TO_STEAM_RATIO;
  const heatExchangers = ceilDiv(power, HEAT_EXCHANGER_CONSUMPTION[heatExchangerQuality]);
  const turbines = ceilDiv(power * 1000, STEAM_ENERGY_KJ * STEAM_TURBINE_CONSUMPTION[turbineQuality]);
  const offshorePumps = ceilDiv(
    power * 1000,
    STEAM_ENERGY_KJ * WATER_TO_STEAM_RATIO * OFFSHORE_PUMP_OUTPUT[pumpQuality]
  );

  // Fuel is burned at the reactor's base consumption rate; the neighbour
  // bonus adds heat for free. Higher quality reactors burn cells faster.
  const fuelCellBurnTime = FUEL_CELL_ENERGY_MJ / reactorOutput;
  const fuelCellsPerMinute = (reactorCount * 60) / fuelCellBurnTime;

  return {
    reactors: reactorCount,
    offshorePumps,
    heatExchangers,
    turbines,
    power,
    steamPerSecond,
    waterPerSecond,
    fuelCellsPerMinute,
    fuelCellBurnTime,
  };
}

function calculateFusionRequirements(layout, {
  reactorQuality = "normal",
  generatorQuality = "normal",
  cryoPlantQuality = "normal",
  neighbouringBonus = 1,
} = {}) {
  const reactorCount = layout.flat().filter(Boolean).length;
  const sre = calculateSRE(layout, neighbouringBonus);

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

function bestSolarRatio(num, den, smallCap = null, cap = 99) {
  // Closest panels:accumulators approximation of the exact accumulators-
  // per-panel ratio num/den (reduced), with both terms <= cap and (for the
  // "simple" ratio) the smaller term <= smallCap. Comparisons use integer
  // cross-multiplication so this agrees bit for bit with main.py:
  // error of a/p is |a*den - p*num| / (p*den), so a/p beats a'/p' iff
  // |a*den - p*num| * p' < |a'*den - p'*num| * p. Ties prefer smaller
  // p+a, then p.
  if (num === 0) return null;
  let best = null; // [p, a, diff]
  const consider = (p, a) => {
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
  // The caps are a friendliness preference, not a hard constraint: for very
  // lopsided ratios (e.g. 1 accumulator per ~248 panels on Aquilo with
  // legendary accumulators) no capped ratio is honest. If the best capped
  // ratio is off by more than 1% (100*diff > p*num), redo the search with
  // only the smaller term capped: for each small-side value the optimal
  // uncapped partner is round(ideal), so checking its neighbours suffices.
  if (100 * best[2] > best[0] * num) {
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
  }
  const [p, a] = best;
  const errorPct = ((a * den - p * num) / (p * num)) * 100;
  return { panels: p, accumulators: a, errorPct };
}

function calculateSolarSurface(surface, {
  panelQuality = "normal",
  accumulatorQuality = "normal",
  targetMw = null,
} = {}) {
  const peakKw = fReduce([SOLAR_PANEL_OUTPUT_KW[panelQuality] * surface.solarPercent, 100]);
  const capacityKj = ACCUMULATOR_CAPACITY_KJ[accumulatorQuality];
  const flowKw = ACCUMULATOR_FLOW_KW[accumulatorQuality];

  const cycle = surface.cycleSeconds;
  let avgKw, accPerPanel, flowLimited;
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

  const result = {
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
    // floor(x*1000 + 0.5) rather than Math.round so JS and Python agree
    // (Math.round vs banker's rounding). Counts are each ceiled
    // independently off the exact target flow, per the usual rule.
    const targetKw = Math.floor(targetMw * 1000 + 0.5);
    result.panels = ceilDiv(targetKw * avgKw[1], avgKw[0]);
    result.accumulators = ceilDiv(targetKw * accumulatorsPerMw[0],
                                  1000 * accumulatorsPerMw[1]);
  }

  return result;
}

function calculateSolar(options = {}) {
  return SOLAR_SURFACES.map((surface) => calculateSolarSurface(surface, options));
}

// Global name kept from the nuclear-only days; it now covers fusion too.
const NuclearCalc = {
  QUALITY_TIERS,
  REACTOR_HEAT_OUTPUT,
  HEAT_EXCHANGER_CONSUMPTION,
  STEAM_TURBINE_CONSUMPTION,
  OFFSHORE_PUMP_OUTPUT,
  FUSION_REACTOR_PLASMA_OUTPUT,
  FUSION_GENERATOR_OUTPUT,
  SOLAR_SURFACES,
  getNeighbourCount,
  calculateSRE,
  calculateRequirements,
  calculateFusionRequirements,
  calculateSolar,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = NuclearCalc;
}
