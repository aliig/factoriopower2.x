import json
import subprocess
import sys

from main import calculate_requirements, calculate_sre

CASES = [
    dict(x=2, y=2),
    dict(x=1, y=1),
    dict(x=4, y=4),
    dict(x=2, y=2, reactor_quality="legendary", heat_exchanger_quality="legendary",
         turbine_quality="legendary", pump_quality="legendary"),
    dict(x=3, y=7, reactor_quality="legendary", turbine_quality="rare"),
    dict(x=20, y=20, heat_exchanger_quality="epic", pump_quality="uncommon"),
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

# Irregular layouts exercise calculate_sre paths the rectangular CLI never hits.
IRREGULAR = [
    [[True, True, True, True], [True, False, False, True], [True, True, True, True]],  # ring
    [[True, False, True], [False, True, False], [True, False, True]],  # checkerboard
    [[True], [True], [True], [True], [True]],  # 1-wide column
]

node_script = """
const calc = require("./calc.js");
const { cases, irregular } = JSON.parse(process.argv[1]);
const results = cases.map(c => {
  const layout = Array.from({length: c.y}, () => Array(c.x).fill(true));
  return calc.calculateRequirements(layout, c);
});
const sres = irregular.map(l => calc.calculateSRE(l));
console.log(JSON.stringify({ results, sres }));
"""
payload = json.dumps({"cases": node_input, "irregular": IRREGULAR})
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

failures = 0
for case, js_result in zip(CASES, js["results"]):
    py = calculate_requirements(**case)
    for py_key, js_key in KEY_MAP.items():
        py_val, js_val = py[py_key], js_result[js_key]
        if abs(float(py_val) - js_val) > 1e-9 * max(1, abs(float(py_val))):
            print(f"MISMATCH {case} {py_key}: py={float(py_val)} js={js_val}")
            failures += 1

for layout, js_sre in zip(IRREGULAR, js["sres"]):
    py_sre = calculate_sre(layout)
    if py_sre != js_sre:
        print(f"MISMATCH sre {layout}: py={py_sre} js={js_sre}")
        failures += 1

if failures:
    sys.exit(f"{failures} mismatches")
print(f"All {len(CASES)} cases + {len(IRREGULAR)} irregular layouts match.")

# Sanity-check the known 2x2 numbers from the plan.
r = calculate_requirements(2, 2)
assert (r["power"], r["heat_exchangers"], r["turbines"], r["offshore_pumps"]) == (480, 48, 83, 1), r
print("2x2 spot check OK: 480 MW, 48 HX, 83 turbines, 1 pump.")
