// -----------------------------------------------------------------------------
// api.ts — Functions for calling the FastAPI backend.
//
// All communication with the backend goes through these two functions.
// The backend URL is read from the VITE_API_URL environment variable,
// defaulting to http://localhost:8000 for local development.
// -----------------------------------------------------------------------------

import type { QueryResponse, ExplainResponse, ResultRow } from './types';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

/**
 * Sends a natural language question to POST /query.
 * Returns the full query response including rows, chart hint, and metadata.
 * Throws an error if the server is unreachable (network error or HTTP 5xx).
 */
export async function postQuery(query: string): Promise<QueryResponse> {
  const res = await fetch(`${BASE_URL}/query`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Server error: ${res.status}`);
  }

  return res.json();
}

/**
 * Sends the original question + result rows to POST /explain.
 * Returns a plain-English narrative summary of the result.
 * Throws an error if the server is unreachable.
 */
export async function postExplain(
  query:  string,
  result: ResultRow[],
): Promise<ExplainResponse> {
  const res = await fetch(`${BASE_URL}/explain`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query, result }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Server error: ${res.status}`);
  }

  return res.json();
}
