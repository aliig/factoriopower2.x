// URL hash codec: the whole app state round-trips through the fragment so
// any configuration is shareable. Grammar: #<mode>?<params>, every param
// omitted when equal to its default — pristine URLs stay exactly "",
// "#fusion", or "#solar", preserving the legacy deep links.
//
//   q  — 9 chars, one per quality component in QUALITY_COMPONENTS order,
//        each n|u|r|e|l (unknown chars fall back to normal)
//   g  — <w>x<h>[:<hex>] nuclear grid; hex is the visible w×h region's bits
//        row-major MSB-first, omitted when every visible cell is on
//   f  — fusion tokens, two base36 chars (row, col anchor) per reactor
//   mw — solar target average power in MW, decimal
import type { QualityTier } from "../core/quality";
import type { ReactorToken } from "../core/fusion";
import { FUSION_REACTOR_SIZE } from "../core/fusion";
import type { AppState, Mode } from "./store";
import { FUSION_GRID, MAX_DIM, QUALITY_COMPONENTS, defaultState } from "./store";

const TIER_BY_CODE: Record<string, QualityTier> = {
  n: "normal", u: "uncommon", r: "rare", e: "epic", l: "legendary",
};

const MAX_TARGET_MW = 1e6;

function gridToHex(backing: boolean[][], width: number, height: number): string {
  const nibbles: number[] = [];
  for (let k = 0; k < width * height; k++) {
    const on = backing[Math.floor(k / width)][k % width];
    if (k % 4 === 0) nibbles.push(0);
    if (on) nibbles[nibbles.length - 1] |= 1 << (3 - (k % 4));
  }
  return nibbles.map((n) => n.toString(16)).join("");
}

function applyHexToGrid(backing: boolean[][], width: number, height: number, hex: string): void {
  for (let k = 0; k < width * height; k++) {
    const nibble = parseInt(hex[k >> 2] ?? "0", 16) || 0;
    backing[Math.floor(k / width)][k % width] = (nibble & (1 << (3 - (k % 4)))) !== 0;
  }
}

function tokensToB36(reactors: ReactorToken[]): string {
  return reactors.map((t) => t.r.toString(36) + t.c.toString(36)).join("");
}

function parseTokens(encoded: string): ReactorToken[] {
  const S = FUSION_REACTOR_SIZE;
  const tokens: ReactorToken[] = [];
  const overlaps = (r: number, c: number) => tokens.some((t) =>
    r < t.r + S && r + S > t.r && c < t.c + S && c + S > t.c);
  for (let i = 0; i + 1 < encoded.length; i += 2) {
    const r = parseInt(encoded[i], 36);
    const c = parseInt(encoded[i + 1], 36);
    // Hand-mangled URLs degrade gracefully: out-of-bounds and overlapping
    // tokens are dropped rather than rejected wholesale.
    if (Number.isNaN(r) || Number.isNaN(c)) continue;
    if (r < 0 || c < 0 || r + S > FUSION_GRID.rows || c + S > FUSION_GRID.cols) continue;
    if (overlaps(r, c)) continue;
    tokens.push({ r, c });
  }
  return tokens;
}

function sameTokens(a: ReactorToken[], b: ReactorToken[]): boolean {
  if (a.length !== b.length) return false;
  const key = (t: ReactorToken) => t.r + "," + t.c;
  const setB = new Set(b.map(key));
  return a.every((t) => setB.has(key(t)));
}

export function serializeHash(state: AppState): string {
  const defaults = defaultState();
  const parts: string[] = [];

  const q = QUALITY_COMPONENTS.map((c) => state.quality[c][0]).join("");
  if (QUALITY_COMPONENTS.some((c) => state.quality[c] !== "normal")) parts.push("q=" + q);

  const { width, height, backing } = state.nuclear;
  let allOn = true;
  for (let i = 0; i < height && allOn; i++) {
    for (let j = 0; j < width; j++) {
      if (!backing[i][j]) { allOn = false; break; }
    }
  }
  if (!(allOn && width === defaults.nuclear.width && height === defaults.nuclear.height)) {
    parts.push("g=" + width + "x" + height + (allOn ? "" : ":" + gridToHex(backing, width, height)));
  }

  if (!sameTokens(state.fusion.reactors, defaults.fusion.reactors)) {
    parts.push("f=" + tokensToB36(state.fusion.reactors));
  }

  if (state.solar.targetMw !== null) parts.push("mw=" + state.solar.targetMw);

  const query = parts.join("&");
  if (state.mode === "nuclear" && !query) return "";
  return "#" + state.mode + (query ? "?" + query : "");
}

export function parseHash(hash: string): AppState {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const qIdx = raw.indexOf("?");
  const segment = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const mode: Mode = segment === "fusion" ? "fusion" : segment === "solar" ? "solar" : "nuclear";
  const state = defaultState(mode);
  // URLSearchParams also tolerates percent-encoded values; unknown params
  // are ignored for forward compatibility.
  const params = new URLSearchParams(qIdx >= 0 ? raw.slice(qIdx + 1) : "");

  const q = params.get("q");
  if (q) {
    QUALITY_COMPONENTS.forEach((component, i) => {
      state.quality[component] = TIER_BY_CODE[q[i]] ?? "normal";
    });
  }

  const g = params.get("g");
  const gMatch = g?.match(/^(\d+)x(\d+)(?::([0-9a-fA-F]*))?$/);
  if (gMatch) {
    const width = Math.min(MAX_DIM, Math.max(1, Number(gMatch[1])));
    const height = Math.min(MAX_DIM, Math.max(1, Number(gMatch[2])));
    state.nuclear = { ...state.nuclear, width, height };
    if (gMatch[3] !== undefined) {
      applyHexToGrid(state.nuclear.backing, width, height, gMatch[3]);
    }
  }

  const f = params.get("f");
  if (f !== null) state.fusion.reactors = parseTokens(f);

  const mw = params.get("mw");
  if (mw !== null) {
    const value = Number(mw);
    state.solar.targetMw = Number.isFinite(value) && value > 0 ? Math.min(value, MAX_TARGET_MW) : null;
  }

  return state;
}
