interface Props {
  value:    string;
  onChange: (v: string) => void;
  onSubmit: (query: string) => void;
  loading:  boolean;
}

export function QueryInput({ value, onChange, onSubmit, loading }: Props) {
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
        onChange={e => onChange(e.target.value)}
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
