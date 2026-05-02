import { useImperativeHandle, useRef, forwardRef } from 'react';

interface Props {
  value:    string;
  onChange: (v: string) => void;
  onSubmit: (query: string) => void;
  loading:  boolean;
}

export interface QueryInputHandle {
  focus: () => void;
}

export const QueryInput = forwardRef<QueryInputHandle, Props>(
  function QueryInput({ value, onChange, onSubmit, loading }, ref) {
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed && !loading) onSubmit(trimmed);
    };

    return (
      <form className="query-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
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
);
