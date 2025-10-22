import type { Page } from "../router";
import { DecisionLayoutChart, type Factor, type Option, type Scores } from "../lib/vis";
import { computeWaddScores } from "../lib/wadd";
import { attachDecisionWorkflow } from "../lib/decisionWorkflow";

export const meta = { name: "manual" };

type ChartState = {
  factors: Factor[];
  options: Option[];
  scores: Scores;
};

const ManualLayout: Page = (root, ctx) => {
  const waddSetting = ctx.query.get("wadd")?.toLowerCase();
  const waddMode = waddSetting === "on"
    ? "always"
    : waddSetting === "off"
      ? "never"
      : "checkbox";
  let showWADD = waddMode === "always";
  const waddControl = waddMode === "checkbox"
    ? `
      <label style="display:flex; align-items:center; gap:8px; color:var(--fg); margin-top:8px">
        <input type="checkbox" id="manualShowWADD"${showWADD ? " checked" : ""}> Show WADD Scores
      </label>
    `
    : "";

  root.innerHTML = `
    <section class="card">
      <h1 class="h1">Direct Manipulation View</h1>
      <p style="color:var(--muted); margin-top:4px">Use the controls embedded in the chart to rename, resize, and rescore options without the step-by-step wizard.</p>
      ${waddControl}
      <div id="manualViz" style="margin-top:12px; background:#0f1730; border-radius:12px; padding:8px;"></div>
    </section>
  `;

  const vizEl = root.querySelector<HTMLDivElement>("#manualViz")!;
  const decisionHost = document.createElement("div");
  root.appendChild(decisionHost);

  const state: ChartState = {
    options: [
      { id: "o1", label: "Option A", weight: 1 },
      { id: "o2", label: "Option B", weight: 1 },
      { id: "o3", label: "Option C", weight: 1 },
    ],
    factors: [
      { id: "f1", label: "Impact", weight: 1 },
      { id: "f2", label: "Cost", weight: 1 },
      { id: "f3", label: "Time", weight: 1 },
    ],
    scores: {
      f1: { o1: 0, o2: 0, o3: 0 },
      f2: { o1: 0, o2: 0, o3: 0 },
      f3: { o1: 0, o2: 0, o3: 0 },
    },
  };

  const showWADDCheckbox = waddMode === "checkbox"
    ? root.querySelector<HTMLInputElement>("#manualShowWADD")
    : null;

  const chart = new DecisionLayoutChart(vizEl, {
    width: 1100,
    height: 600,
    showWADD,
    markCellsOnClick: true,
    onUpdate: (updates) => {
      if (updates.options) {
        syncCollection("options", updates.options);
      }
      if (updates.factors) {
        syncCollection("factors", updates.factors);
      }
      if (updates.scores) {
        for (const fid in updates.scores) {
          state.scores[fid] ??= {};
          Object.assign(state.scores[fid], updates.scores[fid]);
        }
      }
      reconcileScores();
      render();
    },
  });

  function syncCollection(key: "options" | "factors", incoming: Option[] | Factor[]) {
    const current = new Map(state[key].map(item => [item.id, item]));
    state[key] = incoming.map(item => {
      const existing = current.get(item.id);
      return existing
        ? Object.assign(existing, item)
        : { ...item };
    });
  }

  function reconcileScores() {
    const scores: Scores = {};
    state.factors.forEach((f) => {
      scores[f.id] = {};
      state.options.forEach((o) => {
        const current = state.scores[f.id]?.[o.id];
        scores[f.id][o.id] = typeof current === "number" ? current : 0;
      });
    });
    state.scores = scores;
  }

  function render() {
    chart.setShowWADD(showWADD);
    chart.data({
      options: state.options.map(o => ({ ...o })),
      factors: state.factors.map(f => ({ ...f })),
      scores: JSON.parse(JSON.stringify(state.scores)),
    }).render();
  }

  if (showWADDCheckbox) {
    showWADDCheckbox.addEventListener("change", () => {
      showWADD = !!showWADDCheckbox.checked;
      render();
    });
  }

  const getDecisionData = () => {
    const waddScores = computeWaddScores(
      state.options.map(o => ({ id: o.id, weight: o.weight })),
      state.factors.map(f => ({ id: f.id, weight: f.weight })),
      state.scores
    );
    return {
      options: state.options.map(o => ({ id: o.id, label: o.label })),
      waddScores,
    };
  };

  attachDecisionWorkflow({
    host: decisionHost,
    getDecisionData,
    showWaddOnButtons: waddMode === "always",
    onRestart: () => location.reload(),
  });

  reconcileScores();
  render();
};

export default ManualLayout;
