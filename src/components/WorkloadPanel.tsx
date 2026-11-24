import { useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { WorkloadRow } from '../lib/api';

interface WorkloadPanelProps {
  rows: WorkloadRow[];
}

const BAR_COLOR = '#4a5d7a'; // neutral slate: people, not a tipologia, so neither AU green nor AC blue — recharts fills need a literal, custom props don't resolve in every renderer
const CURVE_COLOR = '#1a2233'; // var(--ink) — distinct from the bars so the fitted curve reads as an overlay, not another bar
const PICK_COLOR = '#c08419'; // var(--pick): the person being looked up: amber, the one hue not already used by bars/curve/mean

// Past this many people, 1-bar-per-person stops being readable (fits the skill's own
// "more than ~7 classes -> table, or table+chart" rule) — lead with the distribution instead.
const DISTRIBUTION_THRESHOLD = 20;
const MAX_BINS = 14;
const NICE_STEPS = [0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50];
const round4 = (v: number) => Number(v.toFixed(4)); // strips float noise (0.30000000000000004) from bin edges
const DIST_MARGIN = { top: 26, right: 20, bottom: 4, left: 4 };
const DIST_YAXIS_WIDTH = 34;
const SUBSTEPS = 10; // curve resolution: rows per bin, so bin centres land exactly on a row
// rows drawn before "Mostra tutte": the scroll box shows ~10, and laying out all ~560 rows cost ~150 ms on every open
const ROW_LIMIT = 50;

const fmt = (v: number, digits = 1) => v.toLocaleString('it-IT', { maximumFractionDigits: digits });
// loads are a share of every visit on the calendar, so most sit well under 1%: two decimals keep them apart
const fmtPct = (ratio: number) => `${fmt(ratio * 100, 2)}%`;

interface DistRow {
  x: number;
  count: number | null; // only on bin-centre rows, so bars sit exactly on their bin
  curve: number | null;
}

interface Distribution {
  rows: DistRow[];
  step: number;
  lo: number;
  hi: number;
  binCounts: number[];
  binOf: (x: number) => number; // index of the bin holding load x (%), float-safe at the edges
  yMax: number;
  ticks: number[];
  n: number;
  mean: number;
  stddev: number;
  min: number;
  max: number;
  fitCurve: boolean;
  curveAt: (x: number) => number | null;
}

/** Histogram of the ratios, binned to the data's own range (not a fixed 0-100 grid) with a "nice"
 * bin width, plus the fitted normal curve sampled finely (SUBSTEPS rows per bin) so it renders smooth
 * while the bars stay one per bin. The curve is expected-count-per-bin: n * step * pdf(x). */
function buildDistribution(rows: WorkloadRow[]): Distribution {
  const values = rows.map((r) => r.ratio * 100);
  const n = values.length;
  const min = n ? Math.min(...values) : 0;
  const max = n ? Math.max(...values) : 0;

  // bin width from the data's own spread (loads can all sit under 2%), edges snapped to multiples of it
  const step = NICE_STEPS.find((s) => Math.floor(max / s) - Math.floor(min / s) + 1 <= MAX_BINS) ?? 50;
  const lo = round4(Math.floor(min / step) * step);
  const binTotal = Math.max(Math.floor(max / step) - Math.floor(min / step) + 1, 1);
  const hiEdge = round4(lo + binTotal * step);
  // the epsilon keeps a value sitting on an edge (0.3 with step 0.1) out of the bin below, despite float error
  const binOf = (x: number) => Math.min(Math.max(Math.floor((x - lo) / step + 1e-9), 0), binTotal - 1);

  const binCounts = new Array<number>(binTotal).fill(0);
  for (const v of values) binCounts[binOf(v)] += 1;

  const mean = n ? values.reduce((a, b) => a + b, 0) / n : 0;
  const stddev = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const fitCurve = n >= 10 && stddev > 0;
  const pdf = (x: number) => Math.exp(-0.5 * ((x - mean) / stddev) ** 2) / (stddev * Math.sqrt(2 * Math.PI));

  const dx = step / SUBSTEPS;
  const distRows: DistRow[] = [];
  for (let i = 0; i <= binTotal * SUBSTEPS; i++) {
    const x = round4(lo + i * dx);
    const isCentre = i % SUBSTEPS === SUBSTEPS / 2;
    distRows.push({
      x,
      count: isCentre ? binCounts[Math.floor(i / SUBSTEPS)] : null,
      curve: fitCurve ? n * step * pdf(x) : null,
    });
  }

  const peak = Math.max(...binCounts, ...(fitCurve ? distRows.map((r) => r.curve ?? 0) : [0]));
  const yStep = peak > 60 ? 20 : peak > 25 ? 10 : 5;
  const yMax = Math.max(Math.ceil((peak * 1.1) / yStep) * yStep, yStep);

  const tickStep = NICE_STEPS.find((s) => s >= step && (hiEdge - lo) / s <= 8) ?? 50;
  const ticks: number[] = [];
  for (let k = Math.ceil(lo / tickStep - 1e-9); k * tickStep <= hiEdge + 1e-9; k++) ticks.push(round4(k * tickStep));

  const curveAt = (x: number) => (fitCurve ? n * step * pdf(x) : null);

  return { rows: distRows, step, lo, hi: hiEdge, binCounts, binOf, yMax, ticks, n, mean, stddev, min, max, fitCurve, curveAt };
}

interface PercentileInfo {
  percentile: number; // mid-rank: share of people below, counting ties as half
  rank: number; // 1 = most loaded
  n: number;
  z: number;
}

/** Where `person` sits among everyone. */
function percentileInfo(rows: WorkloadRow[], person: WorkloadRow): PercentileInfo {
  const ratio = person.ratio;
  const values = rows.map((r) => r.ratio);
  const n = values.length;
  const below = values.filter((v) => v < ratio).length;
  const equal = values.filter((v) => v === ratio).length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const stddev = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return {
    percentile: ((below + equal / 2) / n) * 100,
    rank: n - below - equal + 1,
    n,
    z: stddev > 0 ? (ratio - mean) / stddev : 0,
  };
}

function describePosition(z: number): string {
  if (z >= 1.5) return 'molto sopra la media';
  if (z >= 0.5) return 'sopra la media';
  if (z > -0.5) return 'in linea con la media';
  if (z > -1.5) return 'sotto la media';
  return 'molto sotto la media';
}

function PercentileCard({ person, info }: { person: WorkloadRow; info: PercentileInfo }) {
  const name = (
    <strong>
      {person.name}
      {person.canLead && <span className="tl-badge">TL</span>}
    </strong>
  );
  const pct = Math.round(info.percentile);
  const pin = Math.min(Math.max(info.percentile, 0), 100);
  return (
    <div className="percentile-card">
      <div className="percentile-card-head">
        {name}
        <span className="percentile-card-value">{pct}° percentile</span>
      </div>
      <div className="percentile-bar" role="img" aria-label={`${pct}° percentile`}>
        <div className="percentile-bar-fill" style={{ width: `${pin}%` }} />
        <span className="percentile-bar-pin" style={{ left: `${pin}%` }} />
      </div>
      <div className="percentile-scale">
        <span>meno carichi</span>
        <span>più carichi</span>
      </div>
      <p className="percentile-card-text">
        Carico <b>{fmtPct(person.ratio)}</b> ({person.visiteAssegnate} assegnate su {person.visiteTotali} visite totali):
        più carico di circa il {pct}% delle persone, {describePosition(info.z)} ({info.z >= 0 ? '+' : ''}
        {fmt(info.z)} σ). Posizione {info.rank}ª su {info.n} dal più carico.
      </p>
    </div>
  );
}

interface BarShapeProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  fill?: string;
  payload?: { x?: number };
}

/** Recharts caps a bar's width at the spacing between *data rows* on a numeric axis (here the fine rows that
 * keep the curve smooth), so draw each bar ourselves: `barPx` wide, centred on its bin, 4px rounded top.
 * With `activeBin` set (a person is being looked up) their bin is outlined and the others fade back. */
function makeBarShape(barPx: number, activeBin: number | null, binOf: (x: number) => number) {
  return function BinBar({ x = 0, y = 0, width = 0, height = 0, fill, payload }: BarShapeProps) {
    const h = Number(height);
    if (!(h > 0)) return <g />;
    const left = Number(x) + Number(width) / 2 - barPx / 2;
    const top = Number(y);
    const r = Math.min(4, barPx / 2, h);
    const d = `M${left},${top + h} L${left},${top + r} Q${left},${top} ${left + r},${top} L${left + barPx - r},${top} Q${left + barPx},${top} ${left + barPx},${top + r} L${left + barPx},${top + h} Z`;
    const isActive = activeBin !== null && payload?.x !== undefined && binOf(payload.x) === activeBin;
    return (
      <path
        d={d}
        fill={fill}
        fillOpacity={activeBin !== null && !isActive ? 0.35 : 1}
        stroke={isActive ? PICK_COLOR : 'none'}
        strokeWidth={isActive ? 2.5 : 0}
      />
    );
  };
}

function DistributionTooltip({ active, label, dist }: TooltipContentProps & { dist: Distribution }) {
  if (!active || typeof label !== 'number') return null;
  const bin = dist.binOf(label);
  const from = dist.lo + bin * dist.step;
  const count = dist.binCounts[bin];
  const expected = dist.fitCurve
    ? dist.n * dist.step * (Math.exp(-0.5 * ((from + dist.step / 2 - dist.mean) / dist.stddev) ** 2) / (dist.stddev * Math.sqrt(2 * Math.PI)))
    : null;
  return (
    <div className="workload-tooltip">
      <strong>
        Carico {fmt(from, 2)}–{fmt(from + dist.step, 2)}%
      </strong>
      <dl>
        <div>
          <dt>Persone</dt>
          <dd>{count}</dd>
        </div>
        {expected !== null && (
          <div>
            <dt>Attese (curva)</dt>
            <dd>{fmt(expected)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function DistributionChart({ rows, selected }: { rows: WorkloadRow[]; selected: WorkloadRow | null }) {
  const dist = useMemo(() => buildDistribution(rows), [rows]);
  const chartRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // measured before the first paint (layout effect), so the chart never draws once at width 0 and then jumps;
  // the observer only handles later resizes
  useLayoutEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // bars are sized in pixels (one per bin, centred on the bin) because the x axis is numeric so the
  // curve and the mean/sigma markers can sit at exact positions instead of snapping to a category
  const plotWidth = Math.max(width - DIST_MARGIN.left - DIST_MARGIN.right - DIST_YAXIS_WIDTH, 0);
  const barSize = Math.max(Math.floor((plotWidth / dist.binCounts.length) * 0.84), 4);
  const pickX = selected ? selected.ratio * 100 : null;
  const pickBin = pickX === null ? null : dist.binOf(pickX);
  const pickY = pickX === null || pickBin === null ? 0 : (dist.curveAt(pickX) ?? dist.binCounts[pickBin]);
  const barShape = useMemo(
    () => makeBarShape(barSize, pickBin, dist.binOf),
    [barSize, pickBin, dist.binOf],
  );

  return (
    <div className="workload-distribution">
      <div className="workload-stats">
        <div>
          <strong>{dist.n}</strong>
          <span>persone</span>
        </div>
        <div>
          <strong>{fmt(dist.mean, 2)}%</strong>
          <span>carico medio</span>
        </div>
        <div>
          <strong>{fmt(dist.stddev, 2)} pt</strong>
          <span>deviazione standard</span>
        </div>
        <div>
          <strong>
            {fmt(dist.min, 2)}–{fmt(dist.max, 2)}%
          </strong>
          <span>carico minimo e massimo</span>
        </div>
      </div>
      <div className="workload-legend">
        <span>
          <i className="swatch swatch-bar" />
          Persone
        </span>
        {dist.fitCurve && (
          <>
            <span>
              <i className="swatch swatch-curve" />
              Curva normale
            </span>
            <span>
              <i className="swatch swatch-mean" />
              Media
            </span>
            <span>
              <i className="swatch swatch-band" />± 1 deviazione std.
            </span>
          </>
        )}
        {pickX !== null && selected && (
          <span>
            <i className="swatch swatch-pick" />
            {selected.name}
          </span>
        )}
      </div>
      <div ref={chartRef} style={{ width: '100%', height: 300 }}>
        {width > 0 && (
          <ComposedChart width={width} height={300} data={dist.rows} margin={DIST_MARGIN}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            {dist.fitCurve && (
              <ReferenceArea
                x1={Math.max(dist.mean - dist.stddev, dist.lo)}
                x2={Math.min(dist.mean + dist.stddev, dist.hi)}
                fill={BAR_COLOR}
                fillOpacity={0.07}
                stroke="none"
                ifOverflow="hidden"
              />
            )}
            <XAxis
              type="number"
              dataKey="x"
              domain={[dist.lo, dist.hi]}
              ticks={dist.ticks}
              tickFormatter={(v: number) => `${fmt(v, 2)}%`}
              tick={{ fill: 'var(--muted)', fontFamily: "'Titillium Web', sans-serif", fontSize: 11 }}
              axisLine={{ stroke: 'var(--line)' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, dist.yMax]}
              allowDecimals={false}
              tick={{ fill: 'var(--muted)', fontFamily: "'Titillium Web', sans-serif", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={DIST_YAXIS_WIDTH}
            />
            <Tooltip
              content={(props) => <DistributionTooltip {...props} dist={dist} />}
              cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3' }}
            />
            <Bar dataKey="count" fill={BAR_COLOR} shape={barShape} isAnimationActive={false} name="Persone" />
            {dist.fitCurve && (
              <Line
                type="monotone"
                dataKey="curve"
                stroke={CURVE_COLOR}
                strokeWidth={2.5}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                name="Curva normale"
              />
            )}
            {dist.fitCurve && (
              <ReferenceLine
                x={dist.mean}
                stroke="var(--ink)"
                strokeDasharray="5 4"
                strokeWidth={1.5}
                label={{
                  value: `media ${fmt(dist.mean, 2)}%`,
                  position: 'top',
                  fill: 'var(--ink)',
                  fontSize: 11,
                  fontFamily: "'Titillium Web', sans-serif",
                }}
              />
            )}
            {pickX !== null && <ReferenceLine x={pickX} stroke={PICK_COLOR} strokeWidth={2} ifOverflow="visible" />}
            {pickX !== null && (
              <ReferenceDot
                x={pickX}
                y={pickY}
                r={6}
                fill={PICK_COLOR}
                stroke="#ffffff"
                strokeWidth={2}
                ifOverflow="visible"
              />
            )}
          </ComposedChart>
        )}
      </div>
      <p className="workload-distribution-caption">
        Ogni barra conta le persone in una fascia di carico: visite assegnate su tutte le {rows[0]?.visiteTotali ?? 0}{' '}
        visite in calendario (una visita congiunta conta una volta).
      </p>
    </div>
  );
}

/** Carico di lavoro: per ogni persona, quota di tutte le visite in calendario a cui partecipa (team leader o valutatore).
 * Sopra DISTRIBUTION_THRESHOLD persone l'istogramma di distribuzione diventa la vista principale e la tabella
 * per persona (filtrabile, scorrevole) passa in secondo piano per il drill-down. */
export default function WorkloadPanel({ rows }: WorkloadPanelProps) {
  const [nameFilter, setNameFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  // the input updates at once; the table/chart re-render behind it at low priority, so typing never stutters
  const deferredFilter = useDeferredValue(nameFilter);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.ratio - a.ratio), [rows]);
  // the inline bar is scaled to the most loaded person: against 100% every bar would be a sliver
  const maxRatio = sorted[0]?.ratio || 1;
  const filtered = useMemo(() => {
    const q = deferredFilter.trim().toLowerCase();
    return q ? sorted.filter((r) => r.name.toLowerCase().includes(q)) : sorted;
  }, [sorted, deferredFilter]);
  const showDistribution = rows.length > DISTRIBUTION_THRESHOLD;

  // the person being looked up: an exact name (e.g. picked from the suggestions), or the only match left while typing
  const query = deferredFilter.trim();
  const selected = useMemo(() => {
    if (!showDistribution || !query) return null;
    return rows.find((r) => r.name.toLowerCase() === query.toLowerCase()) ?? (filtered.length === 1 ? filtered[0] : null);
  }, [rows, filtered, query, showDistribution]);
  const info = useMemo(() => (selected ? percentileInfo(rows, selected) : null), [rows, selected]);

  return (
    <div className="workload-panel">
      {showDistribution && <DistributionChart rows={rows} selected={selected} />}

      {showDistribution && (
        <div className="workload-search">
          <label className="field">
            <span>Cerca una persona per vederne il percentile sul grafico</span>
            <input
              type="search"
              list="workload-names"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="Nome e cognome"
              autoComplete="off"
            />
            <datalist id="workload-names">
              {sorted.map((r) => (
                <option key={r.id} value={r.name} />
              ))}
            </datalist>
          </label>
          {selected && info ? (
            <PercentileCard person={selected} info={info} />
          ) : (
            query && (
              <p className="field-hint">
                {filtered.length === 0
                  ? 'Nessuna persona trovata.'
                  : `${filtered.length} persone corrispondono: scrivi il nome completo o sceglilo dai suggerimenti per vederne il percentile.`}
              </p>
            )
          )}
        </div>
      )}


      {/* one table, the load bar inline in the Carico cell: replaces a recharts bar-per-person chart that drew
          a ~13k px SVG for 300 people and repeated the table's own numbers */}
      <div>
        <table className="workload-table">
          <thead>
            <tr>
              <th>Persona</th>
              <th className="num">Assegnate</th>
              <th>Carico</th>
            </tr>
          </thead>
          <tbody>
            {(showAll ? filtered : filtered.slice(0, ROW_LIMIT)).map((row) => (
              <tr key={row.id}>
                <td>
                  {row.name}
                  {row.canLead && <span className="tl-badge">TL</span>}
                </td>
                <td className="num">{row.visiteAssegnate}</td>
                <td className="workload-load">
                  <span className="load-bar" aria-hidden="true">
                    <i style={{ width: `${(row.ratio / maxRatio) * 100}%` }} />
                  </span>
                  {fmtPct(row.ratio)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!showAll && filtered.length > ROW_LIMIT && (
          <button type="button" className="btn btn-add workload-show-all" onClick={() => setShowAll(true)}>
            Mostra tutte le {filtered.length} persone
          </button>
        )}
      </div>
    </div>
  );
}
