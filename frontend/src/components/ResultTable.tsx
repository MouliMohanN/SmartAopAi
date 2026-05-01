import type { QueryResponse } from '../types';
import { NoPlanBadge } from './NoPlanBadge';

interface Props {
  result: QueryResponse;
}

export function ResultTable({ result }: Props) {
  const { columns, rows, row_count, plan_available, temporal_mode, sql } = result;

  return (
    <div className="result-table-wrapper">
      <div className="result-header">
        <span className="row-count">{row_count} row{row_count !== 1 ? 's' : ''}</span>
        {temporal_mode && (
          <span className="temporal-badge">{temporal_mode}</span>
        )}
        {!plan_available && <NoPlanBadge />}
      </div>

      <div className="table-scroll">
        <table className="result-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map(col => (
                  <td key={col}>{row[col] ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sql && (
        <details className="sql-details">
          <summary>Generated SQL</summary>
          <pre className="sql-code">{sql}</pre>
        </details>
      )}
    </div>
  );
}
