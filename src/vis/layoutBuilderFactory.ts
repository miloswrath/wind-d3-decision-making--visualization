import type { Page } from "../router";
import { DecisionLayoutChart } from "../lib/vis";

type PreviewKind = "chart" | "table";

type BuilderConfig = {
  previewMode: "live" | "after-finish";
  kind: PreviewKind;
};

type UIState = {
  options: { id: string; label: string; uiImportance: number }[];
  factors: { id: string; label: string; uiImportance: number }[];
  scoresUI: Record<string, Record<string, number>>;
};

type ChartDataSnapshot = {
  options: { id: string; label: string; weight: number }[];
  factors: { id: string; label: string; weight: number }[];
  scores: Record<string, Record<string, number>>;
};

const STORAGE_KEY = "decision-layout:builder-state";

const isEmbedded = (() => {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

function persistBuilderState(data: ChartDataSnapshot) {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(data);
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch (err) {
    console.warn("Unable to persist builder state to localStorage", err);
  }

  if (isEmbedded && window.parent) {
    try {
      const payload = JSON.parse(serialized) as ChartDataSnapshot;
      window.parent.postMessage({ type: "decision-layout:update", payload }, "*");
    } catch (err) {
      console.warn("Unable to post builder state to parent frame", err);
    }
  }
}

const MAX_CHOICES = 5;

const mapLikertToSigned = (ui: number) => (ui - 3) / 2;
const mapImportanceToWeight = (ui: number) => 1 + (ui - 1) / 4;
const weightToImportance = (w: number) => Math.round(1 + (w - 1) * 4);
const signedToLikert = (s: number) => Math.round(3 + s * 2);

export function createBuilderLayout(config: BuilderConfig): Page {
  return (root) => {
    const showWADDControl = config.kind === "chart"
      ? `
        <div style="margin-bottom:12px">
          <label style="display:flex; align-items:center; gap:8px; color:var(--fg)">
            <input type="checkbox" id="showWADD"> Show WADD Scores
          </label>
        </div>
      `
      : "";

    root.innerHTML = `
      <section class="card">
        <h1 class="h1">Build your decision layout</h1>
        <ol style="margin:0 0 12px 1.1rem; color:var(--muted)">
          <li>Add up to 5 choices & set importance</li>
          <li>Add factors and set importance (1–5)</li>
          <li>Rate each choice per factor (1–5)</li>
        </ol>
        ${showWADDControl}
        <div id="step"></div>
        <div style="display:flex; gap:.5rem; margin-top:12px">
          <button id="backBtn" style="display:none">Back</button>
          <button id="nextBtn">Next</button>
        </div>
      </section>
      <section id="previewCard" class="card" style="margin-top:12px">
        <h2 class="h1" style="font-size:1.2rem">Preview</h2>
        <div id="viz" style="margin-top:8px; background:#0f1730; border-radius:12px; padding:8px;"></div>
      </section>
    `;

    const stepHost = root.querySelector<HTMLDivElement>("#step")!;
    const backBtn = root.querySelector<HTMLButtonElement>("#backBtn")!;
    const nextBtn = root.querySelector<HTMLButtonElement>("#nextBtn")!;
    const vizEl = root.querySelector<HTMLDivElement>("#viz")!;
    vizEl.style.overflow = config.kind === "chart" ? "hidden" : "auto";
    const showWADDCheckbox = config.kind === "chart"
      ? root.querySelector<HTMLInputElement>("#showWADD")
      : null;
    const previewCard = root.querySelector<HTMLElement>("#previewCard")!;

    let showWADD = false;
    let finished = config.previewMode === "after-finish" ? false : true;

    const BASE_HEIGHT = 600;
    const measureWidth = () => Math.max(360, vizEl.clientWidth || root.clientWidth || 960);

    let chart: DecisionLayoutChart | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const ensureChartSize = () => {
      if (!chart) return;
      chart.setSize(measureWidth(), BASE_HEIGHT);
    };

    if (config.kind === "chart") {
      chart = new DecisionLayoutChart(vizEl, {
        width: measureWidth(),
        height: BASE_HEIGHT,
        showWADD,
        onUpdate: (updates) => {
          if (updates.factors) {
            const idToFactor = new Map(state.factors.map(f => [f.id, f]));
            updates.factors.forEach(newF => {
              const existing = idToFactor.get(newF.id);
              if (existing) {
                existing.label = newF.label;
                existing.uiImportance = weightToImportance(newF.weight);
              } else {
                state.factors.push({
                  id: newF.id,
                  label: newF.label,
                  uiImportance: weightToImportance(newF.weight),
                });
              }
            });
            state.factors = updates.factors.map(newF => idToFactor.get(newF.id) || {
              id: newF.id,
              label: newF.label,
              uiImportance: weightToImportance(newF.weight),
            });
          }
          if (updates.options) {
            const idToOption = new Map(state.options.map(o => [o.id, o]));
            updates.options.forEach(newO => {
              const existing = idToOption.get(newO.id);
              if (existing) {
                existing.label = newO.label;
                existing.uiImportance = weightToImportance(newO.weight);
              } else {
                state.options.push({
                  id: newO.id,
                  label: newO.label,
                  uiImportance: weightToImportance(newO.weight),
                });
              }
            });
            state.options = updates.options.map(newO => idToOption.get(newO.id) || {
              id: newO.id,
              label: newO.label,
              uiImportance: weightToImportance(newO.weight),
            });
          }
          if (updates.scores) {
            for (const fid in updates.scores) {
              state.scoresUI[fid] ??= {};
              for (const oid in updates.scores[fid]) {
                state.scoresUI[fid][oid] = signedToLikert(updates.scores[fid][oid]);
              }
            }
          }
          reconcileScores(state, state);
          renderCurrentStep();
          renderPreview();
        },
      });

      showWADDCheckbox?.addEventListener("change", () => {
        showWADD = !!showWADDCheckbox.checked;
        chart?.setShowWADD(showWADD);
        renderPreview(true);
      });

      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          ensureChartSize();
          if (config.previewMode === "live" || finished) {
            renderPreview(true);
          }
        });
        resizeObserver.observe(vizEl);
      }
    }

    if (config.previewMode === "after-finish") {
      previewCard.style.display = "none";
    }

    let optSeq = 0, facSeq = 0;
    const newOptId = () => `o${++optSeq}`;
    const newFacId = () => `f${++facSeq}`;

    const state: UIState = {
      options: [
        { id: newOptId(), label: "Option A", uiImportance: 3 },
        { id: newOptId(), label: "Option B", uiImportance: 3 },
      ],
      factors: [
        { id: newFacId(), label: "Factor 1", uiImportance: 3 },
        { id: newFacId(), label: "Factor 2", uiImportance: 3 },
      ],
      scoresUI: {},
    };

    const deepClone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

    function reconcileScores(prev: UIState, next: UIState) {
      const newScores: Record<string, Record<string, number>> = {};
      const prevScores = prev.scoresUI || {};
      for (const f of next.factors) {
        newScores[f.id] = {};
        for (const o of next.options) {
          const kept = prevScores[f.id]?.[o.id];
          newScores[f.id][o.id] = kept ?? 3;
        }
      }
      next.scoresUI = newScores;
    }

    let currentStep = 1 as 1 | 2 | 3;

    function renderStep1() {
      stepHost.innerHTML = `
        <h2 class="h1" style="font-size:1.2rem">Step 1 — Add choices (max ${MAX_CHOICES})</h2>
        <div id="choices"></div>
        <div style="margin-top:8px">
          <button id="addChoiceBtn">Add choice</button>
        </div>
        <p style="color:var(--muted); margin-top:8px">You can rename choices and set importance anytime.</p>
      `;

      const container = stepHost.querySelector<HTMLDivElement>("#choices")!;
      drawChoices(container);

      stepHost.querySelector<HTMLButtonElement>("#addChoiceBtn")!.onclick = () => {
        if (state.options.length >= MAX_CHOICES) return;
        const prev = deepClone(state);
        const idx = state.options.length + 1;
        state.options.push({ id: newOptId(), label: `Option ${idx}`, uiImportance: 3 });
        reconcileScores(prev, state);
        drawChoices(container);
        renderPreview();
      };

      backBtn.style.display = "none";
      nextBtn.textContent = "Next";
    }

    function drawChoices(container: HTMLElement) {
      container.innerHTML = "";
      state.options.forEach((opt, idx) => {
        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns = "80px 1fr 220px 90px";
        row.style.gap = "8px";
        row.style.margin = "6px 0";

        const idCell = document.createElement("div");
        idCell.textContent = String(idx + 1);

        const input = document.createElement("input");
        input.type = "text";
        input.value = opt.label;
        input.placeholder = `Option ${idx + 1}`;
        input.oninput = () => {
          opt.label = input.value.trim() || `Option ${idx + 1}`;
          renderPreview();
        };

        const sliderWrap = document.createElement("div");
        const slider = document.createElement("input");
        slider.type = "range"; slider.min = "1"; slider.max = "5"; slider.step = "1";
        slider.value = String(opt.uiImportance);
        const label = document.createElement("span");
        label.style.marginLeft = "8px";
        const updateLab = () => label.textContent =
          `Importance: ${slider.value} → weight ${mapImportanceToWeight(Number(slider.value)).toFixed(2)}`;
        slider.oninput = () => { opt.uiImportance = Number(slider.value); updateLab(); renderPreview(); };
        updateLab();
        sliderWrap.append(slider, label);

        const remove = document.createElement("button");
        remove.textContent = "Remove";
        remove.onclick = () => {
          const prev = deepClone(state);
          state.options.splice(idx, 1);
          reconcileScores(prev, state);
          drawChoices(container);
          renderPreview();
        };

        row.append(idCell, input, sliderWrap, remove);
        container.appendChild(row);
      });
    }

    function renderStep2() {
      stepHost.innerHTML = `
        <h2 class="h1" style="font-size:1.2rem">Step 2 — Add factors</h2>
        <div id="factors"></div>
        <div style="margin-top:8px">
          <button id="addFactorBtn">Add factor</button>
        </div>
        <p style="color:var(--muted); margin-top:8px">Weights scale the bars in the visualization.</p>
      `;
      const container = stepHost.querySelector<HTMLDivElement>("#factors")!;
      drawFactors(container);

      stepHost.querySelector<HTMLButtonElement>("#addFactorBtn")!.onclick = () => {
        const prev = deepClone(state);
        const idx = state.factors.length + 1;
        state.factors.push({ id: newFacId(), label: `Factor ${idx}`, uiImportance: 3 });
        reconcileScores(prev, state);
        drawFactors(container);
        renderPreview();
      };

      backBtn.style.display = "";
      nextBtn.textContent = "Next";
    }

    function drawFactors(container: HTMLElement) {
      container.innerHTML = "";
      state.factors.forEach((fac, idx) => {
        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns = "80px 1fr 220px 90px";
        row.style.gap = "8px";
        row.style.margin = "6px 0";

        const idCell = document.createElement("div");
        idCell.textContent = String(idx + 1);

        const input = document.createElement("input");
        input.type = "text";
        input.value = fac.label;
        input.placeholder = `Factor ${idx + 1}`;
        input.oninput = () => {
          fac.label = input.value.trim() || `Factor ${idx + 1}`;
          renderPreview();
        };

        const sliderWrap = document.createElement("div");
        const slider = document.createElement("input");
        slider.type = "range"; slider.min = "1"; slider.max = "5"; slider.step = "1";
        slider.value = String(fac.uiImportance);
        const label = document.createElement("span");
        label.style.marginLeft = "8px";
        const updateLab = () => label.textContent =
          `Importance: ${slider.value} → weight ${mapImportanceToWeight(Number(slider.value)).toFixed(2)}`;
        slider.oninput = () => { fac.uiImportance = Number(slider.value); updateLab(); renderPreview(); };
        updateLab();
        sliderWrap.append(slider, label);

        const remove = document.createElement("button");
        remove.textContent = "Remove";
        remove.onclick = () => {
          const prev = deepClone(state);
          state.factors.splice(idx, 1);
          reconcileScores(prev, state);
          drawFactors(container);
          renderPreview();
        };

        row.append(idCell, input, sliderWrap, remove);
        container.appendChild(row);
      });
    }

    function renderStep3() {
      stepHost.innerHTML = `
        <h2 class="h1" style="font-size:1.2rem">Step 3 — Score each factor per option</h2>
        <div style="overflow:auto; max-width:100%">
          <table class="table" style="width:100%; min-width:680px">
            <thead>
              <tr>
                <th scope="col">Factor</th>
                ${state.options.map(o => `<th scope="col">${o.label}</th>`).join("")}
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      `;

      const tbody = stepHost.querySelector<HTMLTableSectionElement>("tbody")!;
      tbody.innerHTML = "";

      state.factors.forEach((f) => {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.scope = "row";
        th.textContent = f.label;
        tr.appendChild(th);

        state.options.forEach((o) => {
          const td = document.createElement("td");
          td.style.minWidth = "140px";
          const inp = document.createElement("input");
          inp.type = "range"; inp.min = "1"; inp.max = "5"; inp.step = "1";
          inp.value = String(state.scoresUI[f.id]?.[o.id] ?? 3);
          const val = document.createElement("span");
          val.style.marginLeft = "6px";
          const setVal = () => val.textContent =
            `${inp.value} → ${mapLikertToSigned(Number(inp.value)).toFixed(2)}`;
          setVal();
          inp.oninput = () => {
            state.scoresUI[f.id] ||= {};
            state.scoresUI[f.id][o.id] = Number(inp.value);
            setVal();
            renderPreview();
          };
          td.append(inp, val);
          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });

      backBtn.style.display = "";
      nextBtn.textContent = "Finish";
    }

    function renderCurrentStep() {
      if (currentStep === 1) renderStep1();
      else if (currentStep === 2) renderStep2();
      else renderStep3();
    }

    function go(step: 1 | 2 | 3) {
      currentStep = step;
      renderCurrentStep();
    }

    backBtn.onclick = () => {
      if (currentStep === 2) go(1);
      else if (currentStep === 3) go(2);
    };

    nextBtn.onclick = () => {
      if (currentStep === 1) {
        if (state.options.length < 2) { alert("Please add at least 2 choices."); return; }
        const prev = deepClone(state); reconcileScores(prev, state);
        go(2);
      } else if (currentStep === 2) {
        if (state.factors.length < 1) { alert("Please add at least 1 factor."); return; }
        const prev = deepClone(state); reconcileScores(prev, state);
        go(3);
      } else {
        finished = true;
        if (config.previewMode === "after-finish") {
          previewCard.style.display = "";
        }
        renderPreview(true);
      }
    };

    function renderPreview(force = false) {
      if (config.previewMode === "after-finish" && !finished && !force) return;
      const neutralFallback = config.kind === "chart"
        ? config.previewMode === "live" || !finished
        : false;
      const data = toChartData(state, neutralFallback);
      persistBuilderState(data);
      if (config.kind === "chart") {
        ensureChartSize();
        chart?.data(data).render();
      } else {
        renderTable(data);
      }
    }

    function toChartData(s: UIState, neutralFallback = false): ChartDataSnapshot {
      const options = s.options.map(o => ({
        id: o.id,
        label: o.label,
        weight: mapImportanceToWeight(o.uiImportance),
      }));

      const factors = s.factors.map(f => ({
        id: f.id,
        label: f.label,
        weight: mapImportanceToWeight(f.uiImportance),
      }));

      const scores: Record<string, Record<string, number>> = {};
      for (const f of s.factors) {
        scores[f.id] = {};
        for (const o of s.options) {
          const ui = s.scoresUI[f.id]?.[o.id];
          scores[f.id][o.id] = ui ? mapLikertToSigned(ui) : (neutralFallback ? 0 : 0);
        }
      }

      return { options, factors, scores };
    }

    function renderTable(data: ChartDataSnapshot) {
      vizEl.replaceChildren();

      const table = document.createElement("table");
      table.className = "table";
      table.style.width = "100%";
      table.style.minWidth = "680px";

      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      const headCells = ["Factor", "Importance", ...data.options.map(o => o.label)];
      headCells.forEach((label, idx) => {
        const th = document.createElement("th");
        th.scope = idx === 0 ? "col" : "col";
        th.textContent = label;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");

      const optionRow = document.createElement("tr");
      const optionLabel = document.createElement("th");
      optionLabel.scope = "row";
      optionLabel.textContent = "Option importance";
      optionRow.appendChild(optionLabel);
      const spacer = document.createElement("td");
      spacer.textContent = "";
      optionRow.appendChild(spacer);
      data.options.forEach((o) => {
        const td = document.createElement("td");
        td.style.textAlign = "center";
        td.textContent = String(weightToImportance(o.weight));
        optionRow.appendChild(td);
      });
      tbody.appendChild(optionRow);

      data.factors.forEach((factor) => {
        const row = document.createElement("tr");
        const labelCell = document.createElement("th");
        labelCell.scope = "row";
        labelCell.textContent = factor.label;
        row.appendChild(labelCell);

        const importanceCell = document.createElement("td");
        importanceCell.style.textAlign = "center";
        importanceCell.textContent = String(weightToImportance(factor.weight));
        row.appendChild(importanceCell);

        data.options.forEach((option) => {
          const td = document.createElement("td");
          td.style.textAlign = "center";
          const score = data.scores[factor.id]?.[option.id] ?? 0;
          const normalized = (Math.max(-1, Math.min(1, score)) + 1) / 2;
          td.textContent = (normalized * 10).toFixed(1);
          row.appendChild(td);
        });

        tbody.appendChild(row);
      });

      const waddScores = calculateTableWADD(data);
      const waddRow = document.createElement("tr");
      const waddLabel = document.createElement("th");
      waddLabel.scope = "row";
      waddLabel.textContent = "WADD";
      waddRow.appendChild(waddLabel);
      const filler = document.createElement("td");
      filler.textContent = "";
      waddRow.appendChild(filler);
      data.options.forEach(option => {
        const td = document.createElement("td");
        td.style.textAlign = "center";
        td.textContent = waddScores[option.id].toFixed(1);
        waddRow.appendChild(td);
      });
      tbody.appendChild(waddRow);

      table.appendChild(tbody);
      vizEl.appendChild(table);
    }

    function calculateTableWADD(data: ChartDataSnapshot) {
      const result: Record<string, number> = {};
      data.options.forEach(option => {
        let weightedTotal = 0;
        let weightSum = 0;
        const optionWeight = Math.max(0, option.weight);
        data.factors.forEach(factor => {
          const factorWeight = Math.max(0, factor.weight);
          if (!factorWeight || !optionWeight) return;
          const rawScore = data.scores[factor.id]?.[option.id] ?? 0;
          const clamped = Math.max(-1, Math.min(1, rawScore));
          const normalizedUtility = (clamped + 1) / 2;
          const combinedWeight = factorWeight * optionWeight;
          weightedTotal += combinedWeight * normalizedUtility;
          weightSum += combinedWeight;
        });
        const normalized = weightSum ? weightedTotal / weightSum : 0;
        result[option.id] = normalized * 10;
      });
      return result;
    }

    go(1);
    if (config.previewMode === "live") {
      renderPreview(true);
    }
  };
}
