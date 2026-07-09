// Fusion tab: free-form layout editor placing 2x2 reactor tokens on a fine
// cell grid, plus the machine-count results table.
import type { ReactorToken } from "../core/fusion";
import {
  FUSION_MAX_LINKS,
  FUSION_REACTOR_PLASMA_OUTPUT,
  FUSION_REACTOR_SIZE,
  calculateFusionLayout,
  fusionFill,
  fusionReactorLinks,
} from "../core/fusion";
import type { AppState, Store } from "../state/store";
import { FUSION_GRID } from "../state/store";
import { bindNumberInput, clampInt, emptyHint, formatPower, powerLine, resultsTable, setWarning } from "./components";

const FZ_CELL = 22; // fine-grid cell size in px; single source of truth for the CSS too
const FZ_W = FUSION_GRID.cols;
const FZ_H = FUSION_GRID.rows;
const FZ_S = FUSION_REACTOR_SIZE;
const MAX_COLS = 12;
const MAX_ROWS = 9;

const gridEl = document.getElementById("fusion-grid") as HTMLDivElement;
const warningEl = document.getElementById("fz-warning") as HTMLParagraphElement;
const liveEl = document.getElementById("fz-live") as HTMLParagraphElement;
const resultsEl = document.getElementById("results") as HTMLDivElement;

// Keyboard cursor: the anchor cell of the 2x2 token a key press would place
// or remove. Only visible while the grid has focus (CSS).
const cursor = { r: 0, c: 0 };
const cursorEl = document.createElement("div");
cursorEl.className = "fz-cursor";
cursorEl.setAttribute("aria-hidden", "true");

function positionCursor(): void {
  cursorEl.style.setProperty("--r", String(cursor.r));
  cursorEl.style.setProperty("--c", String(cursor.c));
}

export function initFusionView(store: Store): void {
  gridEl.style.setProperty("--fz-cell", FZ_CELL + "px");
  gridEl.style.setProperty("--fz-cols", String(FZ_W));
  gridEl.style.setProperty("--fz-rows", String(FZ_H));

  const reactorAt = (r: number, c: number) =>
    store.get().fusion.reactors.findIndex((rr) =>
      r >= rr.r && r < rr.r + FZ_S && c >= rr.c && c < rr.c + FZ_S);
  const overlaps = (r: number, c: number) =>
    store.get().fusion.reactors.some((rr) =>
      r < rr.r + FZ_S && r + FZ_S > rr.r && c < rr.c + FZ_S && c + FZ_S > rr.c);
  const setReactors = (reactors: ReactorToken[]) => store.set({ fusion: { reactors } });

  let drag: "place" | "erase" | null = null;

  const cellFromEvent = (e: PointerEvent) => {
    const rect = gridEl.getBoundingClientRect();
    return {
      r: Math.floor((e.clientY - rect.top) / FZ_CELL),
      c: Math.floor((e.clientX - rect.left) / FZ_CELL),
    };
  };

  const apply = (r: number, c: number) => {
    if (r < 0 || c < 0 || r >= FZ_H || c >= FZ_W) return;
    const reactors = store.get().fusion.reactors;
    if (drag === "erase") {
      const i = reactorAt(r, c);
      if (i >= 0) setReactors(reactors.filter((_, idx) => idx !== i));
      return;
    }
    // Place a token anchored at (r, c), clamped so its 2x2 stays in bounds.
    const ar = Math.min(r, FZ_H - FZ_S);
    const ac = Math.min(c, FZ_W - FZ_S);
    if (reactorAt(r, c) < 0 && !overlaps(ar, ac)) {
      setReactors([...reactors, { r: ar, c: ac }]);
    }
  };

  gridEl.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const { r, c } = cellFromEvent(e);
    if (r < 0 || c < 0 || r >= FZ_H || c >= FZ_W) return;
    drag = reactorAt(r, c) >= 0 ? "erase" : "place";
    gridEl.setPointerCapture(e.pointerId);
    apply(r, c);
  });
  gridEl.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const { r, c } = cellFromEvent(e);
    apply(r, c);
  });
  const endDrag = () => { drag = null; };
  gridEl.addEventListener("pointerup", endDrag);
  gridEl.addEventListener("pointercancel", endDrag);

  // Keyboard path: arrows move the cursor, Enter/Space places or removes.
  const announce = (message: string) => { liveEl.textContent = message; };
  positionCursor();
  gridEl.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") cursor.r = Math.max(0, cursor.r - 1);
    else if (e.key === "ArrowDown") cursor.r = Math.min(FZ_H - FZ_S, cursor.r + 1);
    else if (e.key === "ArrowLeft") cursor.c = Math.max(0, cursor.c - 1);
    else if (e.key === "ArrowRight") cursor.c = Math.min(FZ_W - FZ_S, cursor.c + 1);
    else if (e.key === "Enter" || e.key === " ") {
      const reactors = store.get().fusion.reactors;
      const i = reactorAt(cursor.r, cursor.c);
      if (i >= 0) {
        setReactors(reactors.filter((_, idx) => idx !== i));
        announce(`Removed reactor at row ${cursor.r + 1}, column ${cursor.c + 1}.`);
      } else if (!overlaps(cursor.r, cursor.c)) {
        setReactors([...reactors, { r: cursor.r, c: cursor.c }]);
        announce(`Placed reactor at row ${cursor.r + 1}, column ${cursor.c + 1}.`);
      } else {
        announce("Space occupied — move the cursor to an empty 2 by 2 area.");
      }
    } else return;
    e.preventDefault();
    positionCursor();
  });

  const dims = () => ({
    cols: clampInt((document.getElementById("fz-cols") as HTMLInputElement).value, 1, MAX_COLS),
    rows: clampInt((document.getElementById("fz-rows") as HTMLInputElement).value, 1, MAX_ROWS),
  });
  // Clamp the fill-dimension fields on input like the other number fields.
  bindNumberInput(document.getElementById("fz-cols") as HTMLInputElement, 1, MAX_COLS, () => {});
  bindNumberInput(document.getElementById("fz-rows") as HTMLInputElement, 1, MAX_ROWS, () => {});

  const fill = (staggered: boolean) => {
    const { cols, rows } = dims();
    setReactors(fusionFill(cols, rows, staggered, { rows: FZ_H, cols: FZ_W }));
  };
  document.getElementById("fz-parallel")!.addEventListener("click", () => fill(false));
  document.getElementById("fz-staggered")!.addEventListener("click", () => fill(true));
  document.getElementById("fz-clear")!.addEventListener("click", () => setReactors([]));
}

function renderEditor(state: AppState): void {
  const links = fusionReactorLinks(state.fusion.reactors);
  gridEl.replaceChildren();
  let enclosed = 0;
  for (const l of links) {
    const d = document.createElement("div");
    d.className = "reactor" + (l.enclosed ? " enclosed" : "");
    d.style.setProperty("--r", String(l.r));
    d.style.setProperty("--c", String(l.c));
    d.textContent = "×" + (1 + Math.min(l.links, FUSION_MAX_LINKS));
    if (l.enclosed) enclosed += 1;
    gridEl.appendChild(d);
  }
  gridEl.appendChild(cursorEl); // replaceChildren wiped it; keep the keyboard cursor alive
  setWarning(warningEl, enclosed,
    "boxed in on every side — an inserter can't reach them to load fusion power cells.");
}

function renderResults(state: AppState): void {
  const { reactors } = state.fusion;
  if (reactors.length === 0) {
    resultsEl.innerHTML = emptyHint("No reactors placed — click in the layout editor to add some.");
    return;
  }
  const req = calculateFusionLayout(reactors, {
    reactorQuality: state.quality.fusionReactor,
    generatorQuality: state.quality.fusionGenerator,
    cryoPlantQuality: state.quality.cryoPlant,
  });

  const perReactor = FUSION_REACTOR_PLASMA_OUTPUT[state.quality.fusionReactor];
  const avgBonus = req.reactors ? (req.sre / req.reactors - 1) * 100 : 0;
  resultsEl.innerHTML =
    powerLine(formatPower(req.netPower),
      `net output (${formatPower(req.power)} plasma − ${req.reactorDrain} MW reactor drain)`) +
    resultsTable([
      { label: "Fusion reactors", value: req.reactors,
        note: `${perReactor} MW plasma each before neighbour bonus` },
      { label: "Avg neighbour bonus", value: `+${avgBonus.toFixed(0)}%`,
        note: `per reactor across this layout — max +${FUSION_MAX_LINKS * 100}%` },
      { label: "Fusion generators", value: req.generators },
      { label: "Cryogenic plants", value: req.cryoPlants, note: "cooling the fluoroketone loop" },
      { label: "Fluoroketone loop", value: req.fluoroketonePerSecond.toFixed(1),
        note: "per second — cold in = hot out, unaffected by neighbour bonus" },
      { label: "Reactor grid drain", value: req.reactorDrain,
        note: "MW drawn by the reactors while running" },
      { label: "Fusion power cells", value: req.fuelCellsPerMinute.toFixed(2),
        note: `per minute — one 40 GJ cell per reactor every ${req.fuelCellBurnTime.toFixed(0)} s, burned only on demand` },
    ]);
}

export function renderFusionView(state: AppState): void {
  renderEditor(state);
  renderResults(state);
}
