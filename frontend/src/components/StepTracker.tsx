import type { StepEntry } from '../hooks/useStream';

interface Props {
  steps:         StepEntry[];
  open:          boolean;
  onToggle:      () => void;
  isLoading:     boolean;
  activeMessage: string | null;
}

const STEP_LABELS: Record<string, string> = {
  analyzing:           'Analyzing your question',
  generating_sql:      'Writing SQL query',
  validating_sql:      'Validating SQL syntax',
  executing_query:     'Querying the database',
  detecting_chart:     'Detecting best visualization',
  generating_insights: 'Generating insights',
};

function StepIcon({ status }: { status: StepEntry['status'] }) {
  if (status === 'active') return <span className="step-icon step-icon--active" aria-label="in progress" />;
  if (status === 'done')   return <span className="step-icon step-icon--done"   aria-label="done">✓</span>;
  return                          <span className="step-icon step-icon--error"  aria-label="error">✕</span>;
}

export function StepTracker({ steps, open, onToggle, isLoading, activeMessage }: Props) {
  if (steps.length === 0) return null;

  const doneCount   = steps.filter(s => s.status === 'done').length;
  const totalSteps  = isLoading ? '…' : String(steps.length);
  const summaryText = isLoading
    ? `Processing — ${doneCount} of 6 steps done`
    : `Completed in ${steps.length} steps`;

  return (
    <div className="step-tracker">
      <button
        className="step-tracker-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="step-tracker-summary">{summaryText}</span>
        <span className={`step-tracker-chevron ${open ? 'step-tracker-chevron--open' : ''}`}>›</span>
      </button>

      {open && (
        <ul className="step-tracker-list">
          {steps.map(step => (
            <li key={step.id} className={`step-item step-item--${step.status}`}>
              <StepIcon status={step.status} />
              <span className="step-item-label">
                {step.status === 'active' && activeMessage
                  ? activeMessage
                  : (STEP_LABELS[step.id] ?? step.message)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
