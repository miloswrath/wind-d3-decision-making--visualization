import { select, Selection } from "d3-selection";
import { scaleBand } from "d3-scale";
import { sum } from "d3-array";
import { drag } from "d3-drag";
import { transition } from "d3";

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
  neutralCellColors?: { pos: string; neg: string };
  markCellsOnClick?: boolean;
  onScoreEdit?: (factorId: string, optionId: string) => void;
};

const DEFAULTS: Required<Omit<LayoutConfig, "width" | "height">> = {
  margin: { top: 48, right: 16, bottom: 32, left: 180 },
  padding: { row: 8, col: 15 },
  colors: {
    pos: "#04b254",
    neg: "#6b3b1f",
    headerBg: "#2f64b7",
    headerFg: "#ffffff",
    grid: "#d6dceb",
  },
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  showWADD: false,
  neutralCellColors: {
    pos: "#8a93a9",
    neg: "#3d4254",
  },
  markCellsOnClick: false,
  onScoreEdit: undefined,
};

type ChartDataInput = {
  factors: Factor[];
  options: Option[];
  scores: Scores;
  modified?: Iterable<string>;
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
  private onScoreEdit?: (factorId: string, optionId: string) => void;
  private dragInfo: any = {};
  private updatePending = false;
  private editingId: string | null = null;
  private modifiedCells = new Set<string>();

  constructor(container: HTMLElement, cfg: LayoutConfig) {
    this.cfg = { ...cfg, ...DEFAULTS, margin: { ...DEFAULTS.margin, ...(cfg.margin || {}) },
                 padding: { ...DEFAULTS.padding, ...(cfg.padding || {}) },
                 colors: { ...DEFAULTS.colors, ...(cfg.colors || {}) },
                 fontFamily: cfg.fontFamily || DEFAULTS.fontFamily,
                 showWADD: cfg.showWADD ?? DEFAULTS.showWADD,
                 neutralCellColors: { ...DEFAULTS.neutralCellColors, ...(cfg.neutralCellColors || {}) },
                 markCellsOnClick: cfg.markCellsOnClick ?? DEFAULTS.markCellsOnClick,
                 onScoreEdit: cfg.onScoreEdit };
    this.onUpdate = cfg.onUpdate;
    this.onScoreEdit = cfg.onScoreEdit;

    this.svg = select(container)
      .append("svg")
      .style("font-family", this.cfg.fontFamily);

    this.gCols = this.svg.append("g").attr("class", "dl-cols");
    this.gRows = this.svg.append("g").attr("class", "dl-rows");
    this.gGrid = this.svg.append("g").attr("class", "dl-grid");
    this.gWADD = this.svg.append("g").attr("class", "dl-wadd");
    this.gControls = this.svg.append("g").attr("class", "dl-controls");
  }

  setSize(width: number, height: number) {
    this.cfg.width = width;
    this.cfg.height = height;
    this.svg.attr("width", width).attr("height", height);
    return this;
  }

  setShowWADD(show: boolean) {
    this.cfg.showWADD = show;
    return this;
  }

  data(input: ChartDataInput) {
    this.factors = input.factors;
    this.options = input.options;
    this.scores = input.scores;
    this.syncModifiedCells(input.modified);
    return this;
  }

  updateScore(factorId: string, optionId: string, score: number) {
    const s = Math.max(-1, Math.min(1, score));
    if (!this.scores[factorId]) this.scores[factorId] = {} as any;
    this.scores[factorId][optionId] = s;
    const key = this.cellKey(factorId, optionId);
    this.modifiedCells.add(key);
    if (this.onScoreEdit) this.onScoreEdit(factorId, optionId);
    return this;
  }

  private calculateWADDScores(): Record<string, number> {
    const waddScores: Record<string, number> = {};
    this.options.forEach(option => {
      let weightedTotal = 0;
      let weightSum = 0;
      const optionWeight = Math.max(0, option.weight);

      this.factors.forEach(factor => {
        const factorWeight = Math.max(0, factor.weight);
        if (!factorWeight || !optionWeight) return;

        const rawScore = this.scores[factor.id]?.[option.id] ?? 0;
        const clamped = Math.max(-1, Math.min(1, rawScore));
        const normalizedUtility = (clamped + 1) / 2; // map [-1,1] → [0,1]
        const combinedWeight = factorWeight * optionWeight;

        weightedTotal += combinedWeight * normalizedUtility;
        weightSum += combinedWeight;
      });

      const normalized = weightSum ? weightedTotal / weightSum : 0;
      const scaled = normalized * 10;
      waddScores[option.id] = Number(scaled.toFixed(2));
    });
    return waddScores;
  }

  private cellKey(fid: string, oid: string) {
    return `${fid}__${oid}`;
  }

  private syncModifiedCells(modified?: Iterable<string>) {
    const valid = new Set<string>();
    this.factors.forEach(f => {
      this.options.forEach(o => valid.add(this.cellKey(f.id, o.id)));
    });
    if (modified) {
      const next = new Set<string>();
      for (const key of modified) {
        if (valid.has(key)) next.add(key);
      }
      this.modifiedCells = next;
    } else {
      this.modifiedCells = new Set(Array.from(this.modifiedCells).filter(key => valid.has(key)));
    }
  }

  render() {
    const { width: initialWidth, height: initialHeight, margin, colors, padding, onUpdate, showWADD, neutralCellColors, markCellsOnClick } = this.cfg;
    const ROW_GAP = Math.max(2, padding.row);
    const COL_GAP = Math.max(2, padding.col);
    const MAX_ITEMS = 5;

    const CONTROL_WIDTH = 44;
    const CONTROL_HEIGHT = 36;
    const CONTROL_GAP = 8;
    const WADD_HEIGHT = showWADD ? 36 : 0;

    const innerWidthAllowance = Math.max(80, initialWidth - margin.left - margin.right - CONTROL_WIDTH - CONTROL_GAP);
    const innerHeightAllowance = Math.max(80, initialHeight - margin.top - margin.bottom - CONTROL_HEIGHT - CONTROL_GAP - WADD_HEIGHT);

    const MIN_ROW_PX = 28;
    const rowWeights = this.factors.map(f => Math.max(0, f.weight));
    const totalRowW = Math.max(1e-6, sum(rowWeights));
    const baseRowH = MIN_ROW_PX * this.factors.length;
    const freeRowH = Math.max(0, innerHeightAllowance - baseRowH);
    const rowCompress = baseRowH > innerHeightAllowance ? innerHeightAllowance / baseRowH : 1;
    let rowHeights: number[] = this.factors.map((_, i) =>
      (MIN_ROW_PX + (freeRowH * (rowWeights[i] / totalRowW))) * rowCompress
    );
    const totalRowHeight = rowHeights.reduce((acc, h) => acc + h, 0);
    if (totalRowHeight > innerHeightAllowance) {
      const scale = innerHeightAllowance / totalRowHeight;
      rowHeights = rowHeights.map(h => h * scale);
    }
    const rowTops: number[] = [margin.top];
    for (let i = 1; i < rowHeights.length; i++) {
      rowTops[i] = rowTops[i - 1] + rowHeights[i - 1];
    }

    const MIN_COL_PX = 120;
    const colWeights = this.options.map(o => Math.max(0, o.weight));
    const totalColW = Math.max(1e-6, sum(colWeights));
    const baseColW = MIN_COL_PX * this.options.length;
    const freeColW = Math.max(0, innerWidthAllowance - baseColW);
    const colCompress = baseColW > innerWidthAllowance ? innerWidthAllowance / baseColW : 1;
    let colBaseWidths: number[] = this.options.map((_, i) =>
      (MIN_COL_PX + (freeColW * (colWeights[i] / totalColW))) * colCompress
    );
    let colWidths: number[] = colBaseWidths.map(w => w + COL_GAP);
    const totalColWidth = colWidths.reduce((acc, w) => acc + w, 0);
    if (totalColWidth > innerWidthAllowance) {
      const colScale = innerWidthAllowance / totalColWidth;
      colWidths = colWidths.map(w => w * colScale);
    }
    const colLefts: number[] = [margin.left];
    for (let i = 1; i < colWidths.length; i++) {
      colLefts[i] = colLefts[i - 1] + colWidths[i - 1];
    }

    this.svg.attr("width", initialWidth).attr("height", initialHeight);

    const HEADER_H = 36;
    const col = this.gCols
      .selectAll<SVGGElement, Option>("g.col")
      .data(this.options, (d: any) => d.id);

    const colEnter = col.enter()
      .append("g")
      .attr("class", "col");

    colEnter.append("rect").attr("class", "header-bg").attr("rx", 6).attr("ry", 6);
    colEnter.append("text")
      .attr("class", "header-text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-weight", 700)
      .style("fill", colors.headerFg);
    colEnter.append("foreignObject").attr("class", "header-input");
    colEnter.append("text").attr("class", "remove-btn")
      .style("cursor", "pointer")
      .style("fill", colors.headerFg)
      .text("×");

    const colAll = colEnter.merge(col);
    const t = transition().duration(150);

    colAll.transition(t).attr("transform", (_, i) => `translate(${colLefts[i]}, ${margin.top - HEADER_H})`);
    colAll.select("rect.header-bg")
      .transition(t)
      .attr("x", COL_GAP / 2)
      .attr("y", -2)
      .attr("width", (_, i) => colWidths[i] - COL_GAP)
      .attr("height", HEADER_H)
      .attr("fill", colors.headerBg);
    const headerText = colAll.select("text.header-text")
      .text(d => d.label)
      .style("pointer-events", "auto")
      .on("dblclick", (event, d) => {
        if (this.editingId) return;
        this.editingId = d.id;
        this.render();
      });
    headerText.transition(t)
      .attr("x", (_, i) => colWidths[i] / 2 - 10)
      .attr("y", HEADER_H / 2);

    const headerInput = colAll.select("foreignObject.header-input")
      .style("display", d => this.editingId === d.id ? "block" : "none")
      .html(d => `
        <input type="text" value="${d.label}" style="width:100%; height:100%; background:#1a2a5e; color:#fff; border:1px solid #3f51b5; border-radius:4px; padding:0 4px;" />
      `);
    headerInput.transition(t)
      .attr("x", COL_GAP / 2 + 10)
      .attr("y", -2)
      .attr("width", (_, i) => colWidths[i] - COL_GAP - 20)
      .attr("height", HEADER_H);
    headerInput.on("blur", (event, d) => {
        const input = (event.target as HTMLElement).querySelector("input")!;
        const newLabel = input.value.trim() || d.label;
        this.options = this.options.map(o => o.id === d.id ? { ...o, label: newLabel } : o);
        this.editingId = null;
        this.render();
        if (this.onUpdate) this.onUpdate({ options: [...this.options] });
      })
      .select("input")
      .on("keypress", (event, d) => {
        if (event.key === "Enter") {
          const input = event.target as HTMLInputElement;
          const newLabel = input.value.trim() || d.label;
          this.options = this.options.map(o => o.id === d.id ? { ...o, label: newLabel } : o);
          this.editingId = null;
          this.render();
          if (this.onUpdate) this.onUpdate({ options: [...this.options] });
        }
      });
    colAll.select("text.remove-btn")
      .attr("x", (_, i) => colWidths[i] - COL_GAP / 2 - 20)
      .attr("y", HEADER_H / 2)
      .attr("text-anchor", "middle")
      .style("font-size", "16px")
      .style("font-weight", "bold")
      .on("click", (event, d) => {
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
        if (this.onUpdate) this.onUpdate({ options: [...this.options], scores: { ...this.scores } });
      });

    colAll.select<SVGRectElement>("rect.header-bg").style("cursor", "move").call(
      drag<Option>()
        .on("start", (event, d) => {
          const g = select(event.sourceEvent.target.parentNode as SVGGElement);
          g.raise();
          const idx = this.options.findIndex(o => o.id === d.id);
          this.dragInfo = {
            type: "col-reorder",
            startX: event.x,
            idx,
            origLeft: colLefts[idx],
            newIdx: idx,
          } as any;
        })
        .on("drag", (event) => {
          const g = select(event.sourceEvent.target.parentNode as SVGGElement);
          const translateX = this.dragInfo.origLeft + event.x - this.dragInfo.startX;
          g.attr("transform", `translate(${translateX}, ${margin.top - HEADER_H})`);
          const draggedCenter = translateX + colWidths[this.dragInfo.idx] / 2;
          let newIdx = 0;
          for (let i = 0; i < colLefts.length; i++) {
            if (i === this.dragInfo.idx) continue;
            const center = colLefts[i] + colWidths[i] / 2;
            if (draggedCenter > center) newIdx = i + 1;
          }
          if (newIdx > this.dragInfo.idx) newIdx--;
          if (newIdx !== this.dragInfo.newIdx) {
            this.dragInfo.newIdx = newIdx;
            this.gCols
              .selectAll<SVGGElement, Option>("g.col")
              .filter((_, i) => i !== this.dragInfo.idx)
              .transition().duration(150)
              .attr("transform", (d, i) => {
                let x = colLefts[i];
                if (i > this.dragInfo.idx && i <= newIdx) x -= colWidths[this.dragInfo.idx];
                else if (i < this.dragInfo.idx && i >= newIdx) x += colWidths[this.dragInfo.idx];
                return `translate(${x}, ${margin.top - HEADER_H})`;
              });
          }
        })
        .on("end", () => {
          const finalIdx = this.dragInfo.newIdx;
          const moved = this.options.splice(this.dragInfo.idx, 1)[0];
          this.options.splice(finalIdx, 0, moved);
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
    rowEnter.append("text")
      .attr("class", "row-text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-weight", 600)
      .style("fill", colors.headerFg);
    rowEnter.append("foreignObject").attr("class", "row-input");
    rowEnter.append("rect").attr("class", "resize-handle").style("cursor", "row-resize").attr("fill", "transparent");
    rowEnter.append("text").attr("class", "remove-btn")
      .style("cursor", "pointer")
      .style("fill", colors.headerFg)
      .text("×");

    const rowAll = rowEnter.merge(row);
    rowAll.transition(t).attr("transform", (_, i) => `translate(0, ${rowTops[i]})`);
    rowAll.select("rect.row-bg")
      .transition(t)
      .attr("x", 0)
      .attr("width", margin.left - 5)
      .attr("y", ROW_GAP / 2)
      .attr("height", (_, i) => rowHeights[i] - ROW_GAP)
      .attr("fill", colors.headerBg)
      .style("cursor", "move");
    rowAll.select("text.row-text")
      .attr("x", margin.left / 2 - 10)
      .attr("y", (_, i) => rowHeights[i] / 2)
      .text(d => d.label)
      .style("pointer-events", "auto")
      .on("dblclick", (event, d) => {
        if (this.editingId) return;
        this.editingId = d.id;
        this.render();
      });
    rowAll.select("foreignObject.row-input")
      .attr("x", 10)
      .attr("y", ROW_GAP / 2)
      .attr("width", margin.left - 25)
      .attr("height", (_, i) => rowHeights[i] - ROW_GAP)
      .style("display", d => this.editingId === d.id ? "block" : "none")
      .html(d => `
        <input type="text" value="${d.label}" style="width:100%; height:100%; background:#1a2a5e; color:#fff; border:1px solid #3f51b5; border-radius:4px; padding:0 4px;" />
      `)
      .on("blur", (event, d) => {
        const input = (event.target as HTMLElement).querySelector("input")!;
        const newLabel = input.value.trim() || d.label;
        this.factors = this.factors.map(f => f.id === d.id ? { ...f, label: newLabel } : f);
        this.editingId = null;
        this.render();
        if (this.onUpdate) this.onUpdate({ factors: [...this.factors] });
      })
      .select("input")
      .on("keypress", (event, d) => {
        if (event.key === "Enter") {
          const input = event.target as HTMLInputElement;
          const newLabel = input.value.trim() || d.label;
          this.factors = this.factors.map(f => f.id === d.id ? { ...f, label: newLabel } : f);
          this.editingId = null;
          this.render();
          if (this.onUpdate) this.onUpdate({ factors: [...this.factors] });
        }
      });
    rowAll.select("rect.resize-handle")
      .attr("x", 0)
      .attr("width", margin.left - 5)
      .attr("y", (_, i) => rowHeights[i] - 8)
      .attr("height", 16);
    rowAll.select("text.remove-btn")
      .attr("x", margin.left - 15)
      .attr("y", (_, i) => rowHeights[i] / 2)
      .attr("text-anchor", "middle")
      .style("font-size", "16px")
      .style("font-weight", "bold")
      .on("click", (event, d) => {
        this.factors = this.factors.filter(f => f.id !== d.id);
        const newScores: Scores = {};
        this.factors.forEach(f => {
          newScores[f.id] = { ...this.scores[f.id] };
        });
        this.scores = newScores;
        this.render();
        if (this.onUpdate) this.onUpdate({ factors: [...this.factors], scores: { ...this.scores } });
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
          const g = select(event.sourceEvent.target.parentNode as SVGGElement);
          g.raise();
          const idx = this.factors.findIndex(f => f.id === d.id);
          this.dragInfo = {
            type: "row-reorder",
            startY: event.y,
            idx,
            origTop: rowTops[idx],
            newIdx: idx,
          } as any;
        })
        .on("drag", (event) => {
          const g = select(event.sourceEvent.target.parentNode as SVGGElement);
          const translateY = this.dragInfo.origTop + event.y - this.dragInfo.startY;
          g.attr("transform", `translate(0, ${translateY})`);
          const draggedCenter = translateY + rowHeights[this.dragInfo.idx] / 2;
          let newIdx = 0;
          for (let i = 0; i < rowTops.length; i++) {
            if (i === this.dragInfo.idx) continue;
            const center = rowTops[i] + rowHeights[i] / 2;
            if (draggedCenter > center) newIdx = i + 1;
          }
          if (newIdx > this.dragInfo.idx) newIdx--;
          if (newIdx !== this.dragInfo.newIdx) {
            this.dragInfo.newIdx = newIdx;
            this.gRows
              .selectAll<SVGGElement, Factor>("g.row")
              .filter((_, i) => i !== this.dragInfo.idx)
              .transition().duration(150)
              .attr("transform", (d, i) => {
                let y = rowTops[i];
                if (i > this.dragInfo.idx && i <= newIdx) y -= rowHeights[this.dragInfo.idx];
                else if (i < this.dragInfo.idx && i >= newIdx) y += rowHeights[this.dragInfo.idx];
                return `translate(0, ${y})`;
              });
          }
        })
        .on("end", () => {
          const finalIdx = this.dragInfo.newIdx;
          const moved = this.factors.splice(this.dragInfo.idx, 1)[0];
          this.factors.splice(finalIdx, 0, moved);
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
    this.syncModifiedCells();

    const cells = this.gGrid.selectAll<SVGGElement, any>("g.cell")
      .data(cellData, (d: any) => `${d.fid}__${d.oid}`);

    const cellsEnter = cells.enter().append("g").attr("class", "cell");
    cellsEnter.append("rect").attr("class", "cell-bg").attr("fill", colors.grid).attr("rx", 6).attr("ry", 6);
    cellsEnter.append("rect").attr("class", "cell-pos").attr("fill", neutralCellColors.pos);
    cellsEnter.append("rect").attr("class", "cell-neg").attr("fill", neutralCellColors.neg);
    cellsEnter.append("rect").attr("class", "score-handle").style("cursor", "col-resize").attr("fill", "transparent");

    const all = cellsEnter.merge(cells);
    const chartInstance = this;
    all.transition(t).attr("transform", d => `translate(${colLefts[d.cidx]}, ${rowTops[d.ridx]})`);

    all.select("rect.cell-bg")
      .transition(t)
      .attr("x", COL_GAP / 2)
      .attr("y", ROW_GAP / 2)
      .attr("width", d => colWidths[d.cidx] - COL_GAP)
      .attr("height", d => rowHeights[d.ridx] - ROW_GAP);

    all.each((d, i, nodes) => {
      const g = select(nodes[i] as SVGGElement);
      const h = rowHeights[d.ridx] - ROW_GAP;
      const y = ROW_GAP / 2;
      const w = colWidths[d.cidx] - COL_GAP;
      const x0 = COL_GAP / 2;
      const fracPos = (d.score + 1) / 2;
      const wPos = w * fracPos;
      const wNeg = w - wPos;
      const key = chartInstance.cellKey(d.fid, d.oid);
      const isModified = chartInstance.modifiedCells.has(key);
      const posFill = isModified ? colors.pos : neutralCellColors.pos;
      const negFill = isModified ? colors.neg : neutralCellColors.neg;

      g.select<SVGRectElement>("rect.cell-pos")
        .transition(t)
        .attr("x", x0 + 1)
        .attr("y", y + 1)
        .attr("width", Math.max(0, wPos - 1))
        .attr("height", Math.max(0, h - 2))
        .attr("fill", posFill);

      g.select<SVGRectElement>("rect.cell-neg")
        .transition(t)
        .attr("x", x0 + wPos + 1)
        .attr("y", y + 1)
        .attr("width", Math.max(0, wNeg - 2))
        .attr("height", Math.max(0, h - 2))
        .attr("fill", negFill);

      g.select<SVGRectElement>("rect.score-handle")
        .transition(t)
        .attr("x", x0 + wPos - 2.5)
        .attr("y", y + 1)
        .attr("width", 5)
        .attr("height", Math.max(0, h - 2));
    });

    all.select<SVGRectElement>("rect.score-handle").call(
      drag<any>()
        .on("start", (event, d) => {
          const g = select(event.sourceEvent.target.parentNode as SVGGElement);
          const w = colWidths[d.cidx] - COL_GAP;
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
          this.dragInfo.g
            .select("rect.cell-neg")
            .attr("x", COL_GAP / 2 + newWPos + 1)
            .attr("width", this.dragInfo.w - newWPos - 2);
          this.dragInfo.g.select("rect.score-handle").attr("x", COL_GAP / 2 + newWPos - 2.5);

          const newScore = 2 * (newWPos / this.dragInfo.w) - 1;
          this.updateScore(this.dragInfo.d.fid, this.dragInfo.d.oid, newScore);
          this.dragInfo.g.select<SVGRectElement>("rect.cell-pos").attr("fill", colors.pos);
          this.dragInfo.g.select<SVGRectElement>("rect.cell-neg").attr("fill", colors.neg);
          if (showWADD) {
            const waddScores = this.calculateWADDScores();
            this.gWADD
              .selectAll<SVGGElement, Option>("g.wadd")
              .select("text")
              .text(d => `WADD: ${waddScores[d.id].toFixed(1)}/10`);
          }
        })
        .on("end", () => {
          const newWPos = Number(this.dragInfo.g.select("rect.cell-pos").attr("width")) + 1;
          const newScore = 2 * (newWPos / this.dragInfo.w) - 1;
          this.updateScore(this.dragInfo.d.fid, this.dragInfo.d.oid, newScore);
          if (this.onUpdate) this.onUpdate({ scores: { ...this.scores } });
          this.render();
        })
    );

    if (markCellsOnClick) {
      all.on("mousedown.cellmark", (event, d) => {
        const key = chartInstance.cellKey(d.fid, d.oid);
        if (!chartInstance.modifiedCells.has(key)) {
          chartInstance.modifiedCells.add(key);
          if (chartInstance.onScoreEdit) {
            chartInstance.onScoreEdit(d.fid, d.oid);
          }
          const g = select(event.currentTarget as SVGGElement);
          g.select<SVGRectElement>("rect.cell-pos").attr("fill", colors.pos);
          g.select<SVGRectElement>("rect.cell-neg").attr("fill", colors.neg);
        }
      });
    } else {
      all.on("mousedown.cellmark", null);
    }

    cells.exit().remove();

    const innerH = rowHeights.reduce((acc, h) => acc + h, 0);
    const contentBottom = margin.top + innerH;
    const waddY = contentBottom + (innerH > 0 ? CONTROL_GAP : 0);

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
      waddAll.transition(t).attr("transform", (_, i) => `translate(${colLefts[i]}, ${waddY})`);
      waddAll.select("rect.wadd-bg")
        .transition(t)
        .attr("x", COL_GAP / 2)
        .attr("y", 2)
        .attr("width", (_, i) => colWidths[i] - COL_GAP)
        .attr("height", 36)
        .attr("fill", colors.headerBg);
      waddAll.select("text")
        .transition(t)
        .attr("x", (_, i) => colWidths[i] / 2)
        .attr("y", 20)
        .text(d => `WADD: ${waddScores[d.id].toFixed(1)}/10`);

      wadd.exit().remove();
    } else {
      this.gWADD.selectAll("*").remove();
    }

    const controls = this.gControls.selectAll<SVGGElement, string>("g.control")
      .data(this.options.length < MAX_ITEMS ? ["add-option"] : [], d => d);

    const controlsEnter = controls.enter().append("g").attr("class", "control");
    controlsEnter.append("rect")
      .attr("fill", colors.headerBg)
      .attr("rx", 6)
      .attr("ry", 6)
      .style("cursor", "pointer");
    controlsEnter.append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("fill", colors.headerFg)
      .style("font-weight", 600)
      .style("cursor", "pointer")
      .text("+");

    const controlsAll = controlsEnter.merge(controls);
    controlsAll.attr("transform", () => {
      const x = initialWidth - margin.right - CONTROL_WIDTH;
      return `translate(${x}, ${margin.top - HEADER_H})`;
    });
    controlsAll.select("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", CONTROL_WIDTH)
      .attr("height", CONTROL_HEIGHT);
    controlsAll.select("text")
      .attr("x", CONTROL_WIDTH / 2)
      .attr("y", CONTROL_HEIGHT / 2);
    controlsAll.on("click", () => {
      if (this.options.length >= MAX_ITEMS) return;
      const newId = `o${Date.now()}`;
      this.options.push({ id: newId, label: `Option ${this.options.length + 1}`, weight: 1.5 });
      this.scores = { ...this.scores };
      this.factors.forEach(f => {
        this.scores[f.id] = { ...this.scores[f.id], [newId]: 0 };
      });
      this.render();
      if (this.onUpdate) this.onUpdate({ options: [...this.options], scores: { ...this.scores } });
    });

    controls.exit().remove();

    const factorControls = this.gControls.selectAll<SVGGElement, string>("g.factor-control")
      .data(this.factors.length < MAX_ITEMS ? ["add-factor"] : [], d => d);

    const factorControlsEnter = factorControls.enter().append("g").attr("class", "factor-control");
    factorControlsEnter.append("rect")
      .attr("fill", colors.headerBg)
      .attr("rx", 6)
      .attr("ry", 6)
      .style("cursor", "pointer");
    factorControlsEnter.append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("fill", colors.headerFg)
      .style("font-weight", 600)
      .style("cursor", "pointer")
      .text("+");

    const factorControlsAll = factorControlsEnter.merge(factorControls);
    const factorControlY = waddY + (showWADD ? WADD_HEIGHT + CONTROL_GAP : CONTROL_GAP);
    const clampedFactorY = Math.min(factorControlY, initialHeight - margin.bottom - CONTROL_HEIGHT);
    factorControlsAll.attr("transform", () => `translate(0, ${clampedFactorY})`);
    factorControlsAll.select("rect")
      .attr("x", 0)
      .attr("width", Math.max(60, margin.left - 5))
      .attr("y", 0)
      .attr("height", CONTROL_HEIGHT);
    factorControlsAll.select("text")
      .attr("x", Math.max(60, margin.left - 5) / 2)
      .attr("y", CONTROL_HEIGHT / 2);
    factorControlsAll.on("click", () => {
      if (this.factors.length >= MAX_ITEMS) return;
      const newId = `f${Date.now()}`;
      this.factors.push({ id: newId, label: `Factor ${this.factors.length + 1}`, weight: 1.5 });
      this.scores[newId] = {};
      this.options.forEach(o => {
        this.scores[newId][o.id] = 0;
      });
      this.render();
      if (this.onUpdate) this.onUpdate({ factors: [...this.factors], scores: { ...this.scores } });
    });

    factorControls.exit().remove();

    return this;
  }
}

export function likert5ToSigned(v: 1|2|3|4|5): number {
  return (v - 3) / 2;
}
