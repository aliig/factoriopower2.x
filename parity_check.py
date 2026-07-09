import json
import subprocess
import sys
from fractions import Fraction

from main import (SOLAR_ACC_DEFICIT_FACTOR, SOLAR_AVG_OUTPUT_FACTOR,
                  calculate_fusion_requirements, calculate_requirements,
                  calculate_solar, calculate_sre)

CASES = [
    dict(x=2, y=2),
    dict(x=1, y=1),
    dict(x=4, y=4),
    dict(x=2, y=2, reactor_quality="legendary", heat_exchanger_quality="legendary",
         turbine_quality="legendary", pump_quality="legendary"),
    dict(x=3, y=7, reactor_quality="legendary", turbine_quality="rare"),
    dict(x=20, y=20, heat_exchanger_quality="epic", pump_quality="uncommon"),
]

FUSION_CASES = [
    dict(x=2, y=2),
    dict(x=1, y=1),
    dict(x=2, y=2, reactor_quality="legendary", generator_quality="legendary",
         cryo_plant_quality="legendary"),
    # Non-exact generator ceil: 1200 / 65 -> 19.
    dict(x=2, y=2, generator_quality="uncommon"),
    # Non-exact cryo ceil on a fractional rate: 16 / 5.2 -> 4. Catches any
    # truncation of the .2 in either implementation.
    dict(x=2, y=2, cryo_plant_quality="uncommon"),
    dict(x=3, y=7, reactor_quality="legendary", generator_quality="rare",
         cryo_plant_quality="epic"),
    dict(x=20, y=20, reactor_quality="epic"),
]

node_input = []
for case in CASES:
    node_input.append({
        "x": case["x"], "y": case["y"],
        "reactorQuality": case.get("reactor_quality", "normal"),
        "heatExchangerQuality": case.get("heat_exchanger_quality", "normal"),
        "turbineQuality": case.get("turbine_quality", "normal"),
        "pumpQuality": case.get("pump_quality", "normal"),
    })

fusion_node_input = []
for case in FUSION_CASES:
    fusion_node_input.append({
        "x": case["x"], "y": case["y"],
        "reactorQuality": case.get("reactor_quality", "normal"),
        "generatorQuality": case.get("generator_quality", "normal"),
        "cryoPlantQuality": case.get("cryo_plant_quality", "normal"),
    })

SOLAR_CASES = [
    dict(),
    dict(panel_quality="legendary"),
    # Legendary accumulators (30 MJ, 750 kW) make the discharge flow limit
    # the binding constraint on Vulcanus (90 s cycle).
    dict(accumulator_quality="legendary"),
    dict(panel_quality="uncommon", accumulator_quality="rare"),
    dict(target_mw=100),
    dict(panel_quality="epic", accumulator_quality="uncommon", target_mw=2.5),
]

solar_node_input = [{
    "panelQuality": case.get("panel_quality", "normal"),
    "accumulatorQuality": case.get("accumulator_quality", "normal"),
    "targetMw": case.get("target_mw"),
} for case in SOLAR_CASES]

# Irregular layouts exercise calculate_sre paths the rectangular CLI never hits.
IRREGULAR = [
    [[True, True, True, True], [True, False, False, True], [True, True, True, True]],  # ring
    [[True, False, True], [False, True, False], [True, False, True]],  # checkerboard
    [[True], [True], [True], [True], [True]],  # 1-wide column
]

node_script = """
const calc = require("./calc.js");
const { cases, fusionCases, solarCases, irregular } = JSON.parse(process.argv[1]);
const fullLayout = c => Array.from({length: c.y}, () => Array(c.x).fill(true));
const results = cases.map(c => calc.calculateRequirements(fullLayout(c), c));
const fusionResults = fusionCases.map(c => calc.calculateFusionRequirements(fullLayout(c), c));
const solarResults = solarCases.map(c => calc.calculateSolar(c));
const sres = irregular.map(l => calc.calculateSRE(l));
console.log(JSON.stringify({ results, fusionResults, solarResults, sres }));
"""
payload = json.dumps({"cases": node_input, "fusionCases": fusion_node_input,
                      "solarCases": solar_node_input, "irregular": IRREGULAR})
out = subprocess.run(["node", "-e", node_script, payload],
                     capture_output=True, text=True, check=True)
js = json.loads(out.stdout)

KEY_MAP = {
    "reactors": "reactors", "offshore_pumps": "offshorePumps",
    "heat_exchangers": "heatExchangers", "turbines": "turbines",
    "power": "power", "steam_per_second": "steamPerSecond",
    "water_per_second": "waterPerSecond",
    "fuel_cells_per_minute": "fuelCellsPerMinute",
    "fuel_cell_burn_time": "fuelCellBurnTime",
}

FUSION_KEY_MAP = {
    "reactors": "reactors", "generators": "generators",
    "cryo_plants": "cryoPlants", "power": "power",
    "reactor_drain": "reactorDrain", "net_power": "netPower",
    "fluoroketone_per_second": "fluoroketonePerSecond",
    "fuel_cells_per_minute": "fuelCellsPerMinute",
    "fuel_cell_burn_time": "fuelCellBurnTime",
}


def compare(cases, js_results, py_func, key_map, label):
    failures = 0
    for case, js_result in zip(cases, js_results):
        py = py_func(**case)
        for py_key, js_key in key_map.items():
            py_val, js_val = py[py_key], js_result[js_key]
            if abs(float(py_val) - js_val) > 1e-9 * max(1, abs(float(py_val))):
                print(f"MISMATCH {label} {case} {py_key}: py={float(py_val)} js={js_val}")
                failures += 1
    return failures


def as_pair(fraction):
    return (fraction.numerator, fraction.denominator)


def compare_solar(cases, js_results):
    # Exact fields are compared as reduced integer pairs (stricter than the
    # float compare above); ratios, counts, and flags as exact values.
    failures = 0

    def check(case, label, field, py_val, js_val):
        nonlocal failures
        if py_val != js_val:
            print(f"MISMATCH solar {case} {label} {field}: py={py_val} js={js_val}")
            failures += 1

    def ratio_tuple(js_ratio):
        return (js_ratio["panels"], js_ratio["accumulators"]) if js_ratio else None

    for case, js_rows in zip(cases, js_results):
        for py, js_row in zip(calculate_solar(**case), js_rows):
            label = py["label"]
            for field, js_key in [("avg_kw_per_panel", "avgKwPerPanel"),
                                  ("acc_per_panel", "accPerPanel"),
                                  ("panels_per_mw", "panelsPerMw"),
                                  ("accumulators_per_mw", "accumulatorsPerMw")]:
                check(case, label, field, as_pair(py[field]), tuple(js_row[js_key]))
            check(case, label, "exact_ratio",
                  py["exact_ratio"], tuple(js_row["exactRatio"]) if js_row["exactRatio"] else None)
            check(case, label, "flow_limited", py["flow_limited"], js_row["flowLimited"])
            check(case, label, "panels", py["panels"], js_row["panels"])
            check(case, label, "accumulators", py["accumulators"], js_row["accumulators"])
            for field, js_key in [("simple_ratio", "simpleRatio"),
                                  ("precise_ratio", "preciseRatio")]:
                py_ratio, js_ratio = py[field], js_row[js_key]
                check(case, label, field,
                      py_ratio[:2] if py_ratio else None, ratio_tuple(js_ratio))
                if py_ratio and js_ratio and abs(py_ratio[2] - js_ratio["errorPct"]) > 1e-12:
                    print(f"MISMATCH solar {case} {label} {field} error: "
                          f"py={py_ratio[2]} js={js_ratio['errorPct']}")
                    failures += 1
    return failures


failures = compare(CASES, js["results"], calculate_requirements, KEY_MAP, "nuclear")
failures += compare(FUSION_CASES, js["fusionResults"], calculate_fusion_requirements,
                    FUSION_KEY_MAP, "fusion")
failures += compare_solar(SOLAR_CASES, js["solarResults"])

for layout, js_sre in zip(IRREGULAR, js["sres"]):
    py_sre = calculate_sre(layout)
    if py_sre != js_sre:
        print(f"MISMATCH sre {layout}: py={py_sre} js={js_sre}")
        failures += 1

if failures:
    sys.exit(f"{failures} mismatches")
print(f"All {len(CASES)} nuclear + {len(FUSION_CASES)} fusion + {len(SOLAR_CASES)} solar "
      f"cases + {len(IRREGULAR)} irregular layouts match.")

# Sanity-check the known 2x2 numbers from the plan.
r = calculate_requirements(2, 2)
assert (r["power"], r["heat_exchangers"], r["turbines"], r["offshore_pumps"]) == (480, 48, 83, 1), r
print("2x2 spot check OK: 480 MW, 48 HX, 83 turbines, 1 pump.")

r = calculate_fusion_requirements(2, 2)
assert (r["power"], r["net_power"], r["generators"], r["cryo_plants"]) == (1200, 1160, 24, 4), r
assert (r["fluoroketone_per_second"], r["fuel_cell_burn_time"],
        r["fuel_cells_per_minute"]) == (16, 400, Fraction(3, 5)), r
print("Fusion 2x2 spot check OK: 1160 MW net, 24 generators, 4 cryo plants.")

# Solar spot checks, hand-derived in the plan and cross-checked against the
# wiki's exact post-2.0 ratios (e.g. Nauvis 2646:3125, not the 1.1-era 21:25).
assert SOLAR_AVG_OUTPUT_FACTOR == Fraction(7, 10) and SOLAR_ACC_DEFICIT_FACTOR == Fraction(21, 125)
nauvis, vulcanus = calculate_solar()[0], calculate_solar()[1]
assert nauvis["acc_per_panel"] == Fraction(2646, 3125) and nauvis["avg_kw_per_panel"] == 42, nauvis
assert nauvis["exact_ratio"] == (3125, 2646), nauvis
assert nauvis["simple_ratio"][:2] == (13, 11) and nauvis["precise_ratio"][:2] == (98, 83), nauvis
assert vulcanus["acc_per_panel"] == Fraction(2268, 3125), vulcanus
leg_panels = calculate_solar(panel_quality="legendary")[0]
assert leg_panels["acc_per_panel"] == Fraction(1323, 625) and leg_panels["avg_kw_per_panel"] == 105
leg_acc = calculate_solar(accumulator_quality="legendary")
assert leg_acc[1]["acc_per_panel"] == Fraction(28, 125), leg_acc[1]
assert leg_acc[1]["flow_limited"] is True, leg_acc[1]
# Aquilo's exact ratio (1 accumulator per ~248 panels) can't be represented
# under the friendly caps within 1%, so the search relaxes the larger term
# rather than showing a distorted 99:1.
assert leg_acc[4]["simple_ratio"][:2] == (248, 1), leg_acc[4]
target = calculate_solar(target_mw=100)[0]
assert (target["panels"], target["accumulators"]) == (2381, 2016), target
space = calculate_solar()[5]
assert (space["avg_kw_per_panel"], space["acc_per_panel"]) == (180, 0), space
assert space["simple_ratio"] is None and space["flow_limited"] is False, space
print("Solar spot checks OK: Nauvis 2646:3125 (13:11 simple), 100 MW = 2381 panels + 2016 accus,"
      " Vulcanus flow-limited with legendary accumulators.")
