// -----------------------------------------------------------------------------
// NarrativePanel.tsx — Streaming narrative display with typing cursor.
//
// Receives `text` (accumulated token by token) and `done` (whether the
// stream has ended). Shows a blinking cursor while tokens are still arriving
// and fades it out once done.
// -----------------------------------------------------------------------------

interface Props {
  text: string;
  done: boolean;
}

export function NarrativePanel({ text, done }: Props) {
  if (!text) return null;

  return (
    <div className="narrative-wrapper slide-in">
      <div className="narrative-header">
        <span className="narrative-icon">✦</span>
        <span className="narrative-title">Analysis</span>
      </div>
      <p className="narrative-text">
        {text}
        {!done && <span className="narrative-cursor" aria-hidden="true" />}
      </p>
    </div>
  );
}
