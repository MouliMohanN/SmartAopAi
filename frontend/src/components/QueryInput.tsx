import { useImperativeHandle, useRef, forwardRef, useState, useEffect } from 'react';

const SpeechRecognition = (typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null;

interface Props {
  value:    string;
  onChange: (v: string) => void;
  onSubmit: (query: string) => void;
  onAbort?: () => void;
  loading:  boolean;
}

export interface QueryInputHandle {
  focus: () => void;
}

export const QueryInput = forwardRef<QueryInputHandle, Props>(
  function QueryInput({ value, onChange, onSubmit, onAbort, loading }, ref) {
    const inputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);
    const baseValueRef = useRef<string>('');
    const [isListening, setIsListening] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(false);

    useEffect(() => {
      if (SpeechRecognition) {
        setSpeechSupported(true);
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        
        recognition.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            currentTranscript += event.results[i][0].transcript;
          }
          const newValue = baseValueRef.current 
            ? baseValueRef.current + ' ' + currentTranscript 
            : currentTranscript;
          onChange(newValue);
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error', event.error);
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }, [onChange]);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    const toggleListening = () => {
      if (!recognitionRef.current) return;
      if (isListening) {
        recognitionRef.current.stop();
        setIsListening(false);
      } else {
        baseValueRef.current = value;
        recognitionRef.current.start();
        setIsListening(true);
      }
    };

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed && !loading) {
        if (isListening && recognitionRef.current) {
          recognitionRef.current.stop();
          setIsListening(false);
        }
        onSubmit(trimmed);
      }
    };

    return (
      <form className="query-form" onSubmit={handleSubmit}>
        <div className="query-input-wrapper">
          <input
            ref={inputRef}
            className="query-input"
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Ask a question about utilization data…"
            disabled={loading}
            autoFocus
          />
          {speechSupported && !loading && (
            <button
              type="button"
              className={`query-mic-btn ${isListening ? 'query-mic-btn--listening' : ''}`}
              onClick={toggleListening}
              aria-label={isListening ? "Stop listening" : "Start listening"}
              title={isListening ? "Stop listening" : "Start listening"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mic-icon">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" x2="12" y1="19" y2="22"/>
              </svg>
            </button>
          )}
        </div>
        {loading ? (
          <button 
            key="stop"
            className="query-submit query-stop" 
            type="button" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAbort?.();
            }}
          >
            Stop
          </button>
        ) : (
          <button key="ask" className="query-submit" type="submit" disabled={!value.trim()}>
            Ask
          </button>
        )}
      </form>
    );
  }
);
