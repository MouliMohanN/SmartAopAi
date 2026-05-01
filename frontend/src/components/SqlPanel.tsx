// -----------------------------------------------------------------------------
// SqlPanel.tsx — Collapsible panel that displays the generated SQL query.
//
// Appears once SQL is available from the stream (after the 'sql' event).
// Collapsed by default — users can expand it for transparency/debugging.
// Includes a copy-to-clipboard button.
// -----------------------------------------------------------------------------

import { useState } from 'react';

interface Props {
  sql: string;
}

export function SqlPanel({ sql }: Props) {
  const [open,    setOpen]    = useState(true);
  const [copied,  setCopied]  = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard access denied — fail silently */
    }
  };

  return (
    <div className="sql-panel slide-in">
      <button
        className="sql-panel-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="sql-panel-icon">{open ? '▾' : '▸'}</span>
        <span className="sql-panel-label">Generated SQL</span>
        <span className="sql-panel-chevron-spacer" />
      </button>

      {open && (
        <div className="sql-panel-body">
          <pre className="sql-code">{sql}</pre>
          <button className="sql-copy-btn" onClick={handleCopy}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );
}
