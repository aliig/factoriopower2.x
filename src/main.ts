import "./styles.css";
import type { QualityTier } from "./core/quality";
import type { AppState } from "./state/store";
import { QUALITY_COMPONENTS, createStore } from "./state/store";
import { parseHash, serializeHash } from "./state/url";
import { populateQualitySelect } from "./ui/components";
import { initNuclearView, renderNuclearView } from "./ui/nuclear-view";
import { initFusionView, renderFusionView } from "./ui/fusion-view";
import { initSolarView, renderSolarView } from "./ui/solar-view";

const store = createStore(parseHash(location.hash));

for (const mode of ["nuclear", "fusion", "solar"] as const) {
  document.getElementById("tab-" + mode)!.addEventListener("click", () => store.set({ mode }));
}

// Quality selects: one master pushing to all components, nine controlled
// component selects whose value/colour are synced from state on render.
const qAll = document.getElementById("q-all") as HTMLSelectElement;
populateQualitySelect(qAll);
qAll.addEventListener("change", () => {
  const tier = qAll.value as QualityTier;
  qAll.className = "q-" + tier;
  const quality = { ...store.get().quality };
  for (const c of QUALITY_COMPONENTS) quality[c] = tier;
  store.set({ quality });
});
for (const component of QUALITY_COMPONENTS) {
  const select = document.getElementById("q-" + component) as HTMLSelectElement;
  populateQualitySelect(select);
  select.addEventListener("change", () => {
    store.set({ quality: { ...store.get().quality, [component]: select.value as QualityTier } });
  });
}

initNuclearView(store);
initFusionView(store);
initSolarView(store);

function render(state: AppState): void {
  document.body.dataset.mode = state.mode;
  for (const tab of document.querySelectorAll(".tab")) {
    tab.setAttribute("aria-selected", String(tab.id === "tab-" + state.mode));
  }
  for (const component of QUALITY_COMPONENTS) {
    const select = document.getElementById("q-" + component) as HTMLSelectElement;
    select.value = state.quality[component];
    select.className = "q-" + state.quality[component];
  }
  if (state.mode === "nuclear") renderNuclearView(state);
  else if (state.mode === "fusion") renderFusionView(state);
  else renderSolarView(state);
}

// Reflect state into the URL so any configuration is shareable. Throttled to
// one write per frame so drag-painting doesn't spam history.replaceState
// (which also never fires hashchange, so there is no feedback loop).
let urlRaf: number | null = null;
function syncUrl(): void {
  if (urlRaf !== null) return;
  urlRaf = requestAnimationFrame(() => {
    urlRaf = null;
    const hash = serializeHash(store.get());
    if (location.hash !== hash) {
      history.replaceState(null, "", hash || location.pathname + location.search);
    }
  });
}

// Pasted URLs and back/forward re-parse the fragment wholesale.
window.addEventListener("hashchange", () => store.set(parseHash(location.hash)));

store.subscribe(render);
store.subscribe(syncUrl);
render(store.get());
