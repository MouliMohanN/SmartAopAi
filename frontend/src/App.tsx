import { useEffect, useState } from 'react';
import { useQuery } from './hooks/useQuery';
import { QueryInput } from './components/QueryInput';
import { ResultTable } from './components/ResultTable';
import { ResultChart } from './components/ResultChart';
import { ResultSkeleton } from './components/ResultSkeleton';
import { ExplainButton } from './components/ExplainButton';
import './index.css';

export default function App() {
  const { result, loading, error, lastQuery, submit } = useQuery();
  const [initialQuery, setInitialQuery] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) {
      setInitialQuery(q);
      submit(q);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">SmartAop<span className="app-title-accent">Ai</span></h1>
        <p className="app-subtitle">Ask questions about utilization data in plain English</p>
      </header>

      <main className="app-main">
        <QueryInput onSubmit={submit} loading={loading} initialValue={initialQuery} />

        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        {loading && <ResultSkeleton />}

        {!loading && result && !result.error && (
          <div className="result-section slide-in">
            <ResultChart result={result} />
            <ResultTable result={result} />
            <ExplainButton query={lastQuery} rows={result.rows} />
          </div>
        )}
      </main>
    </div>
  );
}
