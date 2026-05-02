import type { QueryResponse, ResultRow } from '../types';
import { NoPlanBadge } from './NoPlanBadge';

interface Props {
  result: QueryResponse;
}

function buildTiles(columns: string[], rows: ResultRow[]) {
  if (rows.length === 0) return [];

  // Key metric columns to surface as tiles (in priority order)
  const METRIC_COLS = ['Util %', 'Plan Util %', 'Variance', 'Billed Hours', 'Billable Hours'];

  const tiles: { label: string; value: string }[] = [];

  for (const col of METRIC_COLS) {
    if (!columns.includes(col)) continue;

    const values = rows
      .map(r => r[col])
      .filter((v): v is number => typeof v === 'number');

    if (values.length === 0) continue;

    if (rows.length === 1) {
      // Single-row result: show the actual value
      tiles.push({ label: col, value: String(values[0]) });
    } else {
      // Multi-row: show average for % metrics, sum for hours
      const isHours = col.toLowerCase().includes('hour');
      if (isHours) {
        const total = values.reduce((a, b) => a + b, 0);
        tiles.push({ label: `Total ${col}`, value: total.toLocaleString(undefined, { maximumFractionDigits: 1 }) });
      } else {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        tiles.push({ label: `Avg ${col}`, value: avg.toFixed(1) + (col.includes('%') || col === 'Variance' ? '%' : '') });
      }
    }

    if (tiles.length === 3) break;
  }

  return tiles;
}

export function ResultTable({ result }: Props) {
  const { columns, rows, row_count, plan_available, temporal_mode } = result;
  const tiles = buildTiles(columns, rows);

  return (
    <div className="result-card">

      {/* ── Summary tiles ── */}
      {tiles.length > 0 && (
        <div className="metric-tiles">
          <div className="metric-tile metric-tile--rows">
            <span className="metric-tile-value">{row_count}</span>
            <span className="metric-tile-label">Rows</span>
          </div>
          {tiles.map(t => (
            <div key={t.label} className="metric-tile">
              <span className="metric-tile-value">{t.value}</span>
              <span className="metric-tile-label">{t.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Table header ── */}
      <div className="result-header">
        <span className="row-count">{row_count} row{row_count !== 1 ? 's' : ''}</span>
        {temporal_mode && <span className="temporal-badge">{temporal_mode}</span>}
        {!plan_available && <NoPlanBadge />}
      </div>

      {/* ── Table ── */}
      <div className="table-scroll">
        <table className="result-table">
          <thead>
            <tr>
              {columns.map(col => <th key={col}>{col}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map(col => <td key={col}>{row[col] ?? '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
