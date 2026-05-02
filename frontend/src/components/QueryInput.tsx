import { useImperativeHandle, useRef, forwardRef } from 'react';

interface Props {
  value:    string;
  onChange: (v: string) => void;
  onSubmit: (query: string) => void;
  onAbort?: () => void;
  loading:  boolean;
}

export interface QueryInputHandle {
  focus: () => void;
}

export const QueryInput = forwardRef<QueryInputHandle, Props>(
  function QueryInput({ value, onChange, onSubmit, onAbort, loading }, ref) {
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
        {loading ? (
          <button 
            key="stop"
            className="query-submit query-stop" 
            type="button" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAbort?.();
            }}
          >
            Stop
          </button>
        ) : (
          <button key="ask" className="query-submit" type="submit" disabled={!value.trim()}>
            Ask
          </button>
        )}
      </form>
    );
  }
);
