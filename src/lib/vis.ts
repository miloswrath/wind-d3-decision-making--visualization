// src/DecisionLayoutChart.ts
import { select, Selection } from "d3-selection";
import { scaleBand } from "d3-scale";
import { sum } from "d3-array";

export type Factor = { id: string; label: string; weight: number }; // weight controls row height
export type Option = { id: string; label: string };
export type Scores = Record<string, Record<string, number>>; // scores[factorId][optionId] in [-1, 1]

export type LayoutConfig = {
  width: number;
  height: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  padding?: { row: number; col: number };
  colors?: { pos: string; neg: string; headerBg: string; headerFg: string; grid: string };
  fontFamily?: string;
};

const DEFAULTS: Required<Omit<LayoutConfig, "width" | "height">> = {
  margin: { top: 48, right: 16, bottom: 32, left: 180 },
  padding: { row: 4, col: 4 },
  colors: {
    pos: "#04b254",   // light green
    neg: "#6b3b1f",   // dark brown
    headerBg: "#2f64b7",
    headerFg: "#ffffff",
    grid: "#d6dceb",
  },
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
};

export class DecisionLayoutChart {
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private gCols!: Selection<SVGGElement, unknown, null, undefined>;
  private gRows!: Selection<SVGGElement, unknown, null, undefined>;
  private gGrid!: Selection<SVGGElement, unknown, null, undefined>;

  private cfg: LayoutConfig & Required<Omit<LayoutConfig, "width" | "height">>;
  private factors: Factor[] = [];
  private options: Option[] = [];
  private scores: Scores = {};

  constructor(container: HTMLElement, cfg: LayoutConfig) {
    this.cfg = { ...cfg, ...DEFAULTS, margin: { ...DEFAULTS.margin, ...(cfg.margin || {}) },
                 padding: { ...DEFAULTS.padding, ...(cfg.padding || {}) },
                 colors: { ...DEFAULTS.colors, ...(cfg.colors || {}) },
                 fontFamily: cfg.fontFamily || DEFAULTS.fontFamily };

    this.svg = select(container)
      .append("svg")
      .attr("width", this.cfg.width)
      .attr("height", this.cfg.height)
      .style("font-family", this.cfg.fontFamily);

    // layers
    this.gCols = this.svg.append("g").attr("class", "dl-cols");
    this.gRows = this.svg.append("g").attr("class", "dl-rows");
    this.gGrid = this.svg.append("g").attr("class", "dl-grid");
  }

  /** set data */
  data(input: { factors: Factor[]; options: Option[]; scores: Scores }) {
    this.factors = input.factors;
    this.options = input.options;
    this.scores = input.scores;
    return this;
  }

  /** update a single score, clamped to [-1,1] */
  updateScore(factorId: string, optionId: string, score: number) {
    const s = Math.max(-1, Math.min(1, score));
    if (!this.scores[factorId]) this.scores[factorId] = {} as any;
    this.scores[factorId][optionId] = s;
    return this;
  }

  /** render or re-render */
  render() {
    const { width, height, margin, colors, padding } = this.cfg;
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const ROW_GAP = Math.max(2, padding.row); // small vertical gap between factor bands

    // ----- scales
    // X: options across columns
    const x = scaleBand<string>()
      .domain(this.options.map(o => o.id))
      .range([margin.left, margin.left + innerW])
      .paddingInner(0.08)
      .paddingOuter(0);

    // Y: weighted rows with a minimum pixel height per row (keeps factor band readable)
    const MIN_ROW_PX = 28;
    const weights = this.factors.map(f => Math.max(0, f.weight));
    const totalW = Math.max(1e-6, sum(weights));
    const baseH = MIN_ROW_PX * (this.factors.length || 0);
    const freeH = Math.max(0, innerH - baseH);
    // If not enough space, compress uniformly
    const compress = baseH > innerH ? innerH / Math.max(1, baseH) : 1;
    const rowHeights: number[] = this.factors.map((_f, i) =>
      (MIN_ROW_PX + (freeH * (weights[i] / totalW))) * compress
    );
    const rowTops: number[] = [];
    rowHeights.reduce((acc, h, i) => { rowTops[i] = margin.top + acc; return acc + h; }, 0);

    // ----- column headers
    const HEADER_H = 36;
    const col = this.gCols
      .selectAll<SVGGElement, Option>("g.col")
      .data(this.options, (d: any) => d.id);

    const colEnter = col.enter()
      .append("g")
      .attr("class", "col");

    colEnter.append("rect").attr("rx", 6).attr("ry", 6);
    colEnter.append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-weight", 700)
      .style("fill", colors.headerFg);

    const colAll = colEnter.merge(col as any);
    colAll.attr("transform", d => `translate(${(x(d.id) ?? 0) + (x.bandwidth() / 2)}, ${margin.top - HEADER_H})`);
    colAll.select("rect")
      .attr("x", -(x.bandwidth() / 2))
      .attr("y", 0-2)
      .attr("width", x.bandwidth())
      .attr("height", HEADER_H)
      .attr("fill", colors.headerBg);
    colAll.select("text")
      .attr("y", HEADER_H / 2)
      .text(d => d.label);

    col.exit().remove();

    // ----- row headers (labels + background bands)
    const row = this.gRows
      .selectAll<SVGGElement, Factor>("g.row")
      .data(this.factors, (d: any) => d.id);

    const rowEnter = row.enter().append("g").attr("class", "row");
    rowEnter.append("rect").attr("class", "row-bg").attr("rx", 6).attr("ry", 6);
    rowEnter.append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-weight", 600)
      .style("fill", colors.headerFg)
      .style("pointer-events", "none");

    const rowAll = rowEnter.merge(row as any);
    rowAll.attr("transform", (_d, i) => `translate(0, ${rowTops[i]})`);
    rowAll.select("rect.row-bg")
      .attr("x", 0)
      .attr("width", margin.left-5)
      .attr("height", (_d, i) => Math.max(0, rowHeights[i]))
      .attr("y", ROW_GAP / 2)
      .attr("height", (_d, i) => Math.max(0, rowHeights[i] - ROW_GAP))
      .attr("fill", colors.headerBg); // match column header background

    rowAll.select("text")
      .attr("x", margin.left / 2)
      .attr("y", (_d, i) => rowHeights[i] / 2)
      .text(d => d.label);

    row.exit().remove();

    // ----- grid cells
    // one group per (factor, option)
    const cellData = this.factors.flatMap((f, i) =>
      this.options.map(o => ({
        ridx: i, cidx: o.id, fid: f.id, oid: o.id,
        score: (this.scores[f.id]?.[o.id] ?? 0)
      }))
    );

    const cells = this.gGrid.selectAll<SVGGElement, any>("g.cell")
      .data(cellData, (d: any) => `${d.fid}__${d.oid}`);

    const cellsEnter = cells.enter().append("g").attr("class", "cell");
    // background
    cellsEnter.append("rect").attr("class", "cell-bg").attr("fill", colors.grid);
    // positive & negative bars
    cellsEnter.append("rect").attr("class", "cell-pos").attr("fill", colors.pos);
    cellsEnter.append("rect").attr("class", "cell-neg").attr("fill", colors.neg);

    const all = cellsEnter.merge(cells as any);
    all.attr("transform", d => `translate(${x(d.oid) ?? 0}, ${rowTops[d.ridx]})`);

    all.select("rect.cell-bg")
      .attr("x", 0)
      .attr("y", padding.row / 2)
      .attr("width", x.bandwidth())
      .attr("height", d => Math.max(0, rowHeights[d.ridx] - padding.row));

    // split fill horizontally by score in [-1,1]
    all.each(function(d) {
      const g = select(this);
      const h = Math.max(0, rowHeights[d.ridx] - padding.row);
      const y = padding.row / 2;
      const w = x.bandwidth();
      const fracPos = (d.score + 1) / 2; // 0..1
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
    });

    cells.exit().remove();

    return this;
  }
}

// Handy mapper for a 1–5 response to [-1,1]
export function likert5ToSigned(v: 1|2|3|4|5): number {
  return (v - 3) / 2; // 1→-1, 3→0, 5→+1
}
