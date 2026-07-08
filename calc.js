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

const NuclearCalc = {
  QUALITY_TIERS,
  REACTOR_HEAT_OUTPUT,
  HEAT_EXCHANGER_CONSUMPTION,
  STEAM_TURBINE_CONSUMPTION,
  OFFSHORE_PUMP_OUTPUT,
  getNeighbourCount,
  calculateSRE,
  calculateRequirements,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = NuclearCalc;
}
