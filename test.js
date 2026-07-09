// Regression tests for calc.js. Run with `node test.js` (or `npm test`).
// These lock in known-good outputs (previously cross-checked against an exact
// Fraction-based Python reference) plus the free-form fusion layout model.
const assert = require("assert");
const calc = require("./calc.js");

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok   - " + name); }
  catch (e) { failed += 1; console.error("FAIL - " + name + "\n       " + e.message); }
}
const rect = (x, y) => Array.from({ length: y }, () => Array(x).fill(true));
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

// A rows x cols field of 2x2 reactor tokens; stagger offsets odd rows by 1 cell.
function block(cols, rows, stagger) {
  const S = calc.FUSION_REACTOR_SIZE, rs = [];
  for (let i = 0; i < rows; i++) {
    const off = stagger && i % 2 ? 1 : 0;
    for (let j = 0; j < cols; j++) rs.push({ r: i * S, c: j * S + off });
  }
  return rs;
}
const maxLinks = (reactors) => Math.max(...calc.fusionReactorLinks(reactors).map((l) => l.links));

// --- Nuclear ---------------------------------------------------------------
check("nuclear 2x2 = 480 MW, 48 HX, 83 turbines, 1 pump", () => {
  const r = calc.calculateRequirements(rect(2, 2));
  assert.equal(r.power, 480);
  assert.equal(r.heatExchangers, 48);
  assert.equal(r.turbines, 83);
  assert.equal(r.offshorePumps, 1);
});
check("nuclear irregular SRE: ring layout", () => {
  const ring = [[true, true, true, true], [true, false, false, true], [true, true, true, true]];
  // 10 reactors, every one with exactly 2 edge neighbours -> 10 * (1 + 2) = 30.
  assert.equal(calc.calculateSRE(ring), 30);
});

// --- Fusion (rectangular, orthogonal edge adjacency) -----------------------
check("fusion 2x2 = 1200 MW plasma / 1160 MW net, 24 gen, 4 cryo", () => {
  const r = calc.calculateFusionRequirements(rect(2, 2));
  assert.equal(r.power, 1200);
  assert.equal(r.netPower, 1160);
  assert.equal(r.generators, 24);
  assert.equal(r.cryoPlants, 4);
  assert.equal(r.fluoroketonePerSecond, 16);
  assert.equal(r.fuelCellBurnTime, 400);
  assert.ok(approx(r.fuelCellsPerMinute, 0.6));
});

// --- Solar -----------------------------------------------------------------
check("solar Nauvis: 42 kW avg, 3125:2646 exact, 13:11 simple, 98:83 precise", () => {
  const nauvis = calc.calculateSolar()[0];
  assert.deepEqual(nauvis.avgKwPerPanel, [42, 1]);
  assert.deepEqual(nauvis.exactRatio, [3125, 2646]);
  assert.deepEqual([nauvis.simpleRatio.panels, nauvis.simpleRatio.accumulators], [13, 11]);
  assert.deepEqual([nauvis.preciseRatio.panels, nauvis.preciseRatio.accumulators], [98, 83]);
});
check("solar 100 MW on Nauvis = 2381 panels + 2016 accumulators", () => {
  const nauvis = calc.calculateSolar({ targetMw: 100 })[0];
  assert.equal(nauvis.panels, 2381);
  assert.equal(nauvis.accumulators, 2016);
});
check("solar legendary accumulators flow-limit Vulcanus (28:125)", () => {
  const vulcanus = calc.calculateSolar({ accumulatorQuality: "legendary" })[1];
  assert.equal(vulcanus.flowLimited, true);
  assert.deepEqual(vulcanus.accPerPanel, [28, 125]);
});

// --- Fusion layout editor (position-based links) ---------------------------
check("editor constants: 2x2 token, +500% cap", () => {
  assert.equal(calc.FUSION_REACTOR_SIZE, 2);
  assert.equal(calc.FUSION_MAX_LINKS, 5);
});
check("single reactor: 0 links, not enclosed", () => {
  const [l] = calc.fusionReactorLinks([{ r: 0, c: 0 }]);
  assert.equal(l.links, 0);
  assert.equal(l.enclosed, false);
});
check("parallel 4x4: interior tops out at 4 links (+400%)", () => {
  assert.equal(maxLinks(block(4, 4, false)), 4);
});
check("staggered 4x4: interior reaches 6 raw links", () => {
  assert.equal(maxLinks(block(4, 4, true)), 6);
});
check("staggered out-produces parallel; bonus capped at +500%", () => {
  const par = calc.calculateFusionLayout(block(4, 4, false));
  const stag = calc.calculateFusionLayout(block(4, 4, true));
  assert.equal(par.reactors, 16);
  assert.equal(stag.reactors, 16);
  assert.equal(par.sre, 64); // 4x2 corners + 8x3 edges + 4x4 interior... = (1+2..1+4)
  assert.equal(stag.sre, 78); // interior 6 raw links -> capped 5 (+500%)
  assert.equal(par.netPower, 6240);
  assert.equal(stag.netPower, 7640);
  assert.ok(stag.netPower > par.netPower);
  // No reactor's counted bonus exceeds the cap.
  assert.ok(stag.sre <= stag.reactors * (1 + calc.FUSION_MAX_LINKS));
});
check("3x3 parallel block encloses exactly the center reactor", () => {
  const r = calc.calculateFusionLayout(block(3, 3, false));
  assert.equal(r.enclosedCount, 1);
});

console.log(failed ? `\n${failed} test(s) FAILED` : "\nAll tests passed.");
process.exit(failed ? 1 : 0);
