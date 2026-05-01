import { useState, useEffect } from 'react';

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
  );
}
