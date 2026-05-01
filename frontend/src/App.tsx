import { useEffect, useState } from 'react';
import { useStream }       from './hooks/useStream';
import { QueryInput }      from './components/QueryInput';
import { ResultTable }     from './components/ResultTable';
import { ResultChart }     from './components/ResultChart';
import { ResultSkeleton }  from './components/ResultSkeleton';
import { SqlPanel }        from './components/SqlPanel';
import { NarrativePanel }  from './components/NarrativePanel';
import { StepTracker }     from './components/StepTracker';
import './index.css';

export default function App() {
  const {
    sql, result, narrative, narrativeDone,
    error, loading,
    steps, currentStepMsg, trackerOpen, toggleTracker,
    submit,
  } = useStream();

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

        {loading && <ResultSkeleton message={currentStepMsg} />}

        {sql && <SqlPanel sql={sql} />}

        {steps.length > 0 && (
          <StepTracker
            steps={steps}
            open={trackerOpen}
            onToggle={toggleTracker}
            isLoading={loading}
          />
        )}

        {!loading && result && !result.error && (
          <div className="result-section slide-in">
            <ResultChart result={result} />
            <ResultTable result={result} />
            <NarrativePanel text={narrative} done={narrativeDone} />
          </div>
        )}
      </main>
    </div>
  );
}
