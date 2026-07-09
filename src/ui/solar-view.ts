// Solar tab: per-surface panel/accumulator table, optionally sized to a
// target average power.
import type { RatioApprox } from "../core/solar";
import { calculateSolar } from "../core/solar";
import type { AppState, Store } from "../state/store";

const resultsEl = document.getElementById("results") as HTMLDivElement;

const MAX_TARGET_MW = 1e6;

export function initSolarView(store: Store): void {
  const targetInput = document.getElementById("target-mw") as HTMLInputElement;
  targetInput.addEventListener("input", () => {
    const raw = Number(targetInput.value);
    const targetMw = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_TARGET_MW) : null;
    store.set({ solar: { targetMw } });
  });
}

export function renderSolarView(state: AppState): void {
  const targetMw = state.solar.targetMw;
  const rows = calculateSolar({
    panelQuality: state.quality.solarPanel,
    accumulatorQuality: state.quality.accumulator,
    targetMw,
  });

  const ratioCell = (ratio: RatioApprox | null) => ratio
    ? `${ratio.panels}:${ratio.accumulators}
       <small>(${ratio.errorPct >= 0 ? "+" : "−"}${Math.abs(ratio.errorPct).toFixed(2)}%)</small>`
    : "—";
  const sameRatio = (a: RatioApprox | null, b: RatioApprox | null) =>
    a && b && a.panels === b.panels && a.accumulators === b.accumulators;
  const countHead = targetMw !== null
    ? `<th>Panels</th><th>Accumulators</th>`
    : `<th>Panels / MW</th><th>Accumulators / MW</th>`;

  let anyFlowLimited = false;
  const body = rows.map((row) => {
    anyFlowLimited = anyFlowLimited || row.flowLimited;
    const exact = row.exactRatio
      ? `${row.exactRatio[0]}:${row.exactRatio[1]}${row.flowLimited ? " *" : ""}` : "—";
    const counts = targetMw !== null
      ? `<td class="num">${row.panels!.toLocaleString()}</td>
         <td class="num">${row.accumulators!.toLocaleString()}</td>`
      : `<td class="num">${(row.panelsPerMw[0] / row.panelsPerMw[1]).toFixed(2)}</td>
         <td class="num">${(row.accumulatorsPerMw[0] / row.accumulatorsPerMw[1]).toFixed(2)}</td>`;
    return `<tr><td>${row.label}</td>
      <td class="num">${row.solarPercent}%</td>
      <td class="num">${(row.avgKwPerPanel[0] / row.avgKwPerPanel[1]).toFixed(1)}</td>
      <td>${ratioCell(row.simpleRatio)}</td>
      <td>${sameRatio(row.simpleRatio, row.preciseRatio)
        ? '<span class="note">same</span>' : ratioCell(row.preciseRatio)}</td>
      <td>${exact}</td>${counts}</tr>`;
  }).join("");

  resultsEl.innerHTML = `
    <div class="table-scroll"><table>
      <tr><th>Surface</th><th>Solar</th><th>Avg kW/panel</th>
          <th>Simple ratio</th><th>Precise ratio</th><th>Exact ratio</th>${countHead}</tr>
      ${body}
    </table></div>
    <p class="grid-hint">Ratios are panels : accumulators for constant average power through
      the night. Space platforms have no night, so accumulators aren't needed for solar.
      ${anyFlowLimited ? "<br>* accumulator count set by discharge speed, not capacity." : ""}</p>`;
}
