# factorionuclear2.x

Nuclear **and fusion** power calculator for **Factorio 2.0.7 and later**,
with quality support from the **Space Age** expansion.

**Try it in your browser: <https://aliig.github.io/factorionuclear2.x/>**

Given an `x` by `y` grid of reactors, computes everything needed to convert
their output into electricity: for nuclear, heat exchangers, steam turbines,
and offshore pumps; for fusion, fusion generators and cryogenic plants for
the fluoroketone coolant loop — plus fuel cell consumption for both.

## Web version

The interactive version (`index.html` + `calc.js`, no build step) goes beyond
the CLI: cells in the reactor grid are clickable, so irregular layouts
(rings, checkerboards, L-shapes) are supported, with each reactor's neighbour
bonus multiplier shown in place. Nuclear and fusion live on separate tabs
(link directly to fusion with `#fusion`) sharing the same layout grid.
`parity_check.py` verifies the JavaScript port produces identical results to
the Python implementation.

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
```

`--mode` picks the technology (`nuclear`, the default, or `fusion`).
`-q/--quality` sets the quality tier for all components; the per-component
flags (`--reactor-quality`, `--heat-exchanger-quality`, `--turbine-quality`,
`--pump-quality` for nuclear; `--reactor-quality`, `--generator-quality`,
`--cryo-plant-quality` for fusion) override it individually. Tiers: `normal`,
`uncommon`, `rare`, `epic`, `legendary`.

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

For nuclear, everything scales by the same multiplier, so an all-legendary
build uses the same machine *counts* as an all-normal one but produces 2.5x
the power — and burns fuel cells 2.5x as fast (one per 80 s per reactor).
The same holds for an all-same-quality fusion build, but note the fractional
coolant rates at intermediate tiers (5.2/s is not a whole number): the code
keeps these as exact rationals (Python `Fraction`s / integer tenths in JS)
so no rounding creeps in before the final machine-count round-up.
