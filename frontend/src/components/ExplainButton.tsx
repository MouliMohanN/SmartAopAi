import { useExplain } from '../hooks/useExplain';
import type { ResultRow } from '../types';

interface Props {
  query: string;
  rows: ResultRow[];
}

export function ExplainButton({ query, rows }: Props) {
  const { narrative, loading, error, explain, clear } = useExplain();

  if (narrative) {
    return (
      <div className="narrative-wrapper">
        <div className="narrative-text">{narrative}</div>
        <button className="btn-secondary" onClick={clear}>Dismiss</button>
      </div>
    );
  }

  return (
    <div className="explain-section">
      {error && <p className="error-text">{error}</p>}
      <button
        className="btn-secondary"
        onClick={() => explain(query, rows)}
        disabled={loading}
      >
        {loading ? 'Generating explanation…' : 'Explain this result'}
      </button>
    </div>
  );
}
