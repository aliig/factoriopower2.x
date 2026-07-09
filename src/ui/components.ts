// Small shared UI helpers: number formatting, the results table shape used by
// the nuclear and fusion panels, quality selects, warnings, and clamped
// number inputs.
import { QUALITY_TIERS } from "../core/quality";

export function formatPower(mw: number): string {
  return mw >= 1000 ? (mw / 1000).toLocaleString() + " GW" : mw.toLocaleString() + " MW";
}

export function powerLine(main: string, small: string): string {
  return `<p class="power-line">${main} <small>${small}</small></p>`;
}

export interface TableRow {
  label: string;
  value: string | number;
  note?: string;
}

export function resultsTable(rows: TableRow[]): string {
  const body = rows
    .map((r) => `<tr><td>${r.label}</td><td class="num">${r.value}</td><td class="note">${r.note ?? ""}</td></tr>`)
    .join("\n");
  return `<table>\n${body}\n</table>`;
}

export function emptyHint(message: string): string {
  return `<p class="empty-hint">${message}</p>`;
}

// Shared "N reactors are unreachable" warning under both layout editors.
export function setWarning(el: HTMLElement, count: number, rest: string): void {
  el.classList.toggle("active", count > 0);
  el.textContent = count > 0 ? `⚠ ${count} reactor${count > 1 ? "s are" : " is"} ${rest}` : "";
}

export function clampInt(raw: string | number, min: number, max: number): number {
  const v = Math.floor(Number(raw));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
}

// Wire a number input so downstream code always sees a clamped integer.
// While typing, the field is left alone (rewriting mid-keystroke would eat
// "15" at the "1"); on change (blur/Enter) the clamped value is written back
// so the field never displays a value the app isn't using.
export function bindNumberInput(
  el: HTMLInputElement,
  min: number,
  max: number,
  onChange: (value: number) => void
): void {
  el.addEventListener("input", () => onChange(clampInt(el.value, min, max)));
  el.addEventListener("change", () => {
    const value = clampInt(el.value, min, max);
    el.value = String(value);
    onChange(value);
  });
}

export function populateQualitySelect(select: HTMLSelectElement): void {
  for (const tier of QUALITY_TIERS) {
    const opt = document.createElement("option");
    opt.value = tier;
    opt.textContent = tier[0].toUpperCase() + tier.slice(1);
    select.appendChild(opt);
  }
  select.classList.add("q-normal");
}
