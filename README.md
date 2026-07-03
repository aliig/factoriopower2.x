# factorionuclear2.x

Nuclear power calculator for **Factorio 2.0.7 and later**, with quality
support from the **Space Age** expansion.

Given an `x` by `y` grid of nuclear reactors, computes how many heat
exchangers, steam turbines, and offshore pumps are needed to convert all of
the heat into electricity, plus fuel cell consumption.

## Compatibility

- **Factorio 2.0.7+ required.** Version 2.0.7 changed the water:steam ratio
  from 1:1 to 1:10, which this calculator's offshore pump math depends on.
  For 1.1 (or 2.0.0–2.0.6) multiply the pump count by 10.
- **Quality tiers require Space Age** (specifically its Quality mod). Without
  it, everything is normal quality — the default — and the calculator matches
  the base game.

## Usage

```
python main.py -x 2 -y 2
python main.py -x 2 -y 2 -q legendary
python main.py -x 2 -y 2 --reactor-quality legendary --turbine-quality rare
```

`-q/--quality` sets the quality tier for all components; the per-component
flags (`--reactor-quality`, `--heat-exchanger-quality`, `--turbine-quality`,
`--pump-quality`) override it individually. Tiers: `normal`, `uncommon`,
`rare`, `epic`, `legendary`.

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

## Quality (Space Age)

Quality scales machine stats by +30% per level, +150% at legendary
([wiki](https://wiki.factorio.com/Quality)):

| Machine | Normal | Uncommon | Rare | Epic | Legendary |
|---|---|---|---|---|---|
| Reactor heat output (MW) | 40 | 52 | 64 | 76 | 100 |
| Heat exchanger consumption (MW) | 10 | 13 | 16 | 19 | 25 |
| Turbine steam intake (/s) | 60 | 78 | 96 | 114 | 150 |
| Offshore pump output (/s) | 1200 | 1560 | 1920 | 2280 | 3000 |

Because everything scales by the same multiplier, an all-legendary build uses
the same machine *counts* as an all-normal one but produces 2.5x the power —
and burns fuel cells 2.5x as fast (one per 80 s per reactor).
