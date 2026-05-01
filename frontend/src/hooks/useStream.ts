// -----------------------------------------------------------------------------
// useStream.ts — Unified streaming hook for POST /stream.
//
// Manages the full query pipeline state: step-level progress, SQL generation,
// query results, and narrative explanation.
// -----------------------------------------------------------------------------

import { useState, useCallback } from 'react';
import { streamQuery } from '../api';
import type { StepStatus } from '../api';
import type { QueryResponse } from '../types';

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

  const toggleTracker = useCallback(() => {
    setTrackerOpen(prev => {
      const next = !prev;
      writeTrackerPref(next);
      return next;
    });
  }, []);

  const submit = useCallback(async (query: string) => {
    setStatus('loading');
    setSql(null);
    setResult(null);
    setNarrative('');
    setNarrativeDone(false);
    setError(null);
    setLastQuery(query);
    setSteps([]);
    setCurrentStepMsg(null);

    try {
      await streamQuery(query, {
        onStep: (stepId, stepStatus, message) => {
          if (stepStatus === 'active') {
            setCurrentStepMsg(message ?? null);
            setSteps(prev => {
              // replace if already present (shouldn't happen), else append
              const exists = prev.some(s => s.id === stepId);
              const entry: StepEntry = { id: stepId, message: message ?? stepId, status: 'active' };
              return exists
                ? prev.map(s => s.id === stepId ? entry : s)
                : [...prev, entry];
            });
          } else {
            setCurrentStepMsg(null);
            setSteps(prev =>
              prev.map(s => s.id === stepId ? { ...s, status: stepStatus } : s)
            );
          }
        },

        onSqlToken: (token) => setSql(prev => (prev ?? '') + token),

        onSqlDone: (cleanSql) => setSql(cleanSql),

        onResult: (data) => {
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
          setStatus('done');
          setNarrativeDone(true);
        },

        onError: (message) => {
          setError(message);
          setStatus('error');
          setNarrativeDone(true);
        },
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unexpected error occurred.');
      setStatus('error');
      setNarrativeDone(true);
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
  };
}
