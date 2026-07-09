// Regression tests for the calculation core. These lock in known-good outputs
// (previously cross-checked against an exact Fraction-based Python reference)
// plus the free-form fusion layout model.
import { describe, it, expect } from "vitest";
import { calculateRequirements, calculateSRE } from "../src/core/nuclear";
import {
  FUSION_REACTOR_SIZE,
  FUSION_MAX_LINKS,
  calculateFusionRequirements,
  calculateFusionLayout,
  fusionReactorLinks,
  fusionFill,
} from "../src/core/fusion";
import type { ReactorToken } from "../src/core/fusion";
import { calculateSolar } from "../src/core/solar";

const rect = (x: number, y: number): boolean[][] =>
  Array.from({ length: y }, () => Array(x).fill(true));

const maxLinks = (reactors: ReactorToken[]) =>
  Math.max(...fusionReactorLinks(reactors).map((l) => l.links));

describe("nuclear", () => {
  it("2x2 = 480 MW, 48 HX, 83 turbines, 1 pump", () => {
    const r = calculateRequirements(rect(2, 2));
    expect(r.power).toBe(480);
    expect(r.heatExchangers).toBe(48);
    expect(r.turbines).toBe(83);
    expect(r.offshorePumps).toBe(1);
  });

  it("irregular SRE: ring layout", () => {
    const ring = [[true, true, true, true], [true, false, false, true], [true, true, true, true]];
    // 10 reactors, every one with exactly 2 edge neighbours -> 10 * (1 + 2) = 30.
    expect(calculateSRE(ring)).toBe(30);
  });
});

describe("fusion (rectangular, orthogonal edge adjacency)", () => {
  it("2x2 = 1200 MW plasma / 1160 MW net, 24 gen, 4 cryo", () => {
    const r = calculateFusionRequirements(rect(2, 2));
    expect(r.power).toBe(1200);
    expect(r.netPower).toBe(1160);
    expect(r.generators).toBe(24);
    expect(r.cryoPlants).toBe(4);
    expect(r.fluoroketonePerSecond).toBe(16);
    expect(r.fuelCellBurnTime).toBe(400);
    expect(r.fuelCellsPerMinute).toBeCloseTo(0.6, 9);
  });
});

describe("solar", () => {
  it("Nauvis: 42 kW avg, 3125:2646 exact, 13:11 simple, 98:83 precise", () => {
    const nauvis = calculateSolar()[0];
    expect(nauvis.avgKwPerPanel).toEqual([42, 1]);
    expect(nauvis.exactRatio).toEqual([3125, 2646]);
    expect([nauvis.simpleRatio!.panels, nauvis.simpleRatio!.accumulators]).toEqual([13, 11]);
    expect([nauvis.preciseRatio!.panels, nauvis.preciseRatio!.accumulators]).toEqual([98, 83]);
  });

  it("100 MW on Nauvis = 2381 panels + 2016 accumulators", () => {
    const nauvis = calculateSolar({ targetMw: 100 })[0];
    expect(nauvis.panels).toBe(2381);
    expect(nauvis.accumulators).toBe(2016);
  });

  it("legendary accumulators flow-limit Vulcanus (28:125)", () => {
    const vulcanus = calculateSolar({ accumulatorQuality: "legendary" })[1];
    expect(vulcanus.flowLimited).toBe(true);
    expect(vulcanus.accPerPanel).toEqual([28, 125]);
  });
});

describe("fusion layout editor (position-based links)", () => {
  it("editor constants: 2x2 token, +500% cap", () => {
    expect(FUSION_REACTOR_SIZE).toBe(2);
    expect(FUSION_MAX_LINKS).toBe(5);
  });

  it("single reactor: 0 links, not enclosed", () => {
    const [l] = fusionReactorLinks([{ r: 0, c: 0 }]);
    expect(l.links).toBe(0);
    expect(l.enclosed).toBe(false);
  });

  it("fusionFill: staggered offsets odd rows, bounds drop overflow tokens", () => {
    const stag = fusionFill(2, 2, true);
    expect(stag).toEqual([{ r: 0, c: 0 }, { r: 0, c: 2 }, { r: 2, c: 1 }, { r: 2, c: 3 }]);
    // A 3-wide staggered fill in a 4-cell-wide grid loses the offset row's last token.
    const bounded = fusionFill(2, 2, true, { rows: 4, cols: 4 });
    expect(bounded).toEqual([{ r: 0, c: 0 }, { r: 0, c: 2 }, { r: 2, c: 1 }]);
  });

  it("parallel 4x4: interior tops out at 4 links (+400%)", () => {
    expect(maxLinks(fusionFill(4, 4, false))).toBe(4);
  });

  it("staggered 4x4: interior reaches 6 raw links", () => {
    expect(maxLinks(fusionFill(4, 4, true))).toBe(6);
  });

  it("staggered out-produces parallel; bonus capped at +500%", () => {
    const par = calculateFusionLayout(fusionFill(4, 4, false));
    const stag = calculateFusionLayout(fusionFill(4, 4, true));
    expect(par.reactors).toBe(16);
    expect(stag.reactors).toBe(16);
    expect(par.sre).toBe(64); // 4x2 corners + 8x3 edges + 4x4 interior... = (1+2..1+4)
    expect(stag.sre).toBe(78); // interior 6 raw links -> capped 5 (+500%)
    expect(par.netPower).toBe(6240);
    expect(stag.netPower).toBe(7640);
    expect(stag.netPower).toBeGreaterThan(par.netPower);
    // No reactor's counted bonus exceeds the cap.
    expect(stag.sre).toBeLessThanOrEqual(stag.reactors * (1 + FUSION_MAX_LINKS));
  });

  it("3x3 parallel block encloses exactly the center reactor", () => {
    const r = calculateFusionLayout(fusionFill(3, 3, false));
    expect(r.enclosedCount).toBe(1);
  });
});
