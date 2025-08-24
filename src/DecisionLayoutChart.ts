import { select, Selection } from "d3-selection";
import { scaleBand } from "d3-scale";
import { sum } from "d3-array";
import { drag } from "d3-drag";

export type Factor = { id: string; label: string; weight: number };
export type Option = { id: string; label: string; weight: number };
export type Scores = Record<string, Record<string, number>>;

export type LayoutConfig = {
  width: number;
  height: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  padding?: { row: number; col: number };
  colors?: { pos: string; neg: string; headerBg: string; headerFg: string; grid: string };
  fontFamily?: string;
  onUpdate?: (updates: Partial<{ factors: Factor[]; options: Option[]; scores: Scores }>) => void;
  showWADD?: boolean;
};

const DEFAULTS: Required<Omit<LayoutConfig, "width" | "height">> = {
  margin: { top: 48, right: 16, bottom: 32, left: 180 },
  padding: { row: 4, col: 4 },
  colors: {
    pos: "#04b254",
    neg: "#6b3b1f",
    headerBg: "#2f64b7",
    headerFg: "#ffffff",
    grid: "#d6dceb",
  },
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  showWADD: false,
};

export class DecisionLayoutChart {
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private gCols!: Selection<SVGGElement, unknown, null, undefined>;
  private gRows!: Selection<SVGGElement, unknown, null, undefined>;
  private gGrid!: Selection<SVGGElement, unknown, null, undefined>;
  private gWADD!: Selection<SVGGElement, unknown, null, undefined>;
  private gControls!: Selection<SVGGElement, unknown, null, undefined>;

  private cfg: LayoutConfig & Required<Omit<LayoutConfig, "width" | "height">>;
  private factors: Factor[] = [];
  private options: Option[] = [];
  private scores: Scores = {};
  private onUpdate?: (updates: Partial<{ factors: Factor[]; options: Option[]; scores: Scores }>) => void;
  private dragInfo: any = {};
  private updatePending = false;
  private editingId: string | null = null;

  constructor(container: HTMLElement, cfg: LayoutConfig) {
    this.cfg = { ...cfg, ...DEFAULTS, margin: { ...DEFAULTS.margin, ...(cfg.margin || {}) },
                 padding: { ...DEFAULTS.padding, ...(cfg.padding || {}) },
                 colors: { ...DEFAULTS.colors, ...(cfg.colors || {}) },
                 fontFamily: cfg.fontFamily || DEFAULTS.fontFamily,
                 showWADD: cfg.showWADD ?? DEFAULTS.showWADD };
    this.onUpdate = cfg.onUpdate;

    this.svg = select(container)
      .append("svg")
      .attr("width", this.cfg.width)
      .attr("height", this.cfg.height + (this.cfg.showWADD ? 36 : 0))
      .style("font-family", this.cfg.fontFamily);

    this.gCols = this.svg.append("g").attr("class", "dl-cols");
    this.gRows = this.svg.append("g").attr("class", "dl-rows");
    this.gGrid = this.svg.append("g").attr("class", "dl-grid");
    this.gWADD = this.svg.append("g").attr("class", "dl-wadd");
    this.gControls = this.svg.append("g").attr("class", "dl-controls");
  }

  data(input: { factors: Factor[]; options: Option[]; scores: Scores }) {
    this.factors = input.factors;
    this.options = input.options;
    this.scores = input.scores;
    return this;
  }

  updateScore(factorId: string, optionId: string, score: number) {
    const s = Math.max(-1, Math.min(1, score));
    if (!this.scores[factorId]) this.scores[factorId] = {} as any;
    this.scores[factorId][optionId] = s;
    return this;
  }

  private calculateWADDScores(): Record<string, number> {
    const waddScores: Record<string, number> = {};
    this.options.forEach(o => {
      let score = 0;
      this.factors.forEach(f => {
        const factorWeight = f.weight;
        const optionScore = this.scores[f.id]?.[o.id] ?? 0;
        score += factorWeight * optionScore;
      });
      waddScores[o.id] = Number(score.toFixed(2));
    });
    return waddScores;
  }

  render() {
    const { width, height, margin, colors, padding, onUpdate, showWADD } = this.cfg;
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const ROW_GAP = Math.max(2, padding.row);
    const MAX_CHOICES = 5;

    const MIN_ROW_PX = 28;
    const rowWeights = this.factors.map(f => Math.max(0, f.weight));
    const totalRowW = Math.max(1e-6, sum(rowWeights));
    const baseRowH = MIN_ROW_PX * this.factors.length;
    const freeRowH = Math.max(0, innerH - baseRowH);
    const rowCompress = baseRowH > innerH ? innerH / baseRowH : 1;
    const rowHeights: number[] = this.factors.map((_, i) =>
      (MIN_ROW_PX + (freeRowH * (rowWeights[i] / totalRowW))) * rowCompress
    );
    const rowTops: number[] = [margin.top];
    for (let i = 1; i < rowHeights.length; i++) {
      rowTops[i] = rowTops[i - 1] + rowHeights[i - 1];
    }

    const MIN_COL_PX = 120;
    const colWeights = this.options.map(o => Math.max(0, o.weight));
    const totalColW = Math.max(1e-6, sum(colWeights));
    const baseColW = MIN_COL_PX * this.options.length;
    const freeColW = Math.max(0, innerW - baseColW);
    const colCompress = baseColW > innerW ? innerW / baseColW : 1;
    const colWidths: number[] = this.options.map((_, i) =>
      (MIN_COL_PX + (freeColW * (colWeights[i] / totalColW))) * colCompress
    );
    const colLefts: number[] = [margin.left];
    for (let i = 1; i < colWidths.length; i++) {
      colLefts[i] = colLefts[i - 1] + colWidths[i - 1];
    }

    const HEADER_H = 36;
    const col = this.gCols
      .selectAll<SVGGElement, Option>("g.col")
      .data(this.options, (d: any) => d.id);

    const colEnter = col.enter()
      .append("g")
      .attr("class", "col");

    colEnter.append("rect").attr("class", "header-bg").attr("rx", 6).attr("ry", 6);
    colEnter.append("foreignObject").attr("class", "header-label");
    colEnter.append("rect").attr("class", "resize-handle").style("cursor", "col-resize").attr("fill", "transparent");
    colEnter.append("rect").attr("class", "remove-btn").style("cursor", "pointer").attr("fill", "#ff4d4d");

    const colAll = colEnter.merge(col);
    colAll.attr("transform", (_, i) => `translate(${colLefts[i]}, ${margin.top - HEADER_H})`);
    colAll.select("rect.header-bg")
      .attr("x", 0)
      .attr("y", -2)
      .attr("width", (_, i) => colWidths[i])
      .attr("height", HEADER_H)
      .attr("fill", colors.headerBg);

    colAll.each(function(d, i) {
      const fo = select(this).select<SVGForeignObjectElement>("foreignObject.header-label");
      fo.attr("x", 0)
        .attr("y", -2)
        .attr("width", colWidths[i])
        .attr("height", HEADER_H);
      
      const isEditing = d.id === this.editingId;
      fo.html(isEditing
        ? `<input type="text" value="${d.label}" style="width:100%; height:100%; box-sizing:border-box; text-align:center; font-weight:700; color:${colors.headerFg}; background:transparent; border:none;">`
        : `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-weight:700; color:${colors.headerFg};">${d.label}</div>`
      );

      const input = fo.select("input");
      if (isEditing) {
        input.node()?.focus();
        input.on("input", () => {
          d.label = input.node()?.value.trim() || `Option ${i + 1}`;
          if (this.onUpdate) this.onUpdate({ options: [...this.options] });
        });
        input.on("blur", () => {
          this.editingId = null;
          this.render();
        });
        input.on("keypress", (event) => {
          if (event.key === "Enter") {
            this.editingId = null;
            this.render();
          }
        });
      }
    }.bind(this));

    colAll.select("rect.resize-handle")
      .attr("x", (_, i) => colWidths[i] - 8)
      .attr("y", -2)
      .attr("width", 16)
      .attr("height", HEADER_H);

    colAll.select("rect.remove-btn")
      .attr("x", (_, i) => colWidths[i] - 24)
      .attr("y", -HEADER_H / 2 - 6)
      .attr("width", 16)
      .attr("height", 16)
      .attr("rx", 3)
      .on("click", (event, d) => {
        if (this.options.length <= 2) return; // Minimum 2 options
        this.options = this.options.filter(o => o.id !== d.id);
        const newScores: Scores = {};
        Object.keys(this.scores).forEach(fid => {
          newScores[fid] = {};
          Object.keys(this.scores[fid]).forEach(oid => {
            if (this.options.some(o => o.id === oid)) {
              newScores[fid][oid] = this.scores[fid][oid];
            }
          });
        });
        this.scores = newScores;
        this.render();
        if (this.onUpdate) this.onUpdate({ options: [...this.options], scores: {...this.scores} });
      });

    colAll.select("foreignObject.header-label").on("dblclick", (event, d) => {
      this.editingId = d.id;
      this.render();
    });

    colAll.select<SVGRectElement>("rect.resize-handle").call(
      drag<Option>()
        .on("start", (event, d) => {
          const idx = this.options.findIndex(o => o.id === d.id);
          this.dragInfo = {
            type: "col-resize",
            startX: event.x,
            startWidth: colWidths[idx],
            startWeight: d.weight,
            idx,
            updating: false,
          };
        })
        .on("drag", (event, d) => {
          const delta = event.x - this.dragInfo.startX;
          let newWidth = Math.max(50, this.dragInfo.startWidth + delta);
          let newWeight = this.dragInfo.startWeight * (newWidth / this.dragInfo.startWidth);
          newWeight = Math.max(1, Math.min(2, newWeight));
          this.options[this.dragInfo.idx].weight = newWeight;
          if (!this.updatePending) {
            this.updatePending = true;
            requestAnimationFrame(() => {
              this.render();
              if (this.onUpdate) this.onUpdate({ options: [...this.options] });
              this.updatePending = false;
            });
          }
        })
        .on("end", () => {
          if (this.onUpdate) this.onUpdate({ options: [...this.options] });
        })
    );

    colAll.select<SVGRectElement>("rect.header-bg").style("cursor", "move").call(
      drag<Option>()
        .on("start", (event, d) => {
          select(event.sourceEvent.target.parentNode as SVGGElement).raise();
          const idx = this.options.findIndex(o => o.id === d.id);
          this.dragInfo = {
            type: "col-reorder",
            startX: event.x,
            idx,
            origLeft: colLefts[idx],
          };
        })
        .on("drag", (event, d) => {
          const translateX = colLefts[this.dragInfo.idx] + event.x - this.dragInfo.startX;
          select(event.sourceEvent.target.parentNode as SVGGElement).attr(
            "transform",
            `translate(${translateX}, ${margin.top - HEADER_H})`
          );
        })
        .on("end", (event, d) => {
          const draggedLeft = this.dragInfo.origLeft + event.x - this.dragInfo.startX;
          const draggedCenter = draggedLeft + colWidths[this.dragInfo.idx] / 2;
          let newIdx = 0;
          for (let i = 0; i < colLefts.length; i++) {
            if (i === this.dragInfo.idx) continue;
            const center = colLefts[i] + colWidths[i] / 2;
            if (draggedCenter > center) newIdx = i + 1;
          }
          if (newIdx > this.dragInfo.idx) newIdx--;
          const moved = this.options.splice(this.dragInfo.idx, 1)[0];
          this.options.splice(newIdx, 0, moved);
          this.render();
          if (this.onUpdate) this.onUpdate({ options: [...this.options] });
        })
    );

    col.exit().remove();

    const row = this.gRows
      .selectAll<SVGGElement, Factor>("g.row")
      .data(this.factors, (d: any) => d.id);

    const rowEnter = row.enter().append("g").attr("class", "row");
    rowEnter.append("rect").attr("class", "row-bg").attr("rx", 6).attr("ry", 6);
    rowEnter.append("foreignObject").attr("class", "row-label");
    rowEnter.append("rect").attr("class", "resize-handle").style("cursor", "row-resize").attr("fill", "transparent");
    rowEnter.append("rect").attr("class", "remove-btn").style("cursor", "pointer").attr("fill", "#ff4d4d");

    const rowAll = rowEnter.merge(row);
    rowAll.attr("transform", (_, i) => `translate(0, ${rowTops[i]})`);
    rowAll.select("rect.row-bg")
      .attr("x", 0)
      .attr("width", margin.left - 5)
      .attr("y", ROW_GAP / 2)
      .attr("height", (_, i) => rowHeights[i] - ROW_GAP)
      .attr("fill", colors.headerBg)
      .style("cursor", "move");

    rowAll.each(function(d, i) {
      const fo = select(this).select<SVGForeignObjectElement>("foreignObject.row-label");
      fo.attr("x", 0)
        .attr("y", ROW_GAP / 2)
        .attr("width", margin.left - 5)
        .attr("height", rowHeights[i] - ROW_GAP);
      
      const isEditing = d.id === this.editingId;
      fo.html(isEditing
        ? `<input type="text" value="${d.label}" style="width:100%; height:100%; box-sizing:border-box; text-align:center; font-weight:600; color:${colors.headerFg}; background:transparent; border:none;">`
        : `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-weight:600; color:${colors.headerFg};">${d.label}</div>`
      );

      const input = fo.select("input");
      if (isEditing) {
        input.node()?.focus();
        input.on("input", () => {
          d.label = input.node()?.value.trim() || `Factor ${i + 1}`;
          if (this.onUpdate) this.onUpdate({ factors: [...this.factors] });
        });
        input.on("blur", () => {
          this.editingId = null;
          this.render();
        });
        input.on("keypress", (event) => {
          if (event.key === "Enter") {
            this.editingId = null;
            this.render();
          }
        });
      }
    }.bind(this));

    rowAll.select("rect.resize-handle")
      .attr("x", 0)
      .attr("width", margin.left - 5)
      .attr("y", (_, i) => rowHeights[i] - 8)
      .attr("height", 16);

    rowAll.select("rect.remove-btn")
      .attr("x", margin.left - 24)
      .attr("y", (_, i) => rowHeights[i] / 2 - 6)
      .attr("width", 16)
      .attr("height", 16)
      .attr("rx", 3)
      .on("click", (event, d) => {
        if (this.factors.length <= 1) return; // Minimum 1 factor
        this.factors = this.factors.filter(f => f.id !== d.id);
        const newScores: Scores = {};
        this.factors.forEach(f => {
          newScores[f.id] = { ...this.scores[f.id] };
        });
        this.scores = newScores;
        this.render();
        if (this.onUpdate) this.onUpdate({ factors: [...this.factors], scores: {...this.scores} });
      });

    rowAll.select("foreignObject.row-label").on("dblclick", (event, d) => {
      this.editingId = d.id;
      this.render();
    });

    rowAll.select<SVGRectElement>("rect.resize-handle").call(
      drag<Factor>()
        .on("start", (event, d) => {
          const idx = this.factors.findIndex(f => f.id === d.id);
          this.dragInfo = {
            type: "row-resize",
            startY: event.y,
            startHeight: rowHeights[idx],
            startWeight: d.weight,
            idx,
            updating: false,
          };
        })
        .on("drag", (event, d) => {
          const delta = event.y - this.dragInfo.startY;
          let newHeight = Math.max(10, this.dragInfo.startHeight + delta);
          let newWeight = this.dragInfo.startWeight * (newHeight / this.dragInfo.startHeight);
          newWeight = Math.max(1, Math.min(2, newWeight));
          this.factors[this.dragInfo.idx].weight = newWeight;
          if (!this.updatePending) {
            this.updatePending = true;
            requestAnimationFrame(() => {
              this.render();
              if (this.onUpdate) this.onUpdate({ factors: [...this.factors] });
              this.updatePending = false;
            });
          }
        })
        .on("end", () => {
          if (this.onUpdate) this.onUpdate({ factors: [...this.factors] });
        })
    );

    rowAll.select<SVGRectElement>("rect.row-bg").call(
      drag<Factor>()
        .on("start", (event, d) => {
          select(event.sourceEvent.target.parentNode as SVGGElement).raise();
          const idx = this.factors.findIndex(f => f.id === d.id);
          this.dragInfo = {
            type: "row-reorder",
            startY: event.y,
            idx,
            origTop: rowTops[idx],
          };
        })
        .on("drag", (event, d) => {
          const translateY = rowTops[this.dragInfo.idx] + event.y - this.dragInfo.startY;
          select(event.sourceEvent.target.parentNode as SVGGElement).attr("transform", `translate(0, ${translateY})`);
        })
        .on("end", (event, d) => {
          const draggedTop = this.dragInfo.origTop + event.y - this.dragInfo.startY;
          const draggedCenter = draggedTop + rowHeights[this.dragInfo.idx] / 2;
          let newIdx = 0;
          for (let i = 0; i < rowTops.length; i++) {
            if (i === this.dragInfo.idx) continue;
            const center = rowTops[i] + rowHeights[i] / 2;
            if (draggedCenter > center) newIdx = i + 1;
          }
          if (newIdx > this.dragInfo.idx) newIdx--;
          const moved = this.factors.splice(this.dragInfo.idx, 1)[0];
          this.factors.splice(newIdx, 0, moved);
          this.render();
          if (this.onUpdate) this.onUpdate({ factors: [...this.factors] });
        })
    );

    row.exit().remove();

    const cellData = this.factors.flatMap((f, ridx) =>
      this.options.map((o, cidx) => ({
        ridx, cidx, fid: f.id, oid: o.id,
        score: (this.scores[f.id]?.[o.id] ?? 0)
      }))
    );

    const cells = this.gGrid.selectAll<SVGGElement, any>("g.cell")
      .data(cellData, (d: any) => `${d.fid}__${d.oid}`);

    const cellsEnter = cells.enter().append("g").attr("class", "cell");
    cellsEnter.append("rect").attr("class", "cell-bg").attr("fill", colors.grid);
    cellsEnter.append("rect").attr("class", "cell-pos").attr("fill", colors.pos);
    cellsEnter.append("rect").attr("class", "cell-neg").attr("fill", colors.neg);
    cellsEnter.append("rect").attr("class", "score-handle").style("cursor", "col-resize").attr("fill", "transparent");

    const all = cellsEnter.merge(cells);
    all.attr("transform", d => `translate(${colLefts[d.cidx]}, ${rowTops[d.ridx]})`);

    all.select("rect.cell-bg")
      .attr("x", 0)
      .attr("y", padding.row / 2)
      .attr("width", (_, i) => colWidths[cellData[i].cidx])
      .attr("height", d => rowHeights[d.ridx] - padding.row);

    all.each(function (d) {
      const g = select(this);
      const h = rowHeights[d.ridx] - padding.row;
      const y = padding.row / 2;
      const w = colWidths[d.cidx];
      const fracPos = (d.score + 1) / 2;
      const wPos = w * fracPos;
      const wNeg = w - wPos;

      g.select<SVGRectElement>("rect.cell-pos")
        .attr("x", 0)
        .attr("y", y + 1)
        .attr("width", Math.max(0, wPos - 1))
        .attr("height", Math.max(0, h - 2));

      g.select<SVGRectElement>("rect.cell-neg")
        .attr("x", wPos + 1)
        .attr("y", y + 1)
        .attr("width", Math.max(0, wNeg - 2))
        .attr("height", Math.max(0, h - 2));

      g.select<SVGRectElement>("rect.score-handle")
        .attr("x", wPos - 2.5)
        .attr("y", y + 1)
        .attr("width", 5)
        .attr("height", Math.max(0, h - 2));
    });

    all.select<SVGRectElement>("rect.score-handle").call(
      drag<any>()
        .on("start", (event, d) => {
          const g = select(event.sourceEvent.target.parentNode as SVGGElement);
          const w = colWidths[d.cidx];
          const fracPos = (d.score + 1) / 2;
          const wPos = w * fracPos;
          this.dragInfo = {
            type: "cell-score",
            startX: event.x,
            startWPos: wPos,
            w,
            d,
            g,
          };
        })
        .on("drag", (event) => {
          const delta = event.x - this.dragInfo.startX;
          let newWPos = Math.max(0, Math.min(this.dragInfo.w, this.dragInfo.startWPos + delta));
          this.dragInfo.g.select("rect.cell-pos").attr("width", newWPos - 1);
          this.dragInfo.g.select("rect.cell-neg").attr("x", newWPos + 1).attr("width", this.dragInfo.w - newWPos - 2);
          this.dragInfo.g.select("rect.score-handle").attr("x", newWPos - 2.5);
        })
        .on("end", () => {
          const newWPos = Number(this.dragInfo.g.select("rect.cell-pos").attr("width")) + 1;
          const newScore = 2 * (newWPos / this.dragInfo.w) - 1;
          this.updateScore(this.dragInfo.d.fid, this.dragInfo.d.oid, newScore);
          if (this.onUpdate) this.onUpdate({ scores: { ...this.scores } });
          this.render();
        })
    );

    cells.exit().remove();

    if (showWADD) {
      const waddScores = this.calculateWADDScores();
      const wadd = this.gWADD
        .selectAll<SVGGElement, Option>("g.wadd")
        .data(this.options, (d: any) => d.id);

      const waddEnter = wadd.enter()
        .append("g")
        .attr("class", "wadd");

      waddEnter.append("rect").attr("class", "wadd-bg").attr("rx", 6).attr("ry", 6);
      waddEnter.append("text")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .style("font-weight", 600)
        .style("fill", colors.headerFg);

      const waddAll = waddEnter.merge(wadd);
      waddAll.attr("transform", (_, i) => `translate(${colLefts[i]}, ${margin.top + innerH})`);
      waddAll.select("rect.wadd-bg")
        .attr("x", 0)
        .attr("y", 2)
        .attr("width", (_, i) => colWidths[i])
        .attr("height", 36)
        .attr("fill", colors.headerBg);
      waddAll.select("text")
        .attr("x", (_, i) => colWidths[i] / 2)
        .attr("y", 20)
        .text(d => `WADD: ${waddScores[d.id]}`);

      wadd.exit().remove();
    } else {
      this.gWADD.selectAll("*").remove();
    }

    const controls = this.gControls.selectAll<SVGGElement, any>("g.control").data([
      { type: "add-option", x: margin.left + innerW - 30, y: margin.top - HEADER_H - 10 },
      { type: "add-factor", x: 10, y: margin.top + innerH + (showWADD ? 36 : 0) - 10 }
    ]);

    const controlsEnter = controls.enter().append("g").attr("class", "control");
    controlsEnter.append("rect").attr("class", "control-bg").style("cursor", "pointer").attr("fill", "#4CAF50").attr("rx", 3);
    controlsEnter.append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-weight", 600)
      .style("fill", colors.headerFg)
      .text(d => d.type === "add-option" ? "+ Option" : "+ Factor");

    const controlsAll = controlsEnter.merge(controls);
    controlsAll.attr("transform", d => `translate(${d.x}, ${d.y})`);
    controlsAll.select("rect.control-bg")
      .attr("x", -40)
      .attr("y", -12)
      .attr("width", 80)
      .attr("height", 24);
    controlsAll.select("text")
      .attr("x", 0)
      .attr("y", 0);

    controlsAll.select("rect.control-bg").on("click", (event, d) => {
      if (d.type === "add-option" && this.options.length < MAX_CHOICES) {
        const newId = `o${this.options.length + 1}`;
        this.options.push({ id: newId, label: `Option ${this.options.length + 1}`, weight: 1.5 });
        this.factors.forEach(f => {
          this.scores[f.id] = this.scores[f.id] || {};
          this.scores[f.id][newId] = 0;
        });
        this.render();
        if (this.onUpdate) this.onUpdate({ options: [...this.options], scores: {...this.scores} });
      } else if (d.type === "add-factor") {
        const newId = `f${this.factors.length + 1}`;
        this.factors.push({ id: newId, label: `Factor ${this.factors.length + 1}`, weight: 1.5 });
        this.scores[newId] = {};
        this.options.forEach(o => {
          this.scores[newId][o.id] = 0;
        });
        this.render();
        if (this.onUpdate) this.onUpdate({ factors: [...this.factors], scores: {...this.scores} });
      }
    });

    controls.exit().remove();

    return this;
  }
}

export function likert5ToSigned(v: 1|2|3|4|5): number {
  return (v - 3) / 2;
}
