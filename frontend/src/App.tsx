import { useEffect, useRef, useState } from 'react';
import { useStream } from './hooks/useStream';
import { QueryInput } from './components/QueryInput';
import type { QueryInputHandle } from './components/QueryInput';
import { ResultSkeleton } from './components/ResultSkeleton';
import { SqlPanel } from './components/SqlPanel';
import { StepTracker } from './components/StepTracker';
import { ResultSection } from './components/ResultSection';
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
    interactions, loading,
    submit, abort,
  } = useStream();

  const [queryValue, setQueryValue] = useState('');
  const queryInputRef = useRef<QueryInputHandle>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (query: string) => {
    setQueryValue('');
    submit(query);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interactions]);

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
        <p className="app-subtitle">Ask questions about utilization data in natural language</p>
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
                onClick={() => { queryInputRef.current?.focus(); handleSubmit(s.label); }}
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
          <main className="app-main chat-history">
            {interactions.map((interaction, idx) => {
              const isLatest = idx === interactions.length - 1;
              const isLoading = interaction.status === 'loading';

              return (
                <div key={interaction.id} className="interaction-pair">
                  <div className="chat-message user">
                    <div className="bubble">{interaction.query}</div>
                  </div>

                  <div className="chat-message assistant">
                    {interaction.error && (
                      <div className="error-banner">
                        <strong>Error:</strong> {interaction.error}
                      </div>
                    )}

                    {isLoading && <ResultSkeleton message={interaction.currentStepMsg} />}

                    {interaction.sql && (
                      <SqlPanel sql={interaction.sql} defaultOpen={isLatest} />
                    )}

                    {interaction.steps.length > 0 && (
                      <StepTracker
                        steps={interaction.steps}
                        defaultOpen={isLatest}
                        isLoading={isLoading}
                        activeMessage={interaction.currentStepMsg}
                      />
                    )}

                    {!isLoading && interaction.result && !interaction.result.error && (
                      <ResultSection
                        result={interaction.result}
                        narrative={interaction.narrative}
                        narrativeDone={interaction.narrativeDone}
                        question={interaction.query}
                      />
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </main>

          <div className="query-bar">
            <QueryInput
              ref={queryInputRef}
              value={queryValue}
              onChange={setQueryValue}
              onSubmit={handleSubmit}
              onAbort={abort}
              loading={loading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
