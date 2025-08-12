// src/pages/LayoutBuilder.ts
import type { Page } from "../router";
import { DecisionLayoutChart } from "../lib/vis";

type UIState = {
  options: { id: string; label: string }[];
  factors: { id: string; label: string; uiImportance: number }[]; // 1..5 (UI)
  scoresUI: Record<string, Record<string, number>>;               // [factorId][optionId] = 1..5 (UI)
};

const MAX_CHOICES = 5;

// UI → model mappings
const mapLikertToSigned = (ui: number) => (ui - 3) / 2;        // 1..5 → -1..1
const mapImportanceToWeight = (ui: number) => 1 + (ui - 1) / 4; // 1..5 → 1..2

const LayoutBuilder: Page = (root) => {
  root.innerHTML = `
    <section class="card">
      <h1 class="h1">Build your decision layout</h1>
      <ol style="margin:0 0 12px 1.1rem; color:var(--muted)">
        <li>Add up to 5 choices</li>
        <li>Add factors and set importance (1–5)</li>
        <li>Rate each choice per factor (1–5)</li>
      </ol>

      <div id="step"></div>
      <div style="display:flex; gap:.5rem; margin-top:12px">
        <button id="backBtn"  style="display:none">Back</button>
        <button id="nextBtn">Next</button>
      </div>
    </section>
    <section class="card" style="margin-top:12px">
      <h2 class="h1" style="font-size:1.2rem">Preview</h2>
      <div id="viz" style="margin-top:8px; background:#0f1730; border-radius:12px; padding:8px;"></div>
    </section>
  `;

  const stepHost = root.querySelector<HTMLDivElement>("#step")!;
  const backBtn  = root.querySelector<HTMLButtonElement>("#backBtn")!;
  const nextBtn  = root.querySelector<HTMLButtonElement>("#nextBtn")!;
  const vizEl    = root.querySelector<HTMLDivElement>("#viz")!;

  // Initialize the chart
  const chart = new DecisionLayoutChart(vizEl, { width: 1100, height: 600 });

  // --- local state with stable IDs + tiny ID generators
  let optSeq = 0, facSeq = 0;
  const newOptId = () => `o${++optSeq}`;
  const newFacId = () => `f${++facSeq}`;

  const state: UIState = {
    options: [
      { id: newOptId(), label: "Option A" },
      { id: newOptId(), label: "Option B" },
    ],
    factors: [
      { id: newFacId(), label: "Factor 1", uiImportance: 3 },
      { id: newFacId(), label: "Factor 2", uiImportance: 3 },
    ],
    scoresUI: {},
  };

  const deepClone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

  /**
   * Reconcile ratings when options/factors change.
   * Keeps scores for pairs that still exist (by stable id),
   * initializes any new pair to neutral (3).
   */
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

  // ---------- Step 1: Choices
  function renderStep1() {
    stepHost.innerHTML = `
      <h2 class="h1" style="font-size:1.2rem">Step 1 — Add choices (max ${MAX_CHOICES})</h2>
      <div id="choices"></div>
      <div style="margin-top:8px">
        <button id="addChoiceBtn">Add choice</button>
      </div>
      <p style="color:var(--muted); margin-top:8px">You can rename choices anytime.</p>
    `;

    const container = stepHost.querySelector<HTMLDivElement>("#choices")!;
    drawChoices(container);

    stepHost.querySelector<HTMLButtonElement>("#addChoiceBtn")!.onclick = () => {
      if (state.options.length >= MAX_CHOICES) return;
      const prev = deepClone(state);
      const idx = state.options.length + 1;
      state.options.push({ id: newOptId(), label: `Option ${idx}` });
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
      row.style.gridTemplateColumns = "80px 1fr 90px";
      row.style.gap = "8px";
      row.style.margin = "6px 0";

      const idCell = document.createElement("div"); // display index, keep internal id stable
      idCell.textContent = String(idx + 1);

      const input = document.createElement("input");
      input.type = "text";
      input.value = opt.label;
      input.placeholder = `Option ${idx + 1}`;
      input.oninput = () => {
        opt.label = input.value.trim() || `Option ${idx + 1}`;
        renderPreview(); // live preview headers
      };

      const remove = document.createElement("button");
      remove.textContent = "Remove";
      remove.onclick = () => {
        const prev = deepClone(state);
        state.options.splice(idx, 1);
        reconcileScores(prev, state);
        drawChoices(container);
        renderPreview();
      };

      row.append(idCell, input, remove);
      container.appendChild(row);
    });
  }

  // ---------- Step 2: Factors & Importance
  function renderStep2() {
    stepHost.innerHTML = `
      <h2 class="h1" style="font-size:1.2rem">Step 2 — Add factors & importance</h2>
      <div id="factors"></div>
      <div style="margin-top:8px">
        <button id="addFactorBtn">Add factor</button>
      </div>
      <p style="color:var(--muted); margin-top:8px">
        Importance (1–5): 1=Low, 3=Medium, 5=Very high. Mapped to weights [1,2].
      </p>
    `;

    const container = stepHost.querySelector<HTMLDivElement>("#factors")!;
    drawFactors(container);

    stepHost.querySelector<HTMLButtonElement>("#addFactorBtn")!.onclick = () => {
      const prev = deepClone(state);
      const num = state.factors.length + 1;
      state.factors.push({ id: newFacId(), label: `Factor ${num}`, uiImportance: 3 });
      reconcileScores(prev, state);
      drawFactors(container);
      renderPreview();
    };

    backBtn.style.display = "";
    nextBtn.textContent = "Next";
  }

  function drawFactors(container: HTMLElement) {
    container.innerHTML = "";
    state.factors.forEach((f, idx) => {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "100px 1fr 220px 90px";
      row.style.gap = "8px";
      row.style.margin = "6px 0";

      const idCell = document.createElement("div");
      idCell.textContent = String(idx + 1);

      const name = document.createElement("input");
      name.type = "text";
      name.value = f.label;
      name.placeholder = `Factor ${idx + 1}`;
      name.oninput = () => { f.label = name.value.trim() || `Factor ${idx + 1}`; renderPreview(); };

      const sliderWrap = document.createElement("div");
      const slider = document.createElement("input");
      slider.type = "range"; slider.min = "1"; slider.max = "5"; slider.step = "1";
      slider.value = String(f.uiImportance);
      const label = document.createElement("span");
      label.style.marginLeft = "8px";
      const updateLab = () => label.textContent =
        `Importance: ${slider.value} → weight ${mapImportanceToWeight(Number(slider.value)).toFixed(2)}`;
      slider.oninput = () => { f.uiImportance = Number(slider.value); updateLab(); renderPreview(); };
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

      row.append(idCell, name, sliderWrap, remove);
      container.appendChild(row);
    });
  }

  // ---------- Step 3: Ratings grid (1–5 Likert)
  function renderStep3() {
    stepHost.innerHTML = `
      <h2 class="h1" style="font-size:1.2rem">Step 3 — Rate each option (1–5)</h2>
      <p style="color:var(--muted); margin:4px 0 10px">
        1=Very unfavorable · 3=Neutral · 5=Very favorable (mapped to -1..1)
      </p>
      <div style="overflow:auto">
        <table style="border-collapse:collapse; min-width:700px">
          <thead></thead>
          <tbody></tbody>
        </table>
      </div>
      <p style="color:var(--muted); margin-top:8px">Click “Finish” to render the layout.</p>
    `;

    const thead = stepHost.querySelector("thead")!;
    const tbody = stepHost.querySelector("tbody")!;
    thead.innerHTML = "";

    // header row
    const hr = document.createElement("tr");
    hr.appendChild(document.createElement("th")); // corner (factors label)
    state.options.forEach(o => {
      const th = document.createElement("th");
      th.textContent = o.label;
      th.style.textAlign = "center";
      th.style.padding = "4px 8px";
      hr.appendChild(th);
    });
    thead.appendChild(hr);

    // rows
    tbody.innerHTML = "";
    state.factors.forEach(f => {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.textContent = f.label;
      th.style.textAlign = "left";
      th.style.padding = "4px 8px";
      tr.appendChild(th);

      state.options.forEach(o => {
        const td = document.createElement("td");
        td.style.padding = "4px 8px";
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

  // ---------- Navigation
  function go(step: 1 | 2 | 3) {
    currentStep = step;
    if (step === 1) renderStep1();
    if (step === 2) renderStep2();
    if (step === 3) renderStep3();
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
      // Finish → build data and render
      const data = toChartData(state);
      chart.data(data).render();
    }
  };

  // ---------- Preview (live while editing)
  function renderPreview() {
    const data = toChartData(state, /*neutralFallback=*/true);
    chart.data(data).render();
  }

  function toChartData(s: UIState, neutralFallback = false) {
    // options
    const options = s.options.map(o => ({ id: o.id, label: o.label }));

    // factors with mapped weights
    const factors = s.factors.map(f => ({
      id: f.id,
      label: f.label,
      weight: mapImportanceToWeight(f.uiImportance),
    }));

    // scores: map 1..5 → -1..1
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

  // boot
  go(1);
  renderPreview();
};

export default LayoutBuilder;

