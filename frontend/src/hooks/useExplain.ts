// -----------------------------------------------------------------------------
// useExplain.ts — Manages the state and logic for POST /explain calls.
//
// This hook handles:
//   - Sending the query + result rows to the backend for narrative generation
//   - Tracking loading state (explain can take several seconds)
//   - Storing the narrative text when the response arrives
//   - Allowing the user to dismiss the narrative and re-request it
// -----------------------------------------------------------------------------

import { useState } from 'react';
import { postExplain } from '../api';
import type { ResultRow } from '../types';

export function useExplain() {
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  /**
   * Requests a plain-English narrative explanation of a query result.
   *
   * query  — the original question the user asked
   * result — the rows returned by /query (sent to the LLM for context)
   */
  const explain = async (query: string, result: ResultRow[]) => {
    setLoading(true);
    setError(null);

    try {
      const data = await postExplain(query, result);
      setNarrative(data.narrative);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  /** Clears the narrative so the user can request a fresh explanation. */
  const clear = () => setNarrative(null);

  return { narrative, loading, error, explain, clear };
}
