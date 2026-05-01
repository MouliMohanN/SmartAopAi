// -----------------------------------------------------------------------------
// useQuery.ts — Manages the state and logic for POST /query calls.
//
// This hook handles:
//   - Sending the user's question to the backend
//   - Tracking loading state (so we can show a spinner)
//   - Storing the result or error when the response arrives
//   - Remembering the last question asked (needed by the explain endpoint)
// -----------------------------------------------------------------------------

import { useState } from 'react';
import { postQuery } from '../api';
import type { QueryResponse } from '../types';

export function useQuery() {
  const [result,    setResult]    = useState<QueryResponse | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string>('');

  /**
   * Submits a natural language question to the backend.
   * Resets previous results before each new submission.
   */
  const submit = async (query: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setLastQuery(query);

    try {
      const data = await postQuery(query);
      setResult(data);

      // The backend may return a successful HTTP 200 but with an error field
      // (e.g. the LLM generated invalid SQL). Surface that as an error.
      if (data.error) {
        setError(data.error);
      }
    } catch (e: unknown) {
      // Network error or server crash (HTTP 5xx)
      setError(e instanceof Error ? e.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return { result, loading, error, lastQuery, submit };
}
