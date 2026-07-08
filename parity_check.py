import json
import subprocess
import sys
from fractions import Fraction

from main import calculate_fusion_requirements, calculate_requirements, calculate_sre

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

# Irregular layouts exercise calculate_sre paths the rectangular CLI never hits.
IRREGULAR = [
    [[True, True, True, True], [True, False, False, True], [True, True, True, True]],  # ring
    [[True, False, True], [False, True, False], [True, False, True]],  # checkerboard
    [[True], [True], [True], [True], [True]],  # 1-wide column
]

node_script = """
const calc = require("./calc.js");
const { cases, fusionCases, irregular } = JSON.parse(process.argv[1]);
const fullLayout = c => Array.from({length: c.y}, () => Array(c.x).fill(true));
const results = cases.map(c => calc.calculateRequirements(fullLayout(c), c));
const fusionResults = fusionCases.map(c => calc.calculateFusionRequirements(fullLayout(c), c));
const sres = irregular.map(l => calc.calculateSRE(l));
console.log(JSON.stringify({ results, fusionResults, sres }));
"""
payload = json.dumps({"cases": node_input, "fusionCases": fusion_node_input,
                      "irregular": IRREGULAR})
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


failures = compare(CASES, js["results"], calculate_requirements, KEY_MAP, "nuclear")
failures += compare(FUSION_CASES, js["fusionResults"], calculate_fusion_requirements,
                    FUSION_KEY_MAP, "fusion")

for layout, js_sre in zip(IRREGULAR, js["sres"]):
    py_sre = calculate_sre(layout)
    if py_sre != js_sre:
        print(f"MISMATCH sre {layout}: py={py_sre} js={js_sre}")
        failures += 1

if failures:
    sys.exit(f"{failures} mismatches")
print(f"All {len(CASES)} nuclear + {len(FUSION_CASES)} fusion cases "
      f"+ {len(IRREGULAR)} irregular layouts match.")

# Sanity-check the known 2x2 numbers from the plan.
r = calculate_requirements(2, 2)
assert (r["power"], r["heat_exchangers"], r["turbines"], r["offshore_pumps"]) == (480, 48, 83, 1), r
print("2x2 spot check OK: 480 MW, 48 HX, 83 turbines, 1 pump.")

r = calculate_fusion_requirements(2, 2)
assert (r["power"], r["net_power"], r["generators"], r["cryo_plants"]) == (1200, 1160, 24, 4), r
assert (r["fluoroketone_per_second"], r["fuel_cell_burn_time"],
        r["fuel_cells_per_minute"]) == (16, 400, Fraction(3, 5)), r
print("Fusion 2x2 spot check OK: 1160 MW net, 24 generators, 4 cryo plants.")
