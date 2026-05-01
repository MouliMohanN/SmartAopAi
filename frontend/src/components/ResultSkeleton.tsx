export function ResultSkeleton() {
  return (
    <div className="skeleton-stages">
      <span className="skeleton-dot" />
      <span className="skeleton-stage-text">Generating SQL query…</span>
    </div>
  );
}
