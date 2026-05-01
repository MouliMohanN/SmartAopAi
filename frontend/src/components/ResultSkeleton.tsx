interface Props {
  message?: string | null;
}

export function ResultSkeleton({ message }: Props) {
  return (
    <div className="skeleton-stages">
      <span className="skeleton-dot" />
      <span className="skeleton-stage-text">{message ?? 'Processing…'}</span>
    </div>
  );
}
