# factoriopower2.x

Nuclear, **fusion, and solar** power calculator for **Factorio 2.0.7 and
later**, with quality support from the **Space Age** expansion.

**Try it in your browser: <https://aliig.github.io/factoriopower2.x/>**

Given an `x` by `y` grid of reactors, computes everything needed to convert
their output into electricity: for nuclear, heat exchangers, steam turbines,
and offshore pumps; for fusion, fusion generators and cryogenic plants for
the fluoroketone coolant loop — plus fuel cell consumption for both. The
solar mode is a per-surface planner instead: exact solar panel :
accumulator ratios for every planet (and space platform orbit), at any
quality mix, with optional concrete counts for a target average power.

## Web version

The interactive version (`index.html` + `calc.js`, no build step) goes beyond
the CLI: cells in the reactor grid are clickable, so irregular layouts
(rings, checkerboards, L-shapes) are supported, with each reactor's neighbour
bonus multiplier shown in place. Nuclear, fusion, and solar live on separate
tabs (deep links: `#fusion`, `#solar`); nuclear and fusion share the layout
grid, while solar shows the per-surface ratio table with an optional target
power input. `parity_check.py` verifies the JavaScript port produces
identical results to the Python implementation.

## Compatibility

- **Factorio 2.0.7+ required.** Version 2.0.7 changed the water:steam ratio
  from 1:1 to 1:10, which this calculator's offshore pump math depends on.
  For 1.1 (or 2.0.0–2.0.6) multiply the pump count by 10.
- **Quality tiers require Space Age** (specifically its Quality mod). Without
  it, everything is normal quality — the default — and the calculator matches
  the base game.
- **Fusion power requires Space Age.** Fusion stats are verified against the
  current data.raw (wube/factorio-data master, Factorio 2.1.x); 2.1.0 made
  no fusion balance changes, so 2.0 values match too.

## Usage

```
python main.py -x 2 -y 2
python main.py -x 2 -y 2 -q legendary
python main.py -x 2 -y 2 --reactor-quality legendary --turbine-quality rare
python main.py --mode fusion -x 2 -y 2
python main.py --mode fusion -x 2 -y 2 --reactor-quality legendary --cryo-plant-quality rare
python main.py --mode solar
python main.py --mode solar --panel-quality legendary --accumulator-quality normal --power 100
```

`--mode` picks the technology (`nuclear`, the default, `fusion`, or `solar`).
`-q/--quality` sets the quality tier for all components; the per-component
flags (`--reactor-quality`, `--heat-exchanger-quality`, `--turbine-quality`,
`--pump-quality` for nuclear; `--reactor-quality`, `--generator-quality`,
`--cryo-plant-quality` for fusion; `--panel-quality`,
`--accumulator-quality` for solar) override it individually. Tiers: `normal`,
`uncommon`, `rare`, `epic`, `legendary`. Solar ignores `-x/-y` (there is no
layout) and accepts `--power MW` to turn the per-MW table into concrete
panel and accumulator counts.

## The math

All base stats are taken from the game's prototype definitions
([data.raw](https://wiki.factorio.com/Data.raw), mirrored at
[wube/factorio-data](https://github.com/wube/factorio-data)) — the actual
source of truth the wiki infoboxes are generated from. They are defined
constants, not rounded: reactor `consumption = "40MW"`, `neighbour_bonus = 1`,
heat exchanger `energy_consumption = "10MW"`, turbine `fluid_usage_per_tick
= 1` (60/s) with `effectivity = 1`, pump `pumping_speed = 20` (1200/s), fuel
cell `fuel_value = "8GJ"`, steam `heat_capacity = "0.2kJ"`/°C, water
`heat_capacity = "2kJ"`/°C. Everything else is derived:

- Each reactor produces its base heat output, plus **+100% per directly
  adjacent fuelled reactor** (the neighbour bonus). A 2x2 grid of normal
  reactors therefore makes 4 x 40 x (1 + 2) = 480 MW.
- One unit of 500°C steam carries (500 − 15) x 0.2 kJ = **97 kJ**, and
  turbines convert it losslessly, so MW of heat equals MW of electricity.
  A normal heat exchanger consumes 10 MW and emits exactly 10,000/97
  ≈ 103.09 steam/s; a normal turbine consumes 60 steam/s (exactly 5.82 MW).
- **One water becomes ten steam** (changed from 1:1 in
  [2.0.7](https://wiki.factorio.com/Boiler): water carries 2 kJ/°C, ten times
  steam's 0.2 kJ/°C), so pumps are sized off one tenth of the steam flow.
- Fuel cells (8 GJ each) burn at the reactor's **base** consumption rate —
  the neighbour bonus is free heat. A normal reactor burns one cell per 200 s.

All intermediate flows are computed as exact rationals (`fractions.Fraction`);
the only rounding anywhere is the final round-up per machine type, applied to
the exact steady-state flow rather than to another machine's rounded-up count
(which would over-provision).

## The math (fusion)

Base stats again come straight from data.raw (verified against
[wube/factorio-data](https://github.com/wube/factorio-data) master, current
for Factorio 2.1.x — 2.1.0 changed no fusion balance): reactor
`max_fluid_usage = 4/s` (cold fluoroketone) and `power_input = "10MW"`,
plasma `heat_capacity = "25J"`/°C with `default_temperature` 1,000,000 °C,
generator `output_flow_limit = "50MW"` and `max_fluid_usage = 2/s`, fusion
power cell `fuel_value = "40GJ"`, cryogenic plant `crafting_speed = 2` with
the fluoroketone-cooling recipe (10 hot → 10 cold in 5 s, no productivity).

- One plasma unit at the base 1,000,000 °C carries 25 MJ, so a reactor
  converting coolant to plasma 1:1 at 4/s outputs **100 MW**. The neighbour
  bonus (+100% per directly adjacent reactor, same grid model as nuclear)
  raises the plasma's *temperature*, not its volume — bonus energy is free,
  and the fluid loop rate never changes.
- Generators convert plasma losslessly (a generator consumes `2×q` plasma/s
  and outputs `50×q` MW — the 25 MJ/unit ratio is quality-invariant), so
  **generators = ⌈plasma MW / generator MW⌉** and electric output equals
  plasma output; the last generator just runs at partial load.
- The coolant loop is closed 1:1:1 (cold → plasma → hot), so the flow the
  cryogenic plants must re-cool equals the reactors' cold intake:
  **4/s per reactor**, exactly one same-quality cryo plant per reactor.
- Each reactor also **drains 10 MW** (`power_input`, quality-scaled) from
  the grid while running; the calculator reports net output after drain.
- Fusion power cells (40 GJ) burn at the base output rate — one per 400 s
  per normal reactor — and **only on demand**: unlike nuclear there is no
  idle burn, so this is the consumption at full load.
- In-game, fusion reactors link through shared fluid connections (two per
  side), so staggered layouts can exceed four linked neighbours and reach
  +500%; the simple grid here models directly adjacent reactors only.

Unlike nuclear, fusion machine counts are **not** quality-invariant under
mixed quality: reactor output and generator capacity are different stats, so
e.g. legendary reactors with normal generators need 2.5× the generators.

## The math (solar)

Base stats from data.raw: solar panel `production = "60kW"`, accumulator
`buffer_capacity = "5MJ"` and `input/output_flow_limit = "300kW"`. Each
surface defines `solar-power` (%) and `day-night-cycle` via its
surface properties: Nauvis 100% / 420 s, Vulcanus 400% / 90 s, Gleba
50% / 600 s, Fulgora 20% / 180 s, Aquilo 1% / 1200 s. Space platforms use
the planets' `solar_power_in_space` (300/600/200/120/60%) and have **no
day/night cycle at all** — panels produce constant peak power and solar
needs no accumulators there.

The day/night shape is the same on every surface, only stretched: full
daylight for 1/2 of the cycle, a linear dusk ramp for 1/5, night for 1/10,
and a linear dawn ramp for 1/5. From that:

- **Average output = 7/10 of peak** (day + half of each ramp). A normal
  panel on Nauvis averages 42 kW.
- Drawing that average around the clock, accumulators must cover the night
  plus the below-average parts of both ramps:
  7/10·1/10 + (7/10)²/2·(2/5) = **21/125 of peak × cycle length**. On
  Nauvis that is 60 kW × 420 s × 21/125 = 4233.6 kJ per panel, i.e.
  4233.6/5000 = **0.84672 accumulators per panel — exactly 2646:3125**.
- Note this is *not* the folklore 0.84 (21:25): Factorio 2.0 changed the
  day from 25,000 to 25,200 ticks (exactly 7 minutes), which is why most
  older ratio tables are slightly off.
- Accumulators are also limited by **discharge speed** (300 kW × the
  standard quality multiplier). The count is therefore
  max(energy-based, flow-based). At normal quality the energy term always
  wins, but high-quality accumulators on short-night planets flip it:
  legendary accumulators on Vulcanus need 0.224 per panel for flow even
  though 0.121 would store enough energy — such rows are marked in the
  table.
- A handy invariant: the energy-based accumulator count per average MW is
  `0.24 × cycle seconds / capacity MJ`, independent of panel quality and
  solar strength (20.16/MW on Nauvis at normal quality).

**Accumulator quality is special**: the engine gives accumulators **+100%
capacity per quality level** (5/10/15/20/30 MJ), not the standard +30% —
while the flow limit scales normally (300/390/480/570/750 kW). Panel output
scales normally too, so mixed-quality ratios change shape: legendary panels
with normal accumulators need 2.1168 accumulators per panel on Nauvis, and
normal panels with legendary accumulators only 0.14112.

The simple and precise ratio columns are the closest rational
approximations of the exact ratio — simple keeps the smaller term ≤ 20,
precise allows both up to 99 — found by exact integer search, with the
signed error shown (e.g. Nauvis simple `13:11 (−0.07%)` runs the
accumulators 0.07% short of perfect; sizing off the per-MW columns is
always exact). The caps are a friendliness preference, not a hard limit:
when no capped ratio lands within 1% of the truth (very lopsided ratios,
like legendary accumulators on Aquilo), the larger term is allowed to grow
so the shown ratio stays honest — `248:1 (+0.01%)` rather than a distorted
`99:1 (+151%)`.

## Quality (Space Age)

Quality scales machine stats by +30% per level, +150% at legendary
([wiki](https://wiki.factorio.com/Quality)):

| Machine | Normal | Uncommon | Rare | Epic | Legendary |
|---|---|---|---|---|---|
| Reactor heat output (MW) | 40 | 52 | 64 | 76 | 100 |
| Heat exchanger consumption (MW) | 10 | 13 | 16 | 19 | 25 |
| Turbine steam intake (/s) | 60 | 78 | 96 | 114 | 150 |
| Offshore pump output (/s) | 1200 | 1560 | 1920 | 2280 | 3000 |
| Fusion reactor plasma output (MW) | 100 | 130 | 160 | 190 | 250 |
| Fusion reactor coolant intake (/s) | 4 | 5.2 | 6.4 | 7.6 | 10 |
| Fusion reactor grid drain (MW) | 10 | 13 | 16 | 19 | 25 |
| Fusion generator output (MW) | 50 | 65 | 80 | 95 | 125 |
| Cryogenic plant cooling (/s) | 4 | 5.2 | 6.4 | 7.6 | 10 |
| Solar panel peak output (kW) | 60 | 78 | 96 | 114 | 150 |
| Accumulator capacity (MJ) — special +100%/level | 5 | 10 | 15 | 20 | 30 |
| Accumulator charge/discharge (kW) | 300 | 390 | 480 | 570 | 750 |

For nuclear, everything scales by the same multiplier, so an all-legendary
build uses the same machine *counts* as an all-normal one but produces 2.5x
the power — and burns fuel cells 2.5x as fast (one per 80 s per reactor).
The same holds for an all-same-quality fusion build, but note the fractional
coolant rates at intermediate tiers (5.2/s is not a whole number): the code
keeps these as exact rationals (Python `Fraction`s / integer tenths in JS)
so no rounding creeps in before the final machine-count round-up.
