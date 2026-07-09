// The URL hash codec is pure logic, so it gets its own regression coverage:
// defaults stay pristine, legacy deep links keep working, and any state
// round-trips losslessly.
import { describe, it, expect } from "vitest";
import { defaultState } from "../src/state/store";
import { parseHash, serializeHash } from "../src/state/url";

describe("url hash codec", () => {
  it("default state serializes to pristine hashes", () => {
    expect(serializeHash(defaultState())).toBe("");
    expect(serializeHash(defaultState("fusion"))).toBe("#fusion");
    expect(serializeHash(defaultState("solar"))).toBe("#solar");
  });

  it("legacy deep links parse to default state in that mode", () => {
    expect(parseHash("#fusion")).toEqual(defaultState("fusion"));
    expect(parseHash("#solar")).toEqual(defaultState("solar"));
    expect(parseHash("")).toEqual(defaultState());
    expect(parseHash("#garbage")).toEqual(defaultState());
  });

  it("quality round-trips and unknown codes fall back to normal", () => {
    const state = defaultState();
    state.quality.reactor = "legendary";
    state.quality.accumulator = "rare";
    const hash = serializeHash(state);
    expect(hash).toBe("#nuclear?q=lnnnnnnnr");
    expect(parseHash(hash)).toEqual(state);
    expect(parseHash("#nuclear?q=zzzzzzzzz")).toEqual(defaultState());
  });

  it("nuclear grid round-trips, including partial layouts", () => {
    const state = defaultState();
    state.nuclear.width = 4;
    state.nuclear.height = 3;
    expect(serializeHash(state)).toBe("#nuclear?g=4x3");
    expect(parseHash("#nuclear?g=4x3")).toEqual(state);

    state.nuclear.backing[1][1] = false;
    state.nuclear.backing[1][2] = false;
    const hash = serializeHash(state);
    expect(parseHash(hash)).toEqual(state);
    expect(parseHash(hash).nuclear.backing[1][1]).toBe(false);
    expect(parseHash(hash).nuclear.backing[0][3]).toBe(true);
  });

  it("nuclear dimensions clamp to the backing grid", () => {
    expect(parseHash("#nuclear?g=99x0").nuclear).toMatchObject({ width: 20, height: 1 });
  });

  it("fusion tokens round-trip; empty layout is not the default", () => {
    const state = defaultState("fusion");
    state.fusion.reactors = [{ r: 0, c: 0 }, { r: 2, c: 1 }, { r: 16, c: 24 }];
    const hash = serializeHash(state);
    expect(parseHash(hash)).toEqual(state);

    state.fusion.reactors = [];
    expect(parseHash(serializeHash(state)).fusion.reactors).toEqual([]);
  });

  it("fusion parser drops out-of-bounds and overlapping tokens", () => {
    // "hz" = r 17 (footprint leaves the 18-row grid), then two overlapping at 0,0.
    expect(parseHash("#fusion?f=hz00001").fusion.reactors).toEqual([{ r: 0, c: 0 }]);
  });

  it("solar target round-trips and clamps", () => {
    const state = defaultState("solar");
    state.solar.targetMw = 2.5;
    const hash = serializeHash(state);
    expect(hash).toBe("#solar?mw=2.5");
    expect(parseHash(hash)).toEqual(state);
    expect(parseHash("#solar?mw=9999999").solar.targetMw).toBe(1e6);
    expect(parseHash("#solar?mw=-3").solar.targetMw).toBe(null);
  });

  it("full mixed state round-trips regardless of active mode", () => {
    const state = defaultState("solar");
    state.quality.fusionReactor = "epic";
    state.nuclear.width = 5;
    state.fusion.reactors = [{ r: 3, c: 3 }];
    state.solar.targetMw = 100;
    expect(parseHash(serializeHash(state))).toEqual(state);
  });
});
