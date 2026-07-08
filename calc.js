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

// Global name kept from the nuclear-only days; it now covers fusion too.
const NuclearCalc = {
  QUALITY_TIERS,
  REACTOR_HEAT_OUTPUT,
  HEAT_EXCHANGER_CONSUMPTION,
  STEAM_TURBINE_CONSUMPTION,
  OFFSHORE_PUMP_OUTPUT,
  FUSION_REACTOR_PLASMA_OUTPUT,
  FUSION_GENERATOR_OUTPUT,
  getNeighbourCount,
  calculateSRE,
  calculateRequirements,
  calculateFusionRequirements,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = NuclearCalc;
}
