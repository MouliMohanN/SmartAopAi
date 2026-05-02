// -----------------------------------------------------------------------------
// useStream.ts — Unified streaming hook for POST /stream.
//
// Manages the full query pipeline state: step-level progress, SQL generation,
// query results, and narrative explanation.
// -----------------------------------------------------------------------------

import { useState, useCallback, useRef } from 'react';
import { streamQuery } from '../api';
import type { StepStatus } from '../api';
import type { QueryResponse } from '../types';

// Rotated while the LLM is writing SQL — gives the user meaningful progress
// feedback during the longest step instead of a static "Writing SQL query…".
const SQL_THINKING_MESSAGES = [
  'Thinking…',
  'Still thinking…',
  'Almost there…',
  'Working on it…',
  'Bear with us…',
  'Just a moment…',
  'This one needs some thought…',
  'Taking a bit longer than usual…',
  'Hang tight…',
  'On it…',
  'Give us a sec…',
  'Processing…',
  'Crunching the details…',
  'Figuring it out…',
  'Loading the brain cells…',
  'Good things take time…',
  'Making progress…',
  'Getting there…',
  'Doing the hard work…',
  'Putting the pieces together…',
  'Nearly done…',
  'Connecting the dots…',
  'In the zone…',
  'Deep in thought…',
  'Running the numbers…',
  'Hold on a moment…',
  'Working through this…',
  'Don\'t go anywhere…',
  'Stay with us…',
  'Chewing on this one…',
  'Pondering…',
  'One moment please…',
  'Taking it step by step…',
  'Cooking something up…',
  'This is a tricky one…',
  'Patience is a virtue…',
  'Wheels are turning…',
  'In progress…',
  'Coming right up…',
  'Spinning up the gears…',
  'Focused and working…',
  'Reading the question carefully…',
  'Taking the scenic route…',
  'Squeezing out the answer…',
  'Worth the wait, promise…',
  'Your answer is brewing…',
  'Digging deep…',
  'Not giving up…',
  'Pushing through…',
  'Almost cracked it…',
];

function pickOther(messages: string[], current: string | null): string {
  const pool = current ? messages.filter(m => m !== current) : messages;
  return pool[Math.floor(Math.random() * pool.length)];
}

export type { StepStatus };

export interface StepEntry {
  id:      string;
  message: string;
  status:  StepStatus;
}

export type StreamStatus = 'idle' | 'loading' | 'done' | 'error';

const TRACKER_OPEN_KEY = 'smartaop_tracker_open';

function readTrackerPref(): boolean {
  try {
    const stored = localStorage.getItem(TRACKER_OPEN_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
}

function writeTrackerPref(value: boolean): void {
  try {
    localStorage.setItem(TRACKER_OPEN_KEY, String(value));
  } catch { /* ignore */ }
}

export function useStream() {
  const [status,           setStatus]           = useState<StreamStatus>('idle');
  const [sql,              setSql]              = useState<string | null>(null);
  const [result,           setResult]           = useState<QueryResponse | null>(null);
  const [narrative,        setNarrative]        = useState<string>('');
  const [narrativeDone,    setNarrativeDone]    = useState(false);
  const [error,            setError]            = useState<string | null>(null);
  const [lastQuery,        setLastQuery]        = useState<string>('');
  const [steps,            setSteps]            = useState<StepEntry[]>([]);
  const [currentStepMsg,   setCurrentStepMsg]   = useState<string | null>(null);
  const [trackerOpen,      setTrackerOpen]      = useState<boolean>(readTrackerPref);
  const sqlRotatorRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sqlStreamStarted = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const toggleTracker = useCallback(() => {
    setTrackerOpen(prev => {
      const next = !prev;
      writeTrackerPref(next);
      return next;
    });
  }, []);

  const submit = useCallback(async (query: string) => {
    console.log('[useStream] submit called with query:', query);
    if (sqlRotatorRef.current) {
      clearTimeout(sqlRotatorRef.current);
      sqlRotatorRef.current = null;
    }
    setStatus('loading');
    setSql(null);
    setResult(null);
    setNarrative('');
    setNarrativeDone(false);
    setError(null);
    setLastQuery(query);
    setSteps([]);
    setCurrentStepMsg(null);
    sqlStreamStarted.current = false;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await streamQuery(query, {
        onStep: (stepId, stepStatus, message) => {
          console.debug(`[useStream] onStep: id=${stepId}, status=${stepStatus}, message=${message}`);
          if (stepStatus === 'active') {
            if (stepId === 'generating_sql') {
              // Kick off rotating messages for the slow SQL generation step
              const first = pickOther(SQL_THINKING_MESSAGES, null);
              setCurrentStepMsg(first);

              const schedule = (current: string) => {
                const delay = 3000 + Math.random() * 4000; // 3–7 s
                sqlRotatorRef.current = setTimeout(() => {
                  const next = pickOther(SQL_THINKING_MESSAGES, current);
                  setCurrentStepMsg(next);
                  schedule(next);
                }, delay);
              };
              schedule(first);
            } else {
              setCurrentStepMsg(message ?? null);
            }

            setSteps(prev => {
              const exists = prev.some(s => s.id === stepId);
              const entry: StepEntry = { id: stepId, message: message ?? stepId, status: 'active' };
              return exists
                ? prev.map(s => s.id === stepId ? entry : s)
                : [...prev, entry];
            });
          } else {
            if (stepId === 'generating_sql') {
              // Stop the rotator as soon as SQL is done
              if (sqlRotatorRef.current) {
                clearTimeout(sqlRotatorRef.current);
                sqlRotatorRef.current = null;
              }
            }
            setCurrentStepMsg(null);
            setSteps(prev =>
              prev.map(s => s.id === stepId ? { ...s, status: stepStatus } : s)
            );
          }
        },

        onSqlToken: (token) => {
          if (!sqlStreamStarted.current) {
            sqlStreamStarted.current = true;
            if (sqlRotatorRef.current) {
              clearTimeout(sqlRotatorRef.current);
              sqlRotatorRef.current = null;
            }
            setCurrentStepMsg(null);
          }
          setSql(prev => (prev ?? '') + token);
        },

        onSqlDone: (cleanSql) => {
          console.debug('[useStream] onSqlDone:', cleanSql);
          setSql(cleanSql);
        },

        onResult: (data) => {
          console.debug('[useStream] onResult received with', data.rows.length, 'rows');
          setResult({
            columns:        data.columns,
            rows:           data.rows,
            row_count:      data.row_count,
            chart_hint:     data.chart_hint,
            plan_available: data.plan_available,
            temporal_mode:  data.temporal_mode,
            sql:            data.sql,
            error:          data.error,
          });

          if (data.error) {
            setError(data.error);
          }

          if (data.rows.length === 0) {
            setStatus('done');
            setNarrativeDone(true);
          }
        },

        onToken: (text) => {
          setStatus('done');
          setNarrative(prev => prev + text);
        },

        onDone: () => {
          console.log('[useStream] onDone: Stream completed normally');
          setStatus('done');
          setNarrativeDone(true);
        },

        onError: (message) => {
          console.error('[useStream] onError:', message);
          if (sqlRotatorRef.current) {
            clearTimeout(sqlRotatorRef.current);
            sqlRotatorRef.current = null;
          }
          setError(message);
          setStatus('error');
          setNarrativeDone(true);
        },
      }, controller.signal);
    } catch (e: unknown) {
      console.error('[useStream] Exception caught in submit:', e);
      if (sqlRotatorRef.current) {
        clearTimeout(sqlRotatorRef.current);
        sqlRotatorRef.current = null;
      }
      setError(e instanceof Error ? e.message : 'An unexpected error occurred.');
      setStatus('error');
      setNarrativeDone(true);
    }
  }, []);

  const abort = useCallback(() => {
    console.log('[useStream] abort called');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const loading = status === 'loading';

  return {
    status,
    sql,
    result,
    narrative,
    narrativeDone,
    error,
    lastQuery,
    loading,
    steps,
    currentStepMsg,
    trackerOpen,
    toggleTracker,
    submit,
    abort,
  };
}
