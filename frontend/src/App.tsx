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
  { icon: '📈', label: 'Which T2 exceeded plan the most?' },
  { icon: '📉', label: 'Employees with utilization below 70%' },
  { icon: '📊', label: 'Which supervisor has the highest variance?' },
  { icon: '🏢', label: 'Top 5 cost centers by utilization' },
  { icon: '⭐', label: 'Best-performing supervisor by utilization' },
  { icon: '📅', label: 'Monthwise variance in supervisor utilization for "Suchitra K"' },
  { icon: '👥', label: 'List of underutilized employees in cost center "EOPS_ENG_EBM_OPS"' },
  { icon: '👤', label: 'Supervisor-level utilization under "HTS_EOPS"' },
  { icon: '🔻', label: 'Supervisors with utilization below 70%' },
  { icon: '⚖️', label: 'Compare utilization between Mar YTD and Apr YTD for cost center "EOPS_ENG_EBM_OPS"' },
  { icon: '🏆', label: 'Who had the highest utilization in Q1 2026?' },
  { icon: '🔴', label: 'Cost centers with negative variance' },
  { icon: '💯', label: 'Supervisors with utilization above 100%' },
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
            {interactions.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                    <rect width="48" height="48" rx="14" fill="#ede9fe" />
                    <path d="M14 24h20M14 17h20M14 31h12" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="36" cy="31" r="5" fill="#6366f1" />
                    <path d="M36 28.5v2.5l1.5 1.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 className="empty-state-heading">What would you like to know?</h2>
                <p className="empty-state-sub">
                  Ask anything about employee utilization, cost centers, supervisors,<br />
                  or plan vs actuals — in natural language.
                </p>
                <div className="empty-state-hints">
                  <span className="empty-state-hint">📊 Utilization trends</span>
                  <span className="empty-state-hint">⚖️ Plan vs actuals</span>
                  <span className="empty-state-hint">👤 Supervisor performance</span>
                  <span className="empty-state-hint">🏢 Cost center breakdowns</span>
                </div>
              </div>
            )}
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
