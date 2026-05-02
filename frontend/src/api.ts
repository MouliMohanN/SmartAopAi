// -----------------------------------------------------------------------------
// api.ts — Functions for calling the FastAPI backend.
//
// All communication with the backend goes through these functions.
// The backend URL is read from the VITE_API_URL environment variable,
// defaulting to http://localhost:8000 for local development.
//
// Legacy (used by old /query and /explain — kept for backward compat):
//   postQuery()   — waits for the full JSON response
//   postExplain() — waits for the full JSON response
//
// Streaming (used by the new unified /stream endpoint):
//   streamQuery() — reads NDJSON chunks via fetch + ReadableStream
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

// ── Streaming types ───────────────────────────────────────────────────────────

export type StepStatus = 'active' | 'done' | 'error';

export type StreamEvent =
  | { event: 'step'; step: string; status: StepStatus; message?: string }
  | { event: 'sql_token'; text: string }
  | { event: 'sql_done';  sql: string }
  | { event: 'result'; columns: string[]; rows: ResultRow[]; row_count: number;
      chart_hint: 'line' | 'bar' | 'pie' | null; plan_available: boolean;
      temporal_mode: 'YTD' | 'MTD' | null; sql: string | null; error: string | null }
  | { event: 'token';  text: string }
  | { event: 'done' }
  | { event: 'error';  message: string };

export interface StreamHandlers {
  onStep?:      (step: string, status: StepStatus, message?: string) => void;
  onSqlToken?:  (text: string) => void;
  onSqlDone?:   (sql: string) => void;
  onResult?:    (data: Omit<StreamEvent & { event: 'result' }, 'event'>) => void;
  onToken?:     (text: string) => void;
  onDone?:      () => void;
  onError?:     (message: string) => void;
}

/**
 * Sends a query to POST /stream and reads the NDJSON response incrementally.
 *
 * Uses fetch() + ReadableStream so the browser starts processing server chunks
 * immediately rather than waiting for the full response to arrive.
 *
 * Handlers are called as each event type arrives.
 * Throws if the initial HTTP connection fails.
 */
export async function streamQuery(
  query:    string,
  handlers: StreamHandlers,
  abortSignal?: AbortSignal,
): Promise<void> {
  console.log('[api] Starting streamQuery for:', query);

  const res = await fetch(`${BASE_URL}/stream`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query }),
    signal:  abortSignal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`[api] streamQuery failed with status ${res.status}:`, errText);
    throw new Error(`Server error ${res.status}: ${errText}`);
  }

  if (!res.body) {
    console.error('[api] ReadableStream not supported in this environment');
    throw new Error('ReadableStream not supported in this environment.');
  }

  console.log('[api] streamQuery connected, reading stream...');
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = '';

  try {
    // Read chunks until the stream closes
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

    // Decode the chunk and append to our line buffer.
    // A single read() may contain multiple NDJSON lines or a partial line.
    buffer += decoder.decode(value, { stream: true });

    // Split on newlines; keep any incomplete trailing line in the buffer.
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let evt: StreamEvent;
      try {
        evt = JSON.parse(trimmed) as StreamEvent;
      } catch (err) {
        console.warn('[api] Failed to parse NDJSON line:', trimmed, err);
        continue;
      }

      switch (evt.event) {
        case 'step':      handlers.onStep?.(evt.step, evt.status, evt.message); break;
        case 'sql_token': handlers.onSqlToken?.(evt.text); break;
        case 'sql_done':  handlers.onSqlDone?.(evt.sql); break;
        case 'result':    handlers.onResult?.(evt); break;
        case 'token':     handlers.onToken?.(evt.text); break;
        case 'done':      handlers.onDone?.(); break;
        case 'error':     handlers.onError?.(evt.message); break;
      }

      // sql_token and token are high-frequency — skip the yield to avoid
      // throttling the stream. All other major events get a yield so React
      // can render each stage transition before the next event is processed.
      if (evt.event !== 'token' && evt.event !== 'sql_token') {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
  }

    // Flush any remaining buffer content (shouldn't happen with well-formed NDJSON)
    const remaining = buffer.trim();
    if (remaining) {
      try {
        const evt = JSON.parse(remaining) as StreamEvent;
        if (evt.event === 'done') handlers.onDone?.();
        if (evt.event === 'error') handlers.onError?.(evt.message);
      } catch (err) {
        console.warn('[api] Failed to parse remaining buffer:', remaining, err);
      }
    }
    console.log('[api] streamQuery finished reading stream');
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[api] streamQuery aborted by user');
      handlers.onError?.('Query aborted by user');
      return;
    }
    console.error('[api] streamQuery encountered an error:', err);
    throw err;
  }
}

