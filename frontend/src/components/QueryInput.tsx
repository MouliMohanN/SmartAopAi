import { useState, useEffect } from 'react';

const SUGGESTIONS = [
  { icon: '👤', label: 'Top 5 supervisors by utilization' },
  { icon: '📉', label: 'Which T2 is underperforming?' },
  { icon: '👥', label: 'Top 10 employees by utilization' },
  { icon: '📊', label: 'Supervisor plan vs actual YTD' },
  { icon: '🏢', label: 'Top 5 cost centers by utilization' },
  { icon: '⭐', label: 'Supervisors above 100% utilization' },
];

interface Props {
  onSubmit: (query: string) => void;
  loading: boolean;
  initialValue?: string;
}

export function QueryInput({ onSubmit, loading, initialValue = '' }: Props) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (initialValue) setValue(initialValue);
  }, [initialValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed && !loading) onSubmit(trimmed);
  };

  return (
    <div className="query-wrapper">
      <p className="suggestions-label">Suggested queries</p>
      <div className="suggestions">
        {SUGGESTIONS.map(s => (
          <button
            key={s.label}
            type="button"
            className="suggestion-card"
            onClick={() => setValue(s.label)}
            disabled={loading}
          >
            <span className="suggestion-card-icon">{s.icon}</span>
            <span className="suggestion-card-label">{s.label}</span>
          </button>
        ))}
      </div>
      <form className="query-form" onSubmit={handleSubmit}>
        <input
          className="query-input"
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Ask a question about utilization data…"
          disabled={loading}
          autoFocus
        />
        <button className="query-submit" type="submit" disabled={loading || !value.trim()}>
          {loading ? 'Running…' : 'Ask'}
        </button>
      </form>
    </div>
  );
}
