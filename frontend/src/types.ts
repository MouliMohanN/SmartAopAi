// -----------------------------------------------------------------------------
// types.ts — Shared TypeScript types used across the frontend.
//
// These mirror the Pydantic response models defined in backend/api/models.py.
// If the backend response shape changes, update here too.
// -----------------------------------------------------------------------------

/** A single result row — keys are column names, values are the cell values */
export type ResultRow = Record<string, string | number | null>;

/** Response from POST /query */
export interface QueryResponse {
  columns:        string[];
  rows:           ResultRow[];
  row_count:      number;
  chart_hint:     'line' | 'bar' | 'pie' | null;
  plan_available: boolean;
  temporal_mode:  'YTD' | 'MTD' | null;
  sql:            string | null;
  error:          string | null;
}

/** Response from POST /explain */
export interface ExplainResponse {
  narrative: string;
}
