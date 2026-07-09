// Nuclear tab: clickable reactor grid on a MAX_DIM x MAX_DIM backing array
// plus the machine-count results table.
import type { Layout } from "../core/nuclear";
import { REACTOR_HEAT_OUTPUT, getNeighbourCount, calculateRequirements } from "../core/nuclear";
import type { AppState, Store } from "../state/store";
import { MAX_DIM } from "../state/store";
import { bindNumberInput, emptyHint, formatPower, powerLine, resultsTable, setWarning } from "./components";

const gridEl = document.getElementById("grid") as HTMLDivElement;
const warningEl = document.getElementById("grid-warning") as HTMLParagraphElement;
const resultsEl = document.getElementById("results") as HTMLDivElement;

function currentLayout(state: AppState): Layout {
  const { width, height, backing } = state.nuclear;
  return Array.from({ length: height }, (_, i) => backing[i].slice(0, width));
}

export function initNuclearView(store: Store): void {
  const widthInput = document.getElementById("width") as HTMLInputElement;
  const heightInput = document.getElementById("height") as HTMLInputElement;

  bindNumberInput(widthInput, 1, MAX_DIM, (width) =>
    store.set({ nuclear: { ...store.get().nuclear, width } }));
  bindNumberInput(heightInput, 1, MAX_DIM, (height) =>
    store.set({ nuclear: { ...store.get().nuclear, height } }));

  const setAllInRange = (value: boolean) => {
    const { width, height, backing } = store.get().nuclear;
    const next = backing.map((row) => row.slice());
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) next[i][j] = value;
    }
    store.set({ nuclear: { ...store.get().nuclear, backing: next } });
  };
  document.getElementById("fill")!.addEventListener("click", () => setAllInRange(true));
  document.getElementById("clear")!.addEventListener("click", () => setAllInRange(false));

  // One delegated listener instead of re-binding every cell on each render.
  gridEl.addEventListener("click", (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLButtonElement>("button.cell");
    if (!cell) return;
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const { backing } = store.get().nuclear;
    const next = backing.map((row) => row.slice());
    next[r][c] = !next[r][c];
    store.set({ nuclear: { ...store.get().nuclear, backing: next } });
  });
}

function renderGrid(state: AppState): void {
  const layout = currentLayout(state);
  const { width, height } = state.nuclear;
  gridEl.style.gridTemplateColumns = `repeat(${width}, 42px)`;
  gridEl.replaceChildren();
  let blockedCount = 0;
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.dataset.r = String(i);
      cell.dataset.c = String(j);
      const neighbours = layout[i][j] ? getNeighbourCount(layout, i, j) : 0;
      // Reactors (5x5 fission) with all four sides covered by other reactors
      // have no tile an inserter could feed fuel from.
      const blocked = layout[i][j] && neighbours === 4;
      if (blocked) blockedCount += 1;
      cell.className = "cell" + (layout[i][j] ? " on" : "") + (blocked ? " blocked" : "");
      cell.textContent = layout[i][j] ? "×" + (1 + neighbours) : "";
      cell.setAttribute("aria-label",
        `Row ${i + 1}, column ${j + 1}: ` + (layout[i][j]
          ? `reactor, x${1 + neighbours} heat` + (blocked ? ", unreachable by inserters" : "")
          : "empty"));
      gridEl.appendChild(cell);
    }
  }
  setWarning(warningEl, blockedCount,
    "enclosed on all four sides — inserters can't reach them to insert fuel cells.");
}

function renderResults(state: AppState): void {
  const layout = currentLayout(state);
  if (layout.flat().filter(Boolean).length === 0) {
    resultsEl.innerHTML = emptyHint("No reactors placed — click cells in the layout grid to add some.");
    return;
  }
  const req = calculateRequirements(layout, {
    reactorQuality: state.quality.reactor,
    heatExchangerQuality: state.quality.heatExchanger,
    turbineQuality: state.quality.turbine,
    pumpQuality: state.quality.pump,
  });

  const perReactor = REACTOR_HEAT_OUTPUT[state.quality.reactor];
  resultsEl.innerHTML =
    powerLine(formatPower(req.power), "total output (heat = electricity)") +
    resultsTable([
      { label: "Reactors", value: req.reactors, note: `${perReactor} MW each before neighbour bonus` },
      { label: "Heat exchangers", value: req.heatExchangers },
      { label: "Steam turbines", value: req.turbines },
      { label: "Offshore pumps", value: req.offshorePumps },
      { label: "Steam", value: req.steamPerSecond.toFixed(1), note: "per second" },
      { label: "Water", value: req.waterPerSecond.toFixed(1), note: "per second" },
      { label: "Fuel cells", value: req.fuelCellsPerMinute.toFixed(2),
        note: `per minute — one per reactor every ${req.fuelCellBurnTime.toFixed(0)} s` },
    ]);
}

export function renderNuclearView(state: AppState): void {
  renderGrid(state);
  renderResults(state);
}
