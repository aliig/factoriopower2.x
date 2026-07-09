import argparse
import math
from fractions import Fraction

# Quality strengths are 0/1/2/3/5 and stats gain +30% per strength level
# (https://wiki.factorio.com/Quality), i.e. x1.0/1.3/1.6/1.9/2.5. Multipliers
# are expressed in tenths so scaling stays exact integer arithmetic; every
# base stat below is a multiple of 10, so no scaled value is ever fractional.
QUALITY_MULTIPLIER_TENTHS = {"normal": 10, "uncommon": 13, "rare": 16, "epic": 19, "legendary": 25}
QUALITY_TIERS = list(QUALITY_MULTIPLIER_TENTHS)


def scale_by_quality(base_stat):
    return {q: base_stat * tenths // 10 for q, tenths in QUALITY_MULTIPLIER_TENTHS.items()}


def scale_by_quality_exact(base_stat):
    # For base stats that are not multiples of 10 (e.g. 4/s coolant becomes
    # 5.2/s at uncommon), where scale_by_quality's floor division would
    # silently truncate. Returns exact Fractions.
    return {q: Fraction(base_stat * tenths, 10) for q, tenths in QUALITY_MULTIPLIER_TENTHS.items()}


# Heat output in MW, before neighbour bonus. https://wiki.factorio.com/Nuclear_reactor
REACTOR_HEAT_OUTPUT = scale_by_quality(40)

# Heat consumption in MW. https://wiki.factorio.com/Heat_exchanger
HEAT_EXCHANGER_CONSUMPTION = scale_by_quality(10)

# Steam consumption per second. https://wiki.factorio.com/Steam_turbine
STEAM_TURBINE_CONSUMPTION = scale_by_quality(60)

# Water output per second. https://wiki.factorio.com/Offshore_pump
OFFSHORE_PUMP_OUTPUT = scale_by_quality(1200)

# Energy per unit of 500°C steam: steam heat_capacity is 0.2 kJ/°C (data.raw),
# heated from 15°C default temperature = 485 x 0.2 = 97 kJ. Turbines convert
# it losslessly (effectivity = 1), so MW of heat == MW of electricity.
STEAM_ENERGY_KJ = 97

# Since 2.0.7 one unit of water becomes ten units of steam: water's
# heat_capacity is 2 kJ/°C vs steam's 0.2 kJ/°C, so the energy of one heated
# water is carried away by ten steam.
WATER_TO_STEAM_RATIO = 10

FUEL_CELL_ENERGY_MJ = 8000  # fuel_value = "8GJ" per uranium fuel cell

# --- Fusion (Space Age) ---------------------------------------------------
# All base stats from data.raw (space-age/prototypes/, wube/factorio-data).

# Plasma output in MW, before neighbour bonus: the reactor turns coolant into
# plasma 1:1 at max_fluid_usage = 4/s, and one plasma unit at the default
# 1,000,000 degC carries 25 MJ (heat_capacity = "25J"), so 4 x 25 = 100 MW.
# The neighbour bonus (+100% per linked reactor) raises plasma *temperature*,
# not fluid volume, so output energy scales while the fluid loop rate doesn't.
FUSION_REACTOR_PLASMA_OUTPUT = scale_by_quality(100)

# Cold fluoroketone intake per second (fusion-reactor max_fluid_usage = 4/s).
# Independent of the neighbour bonus; the closed loop returns the same flow
# as hot fluoroketone from the generators (plasma in = hot fluoroketone out).
FUSION_REACTOR_COOLANT_CONSUMPTION = scale_by_quality_exact(4)

# Electric drain in MW while operating (fusion-reactor power_input = "10MW").
FUSION_REACTOR_POWER_INPUT = scale_by_quality(10)

# Max electric output in MW (fusion-generator output_flow_limit = "50MW").
# Energy-limited: consumption and output scale together, so plasma MW
# converts losslessly to electric MW at any quality.
FUSION_GENERATOR_OUTPUT = scale_by_quality(50)

# Fluoroketone cooled per second: the fluoroketone-cooling recipe converts
# 10 hot -> 10 cold in 5 s (2/s at speed 1) and the cryogenic plant's
# crafting_speed is 2, giving 4/s at normal quality.
CRYO_PLANT_COOLING_RATE = scale_by_quality_exact(4)

FUSION_CELL_ENERGY_MJ = 40000  # fuel_value = "40GJ" per fusion power cell

# --- Solar --------------------------------------------------------------
# Base stats from data.raw (base/prototypes/, quality/prototypes/ in
# wube/factorio-data).

# Peak output in kW at 100% solar (solar-panel production = "60kW").
SOLAR_PANEL_OUTPUT_KW = scale_by_quality(60)

# Quality strength levels (quality/prototypes/quality.lua `level` fields).
QUALITY_LEVELS = {"normal": 0, "uncommon": 1, "rare": 2, "epic": 3, "legendary": 5}

# Accumulator buffer_capacity = "5MJ", but the engine special-cases the
# quality scaling: +100% capacity per quality level (5/10/15/20/30 MJ),
# not the standard +30% per level.
ACCUMULATOR_CAPACITY_KJ = {q: 5000 * (1 + level) for q, level in QUALITY_LEVELS.items()}

# Accumulator input/output_flow_limit = "300kW", standard quality scaling.
# At night an accumulator can't discharge faster than this, so with big
# (high-quality) buffers on short-night planets the flow limit, not the
# capacity, can set the accumulator count.
ACCUMULATOR_FLOW_KW = scale_by_quality(300)

# Day/night cycle geometry, identical on every surface (only the cycle
# length and solar multiplier differ): full daylight for half the cycle,
# a linear dusk ramp (1 -> 0), night, and a linear dawn ramp (0 -> 1).
SOLAR_DAY = Fraction(1, 2)
SOLAR_DUSK = Fraction(1, 5)
SOLAR_NIGHT = Fraction(1, 10)
SOLAR_DAWN = Fraction(1, 5)

# Average output over a cycle: full day plus half of each linear ramp = 7/10.
SOLAR_AVG_OUTPUT_FACTOR = SOLAR_DAY + (SOLAR_DUSK + SOLAR_DAWN) / 2

# Energy accumulators must supply per cycle, as a fraction of peak x cycle
# length, drawing the average continuously: the whole night at the average,
# plus the parts of each ramp below the average (integrates to avg^2/2 per
# ramp) = 7/100 + 49/500 = 21/125.
SOLAR_ACC_DEFICIT_FACTOR = (SOLAR_AVG_OUTPUT_FACTOR * SOLAR_NIGHT
                            + SOLAR_AVG_OUTPUT_FACTOR ** 2 / 2 * (SOLAR_DUSK + SOLAR_DAWN))

# Surface solar-power (%) and day-night-cycle (s) from each planet's
# surface_properties (defaults 100 and 300 s in surface-property.lua;
# Nauvis overrides the cycle to 7 minutes). Space rows use the planets'
# solar_power_in_space; space platforms have no day/night cycle at all.
SOLAR_SURFACES = [
    {"key": "nauvis", "label": "Nauvis", "solar_percent": 100, "cycle_seconds": 420},
    {"key": "vulcanus", "label": "Vulcanus", "solar_percent": 400, "cycle_seconds": 90},
    {"key": "gleba", "label": "Gleba", "solar_percent": 50, "cycle_seconds": 600},
    {"key": "fulgora", "label": "Fulgora", "solar_percent": 20, "cycle_seconds": 180},
    {"key": "aquilo", "label": "Aquilo", "solar_percent": 1, "cycle_seconds": 1200},
    {"key": "nauvis-orbit", "label": "Space above Nauvis", "solar_percent": 300, "cycle_seconds": None},
    {"key": "vulcanus-orbit", "label": "Space above Vulcanus", "solar_percent": 600, "cycle_seconds": None},
    {"key": "gleba-orbit", "label": "Space above Gleba", "solar_percent": 200, "cycle_seconds": None},
    {"key": "fulgora-orbit", "label": "Space above Fulgora", "solar_percent": 120, "cycle_seconds": None},
    {"key": "aquilo-orbit", "label": "Space above Aquilo", "solar_percent": 60, "cycle_seconds": None},
]


def get_neighbour_count(layout, row_idx, cell_idx):
    max_row = len(layout)
    max_col = len(layout[0])
    if not layout[row_idx][cell_idx]:
        return 0
    count = 0
    if row_idx > 0 and layout[row_idx - 1][cell_idx]:
        count += 1
    if row_idx < max_row - 1 and layout[row_idx + 1][cell_idx]:
        count += 1
    if cell_idx > 0 and layout[row_idx][cell_idx - 1]:
        count += 1
    if cell_idx < max_col - 1 and layout[row_idx][cell_idx + 1]:
        count += 1
    return count


def calculate_sre(layout, neighbouring_bonus=1):
    # Sum of reactor equivalents: each reactor contributes its base output
    # times (1 + neighbours), since the neighbour bonus is +100% per adjacent
    # fuelled reactor.
    max_row = len(layout)
    max_col = len(layout[0])
    accum = 0
    for i in range(max_row):
        for j in range(max_col):
            if layout[i][j]:
                accum += 1 + get_neighbour_count(layout, i, j) * neighbouring_bonus
    return accum


def calculate_requirements(x, y, reactor_quality="normal", heat_exchanger_quality="normal",
                           turbine_quality="normal", pump_quality="normal",
                           neighbouring_bonus=1):
    if x < 1 or y < 1:
        raise ValueError("Layout dimensions must be at least 1x1")

    layout = [[True] * x for _ in range(y)]
    reactor_count = x * y
    sre = calculate_sre(layout, neighbouring_bonus)

    reactor_output = REACTOR_HEAT_OUTPUT[reactor_quality]
    power = sre * reactor_output  # MW of heat, == MW of electricity once converted

    # All flows are exact rationals; the only rounding anywhere is the final
    # ceil per machine type, taken on the exact steady-state flow (never on
    # another machine's rounded-up count, which would over-provision).
    steam = Fraction(power * 1000, STEAM_ENERGY_KJ)  # steam/s to carry all the heat
    water = steam / WATER_TO_STEAM_RATIO
    heat_exchangers = Fraction(power, HEAT_EXCHANGER_CONSUMPTION[heat_exchanger_quality])
    turbines = steam / STEAM_TURBINE_CONSUMPTION[turbine_quality]
    offshore_pumps = water / OFFSHORE_PUMP_OUTPUT[pump_quality]

    # Fuel is burned at the reactor's base consumption rate; the neighbour
    # bonus adds heat for free. Higher quality reactors burn cells faster.
    fuel_cell_burn_time = Fraction(FUEL_CELL_ENERGY_MJ, reactor_output)
    fuel_cells_per_minute = reactor_count * 60 / fuel_cell_burn_time

    return {
        "reactors": reactor_count,
        "offshore_pumps": math.ceil(offshore_pumps),
        "heat_exchangers": math.ceil(heat_exchangers),
        "turbines": math.ceil(turbines),
        "power": power,
        "steam_per_second": steam,
        "water_per_second": water,
        "fuel_cells_per_minute": fuel_cells_per_minute,
        "fuel_cell_burn_time": fuel_cell_burn_time,
    }


def calculate_fusion_requirements(x, y, reactor_quality="normal", generator_quality="normal",
                                  cryo_plant_quality="normal", neighbouring_bonus=1):
    if x < 1 or y < 1:
        raise ValueError("Layout dimensions must be at least 1x1")

    layout = [[True] * x for _ in range(y)]
    reactor_count = x * y
    sre = calculate_sre(layout, neighbouring_bonus)

    reactor_output = FUSION_REACTOR_PLASMA_OUTPUT[reactor_quality]
    power = sre * reactor_output  # MW of plasma, == MW of electricity once converted
    reactor_drain = reactor_count * FUSION_REACTOR_POWER_INPUT[reactor_quality]
    net_power = power - reactor_drain

    # As with nuclear, flows stay exact and the only rounding is the final
    # ceil per machine type. Generators are sized off total plasma energy
    # (one shared network); the last one just runs at partial load.
    generators = Fraction(power, FUSION_GENERATOR_OUTPUT[generator_quality])

    # The coolant loop is closed 1:1:1 (cold -> plasma -> hot), so the flow
    # the cryo plants must cool equals the reactors' cold intake.
    fluoroketone = reactor_count * FUSION_REACTOR_COOLANT_CONSUMPTION[reactor_quality]
    cryo_plants = fluoroketone / CRYO_PLANT_COOLING_RATE[cryo_plant_quality]

    # Fuel burns at the reactor's base output rate (the neighbour bonus is
    # free energy), and only on demand — fusion has no idle burn, so this is
    # the consumption at full load.
    fuel_cell_burn_time = Fraction(FUSION_CELL_ENERGY_MJ, reactor_output)
    fuel_cells_per_minute = reactor_count * 60 / fuel_cell_burn_time

    return {
        "reactors": reactor_count,
        "generators": math.ceil(generators),
        "cryo_plants": math.ceil(cryo_plants),
        "power": power,
        "reactor_drain": reactor_drain,
        "net_power": net_power,
        "fluoroketone_per_second": fluoroketone,
        "fuel_cells_per_minute": fuel_cells_per_minute,
        "fuel_cell_burn_time": fuel_cell_burn_time,
    }


def best_solar_ratio(exact, small_cap=None, cap=99):
    # Closest panels:accumulators approximation of the exact accumulators-
    # per-panel ratio, with both terms <= cap and (for the "simple" ratio)
    # the smaller term <= small_cap. All comparisons are done with integer
    # cross-multiplication so Python and the JS port agree bit for bit:
    # error of a/p is |a*D - p*N| / (p*D), so a/p beats a'/p' iff
    # |a*D - p*N| * p' < |a'*D - p'*N| * p. Ties prefer smaller p+a, then p.
    if exact == 0:
        return None
    num, den = exact.numerator, exact.denominator

    best = None  # (p, a, diff)

    def consider(p, a):
        nonlocal best
        diff = abs(a * den - p * num)
        if best is None or diff * best[0] < best[2] * p or (
                diff * best[0] == best[2] * p
                and (p + a, p) < (best[0] + best[1], best[0])):
            best = (p, a, diff)

    for p in range(1, cap + 1):
        # a starts at 1: recommending zero accumulators for a surface that
        # needs them (however few) would be worse than over-provisioning.
        for a in range(1, cap + 1):
            if small_cap is not None and min(p, a) > small_cap:
                continue
            consider(p, a)

    # The caps are a friendliness preference, not a hard constraint: for very
    # lopsided ratios (e.g. 1 accumulator per ~248 panels on Aquilo with
    # legendary accumulators) no capped ratio is honest. If the best capped
    # ratio is off by more than 1% (100*diff > p*num), redo the search with
    # only the smaller term capped: for each small-side value the optimal
    # uncapped partner is round(ideal), so checking its neighbours suffices.
    if 100 * best[2] > best[0] * num:
        best = None
        scap = small_cap if small_cap is not None else cap
        for small in range(1, scap + 1):
            if num <= den:  # accumulators are the smaller side
                ideal = (2 * small * den + num) // (2 * num)  # round-half-up
                for p in (ideal - 1, ideal, ideal + 1):
                    if p >= 1:
                        consider(p, small)
            else:  # panels are the smaller side
                ideal = (2 * small * num + den) // (2 * den)
                for a in (ideal - 1, ideal, ideal + 1):
                    if a >= 1:
                        consider(small, a)

    p, a, _ = best
    error_pct = (a * den - p * num) / (p * num) * 100
    return (p, a, error_pct)


def calculate_solar_surface(surface, panel_quality="normal", accumulator_quality="normal",
                            target_mw=None):
    peak_kw = Fraction(SOLAR_PANEL_OUTPUT_KW[panel_quality] * surface["solar_percent"], 100)
    capacity_kj = ACCUMULATOR_CAPACITY_KJ[accumulator_quality]
    flow_kw = ACCUMULATOR_FLOW_KW[accumulator_quality]

    cycle = surface["cycle_seconds"]
    if cycle is None:
        # Space platforms: constant full daylight, nothing to buffer.
        avg_kw = peak_kw
        acc_per_panel = Fraction(0)
        flow_limited = False
    else:
        avg_kw = peak_kw * SOLAR_AVG_OUTPUT_FACTOR
        # Accumulators must both store the night's energy and discharge
        # fast enough to carry the average draw through the darkest part;
        # whichever needs more accumulators wins.
        energy_based = peak_kw * cycle * SOLAR_ACC_DEFICIT_FACTOR / capacity_kj
        flow_based = avg_kw / flow_kw
        flow_limited = flow_based > energy_based
        acc_per_panel = max(energy_based, flow_based)

    panels_per_mw = 1000 / avg_kw
    accumulators_per_mw = panels_per_mw * acc_per_panel

    result = {
        "surface": surface["key"],
        "label": surface["label"],
        "solar_percent": surface["solar_percent"],
        "avg_kw_per_panel": avg_kw,
        "acc_per_panel": acc_per_panel,
        "flow_limited": flow_limited,
        "panels_per_mw": panels_per_mw,
        "accumulators_per_mw": accumulators_per_mw,
        "exact_ratio": ((acc_per_panel.denominator, acc_per_panel.numerator)
                        if acc_per_panel else None),
        "simple_ratio": best_solar_ratio(acc_per_panel, small_cap=20),
        "precise_ratio": best_solar_ratio(acc_per_panel),
        "panels": None,
        "accumulators": None,
    }

    if target_mw is not None:
        # floor(x*1000 + 0.5) rather than round() so Python and JS agree
        # (banker's rounding vs Math.round). Counts are each ceiled
        # independently off the exact target flow, per the usual rule.
        target_kw = math.floor(target_mw * 1000 + 0.5)
        result["panels"] = math.ceil(target_kw / avg_kw)
        result["accumulators"] = math.ceil(target_kw * acc_per_panel / avg_kw)

    return result


def calculate_solar(panel_quality="normal", accumulator_quality="normal", target_mw=None):
    return [calculate_solar_surface(surface, panel_quality, accumulator_quality, target_mw)
            for surface in SOLAR_SURFACES]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Factorio Nuclear, Fusion & Solar Power Calculator")
    parser.add_argument("--mode", choices=["nuclear", "fusion", "solar"], default="nuclear",
                        help="Power technology to calculate (default: nuclear)")
    parser.add_argument("-x", type=int, help="Width of the reactor layout (nuclear/fusion)")
    parser.add_argument("-y", type=int, help="Height of the reactor layout (nuclear/fusion)")
    parser.add_argument("-q", "--quality", choices=QUALITY_TIERS, default="normal",
                        help="Quality tier for all components (default: normal)")
    parser.add_argument("--reactor-quality", choices=QUALITY_TIERS,
                        help="Override quality for reactors")
    parser.add_argument("--heat-exchanger-quality", choices=QUALITY_TIERS,
                        help="Override quality for heat exchangers (nuclear)")
    parser.add_argument("--turbine-quality", choices=QUALITY_TIERS,
                        help="Override quality for steam turbines (nuclear)")
    parser.add_argument("--pump-quality", choices=QUALITY_TIERS,
                        help="Override quality for offshore pumps (nuclear)")
    parser.add_argument("--generator-quality", choices=QUALITY_TIERS,
                        help="Override quality for fusion generators (fusion)")
    parser.add_argument("--cryo-plant-quality", choices=QUALITY_TIERS,
                        help="Override quality for cryogenic plants (fusion)")
    parser.add_argument("--panel-quality", choices=QUALITY_TIERS,
                        help="Override quality for solar panels (solar)")
    parser.add_argument("--accumulator-quality", choices=QUALITY_TIERS,
                        help="Override quality for accumulators (solar)")
    parser.add_argument("--power", type=float, metavar="MW",
                        help="Target average power in MW for concrete counts (solar)")
    args = parser.parse_args()

    if args.mode != "solar" and (args.x is None or args.y is None):
        parser.error("-x and -y are required for nuclear and fusion modes")
    if args.power is not None and args.power < 0:
        parser.error("--power must be non-negative")

    reactor_quality = args.reactor_quality or args.quality

    if args.mode == "solar":
        panel_quality = args.panel_quality or args.quality
        accumulator_quality = args.accumulator_quality or args.quality

        rows = calculate_solar(panel_quality=panel_quality,
                               accumulator_quality=accumulator_quality,
                               target_mw=args.power)

        def fmt_ratio(ratio):
            if ratio is None:
                return "-"
            p, a, err = ratio
            return f"{p}:{a} ({err:+.2f}%)"

        print(f"Solar power ({panel_quality} panels, {accumulator_quality} accumulators):")
        count_head = (f"{'Panels':>10}  {'Accus':>10}" if args.power is not None
                      else f"{'Panels/MW':>10}  {'Accus/MW':>10}")
        print(f"  {'Surface':<21}{'Solar':>6}  {'Avg/panel':>11}  "
              f"{'Simple ratio':<18}{'Precise ratio':<18}{'Exact ratio':<13}{count_head}")
        any_flow_limited = False
        for row in rows:
            flow_mark = " *" if row["flow_limited"] else ""
            any_flow_limited = any_flow_limited or row["flow_limited"]
            exact = (f"{row['exact_ratio'][0]}:{row['exact_ratio'][1]}"
                     if row["exact_ratio"] else "-")
            if args.power is not None:
                counts = f"{row['panels']:>10}  {row['accumulators']:>10}"
            else:
                counts = (f"{float(row['panels_per_mw']):>10.2f}  "
                          f"{float(row['accumulators_per_mw']):>10.2f}")
            print(f"  {row['label']:<21}{row['solar_percent']:>5}%  "
                  f"{float(row['avg_kw_per_panel']):>8.1f} kW  "
                  f"{fmt_ratio(row['simple_ratio']):<18}{fmt_ratio(row['precise_ratio']):<18}"
                  f"{exact + flow_mark:<13}{counts}")
        if any_flow_limited:
            print("  * accumulator count set by discharge speed "
                  f"({ACCUMULATOR_FLOW_KW[accumulator_quality]} kW each), not capacity")
    elif args.mode == "fusion":
        generator_quality = args.generator_quality or args.quality
        cryo_plant_quality = args.cryo_plant_quality or args.quality

        requirements = calculate_fusion_requirements(
            args.x, args.y,
            reactor_quality=reactor_quality,
            generator_quality=generator_quality,
            cryo_plant_quality=cryo_plant_quality,
        )

        print(f"For a {args.x}x{args.y} fusion reactor setup:")
        print(f"  Fusion Reactors:   {requirements['reactors']} ({reactor_quality}, "
              f"{FUSION_REACTOR_PLASMA_OUTPUT[reactor_quality]} MW plasma each before neighbour bonus)")
        print(f"  Fusion Generators: {requirements['generators']} ({generator_quality})")
        print(f"  Cryogenic Plants:  {requirements['cryo_plants']} ({cryo_plant_quality})")
        print(f"  Fluoroketone Loop: {float(requirements['fluoroketone_per_second']):.1f}/s "
              f"(cold in = hot out, unaffected by neighbour bonus)")
        print(f"  Reactor Drain:     {requirements['reactor_drain']} MW "
              f"({FUSION_REACTOR_POWER_INPUT[reactor_quality]} MW per reactor)")
        print(f"  Fuel Cells:        {float(requirements['fuel_cells_per_minute']):.2f}/min "
              f"(one cell per reactor every {float(requirements['fuel_cell_burn_time']):.0f}s, "
              f"burned only on demand)")
        print(f"  Total Power Output: {requirements['net_power']} MW "
              f"({requirements['power']} MW plasma - {requirements['reactor_drain']} MW drain)")
    else:
        heat_exchanger_quality = args.heat_exchanger_quality or args.quality
        turbine_quality = args.turbine_quality or args.quality
        pump_quality = args.pump_quality or args.quality

        requirements = calculate_requirements(
            args.x, args.y,
            reactor_quality=reactor_quality,
            heat_exchanger_quality=heat_exchanger_quality,
            turbine_quality=turbine_quality,
            pump_quality=pump_quality,
        )

        print(f"For a {args.x}x{args.y} reactor setup:")
        print(f"  Reactors:        {requirements['reactors']} ({reactor_quality}, "
              f"{REACTOR_HEAT_OUTPUT[reactor_quality]} MW each before neighbour bonus)")
        print(f"  Heat Exchangers: {requirements['heat_exchangers']} ({heat_exchanger_quality})")
        print(f"  Steam Turbines:  {requirements['turbines']} ({turbine_quality})")
        print(f"  Offshore Pumps:  {requirements['offshore_pumps']} ({pump_quality})")
        print(f"  Steam Required:  {float(requirements['steam_per_second']):.1f}/s")
        print(f"  Water Required:  {float(requirements['water_per_second']):.1f}/s")
        print(f"  Fuel Cells:      {float(requirements['fuel_cells_per_minute']):.2f}/min "
              f"(one cell per reactor every {float(requirements['fuel_cell_burn_time']):.0f}s)")
        print(f"  Total Power Output: {requirements['power']} MW")
