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

const SUGGESTIONS = [
  { icon: '👤', label: 'Top 5 supervisors by utilization' },
  { icon: '📉', label: 'Which T2 is underperforming?' },
  { icon: '👥', label: 'Top 10 employees by utilization' },
  { icon: '📊', label: 'Supervisor plan vs actual YTD' },
  { icon: '🏢', label: 'Top 5 cost centers by utilization' },
  { icon: '⭐', label: 'Supervisors above 100% utilization' },
];

export default function App() {
  const {
    sql, result, narrative, narrativeDone,
    error, loading,
    steps, currentStepMsg, trackerOpen, toggleTracker,
    submit,
  } = useStream();

  const [queryValue, setQueryValue] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) {
      setQueryValue(q);
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

      <div className="app-body">
        {/* ── Left sidebar ── */}
        <aside className="suggestions-sidebar">
          <p className="suggestions-label">Suggested Queries</p>
          <div className="suggestions-list">
            {SUGGESTIONS.map(s => (
              <button
                key={s.label}
                type="button"
                className="suggestion-card"
                onClick={() => setQueryValue(s.label)}
                disabled={loading}
              >
                <span className="suggestion-card-icon">{s.icon}</span>
                <span className="suggestion-card-label">{s.label}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* ── Main content ── */}
        <div className="app-content">
          <main className="app-main">
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
                activeMessage={currentStepMsg}
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

          <div className="query-bar">
            <QueryInput
              value={queryValue}
              onChange={setQueryValue}
              onSubmit={submit}
              loading={loading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
