import { useEffect, useState } from 'react';
import { useQuery } from './hooks/useQuery';
import { QueryInput } from './components/QueryInput';
import { ResultTable } from './components/ResultTable';
import { ResultChart } from './components/ResultChart';
import { ExplainButton } from './components/ExplainButton';
import './index.css';

export default function App() {
  const { result, loading, error, lastQuery, submit } = useQuery();

  // Read ?q= URL param on first mount to support webapp deep-link integration
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

        {result && !result.error && (
          <div className="result-section">
            <ResultChart result={result} />
            <ResultTable result={result} />
            <ExplainButton query={lastQuery} rows={result.rows} />
          </div>
        )}
      </main>
    </div>
  );
}
