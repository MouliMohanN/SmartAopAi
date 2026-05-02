# Challenge: Conversation History & Follow-up Queries

## Problem
Every query is currently stateless — the LLM receives no context from prior turns.
Follow-up questions like "now filter for just Suchitra K" or "show this month-wise"
require the user to restate the full question from scratch.

## Proposed Solution: Sliding Window History

Pass the last N user question + generated SQL pairs as prior messages in the Ollama
`/api/chat` messages array, ahead of the current question.

```
messages: [
  { role: system,    content: <full system prompt> },
  { role: user,      content: "previous question 1" },
  { role: assistant, content: "SELECT ... (SQL 1)" },
  { role: user,      content: "previous question 2" },
  { role: assistant, content: "SELECT ... (SQL 2)" },
  { role: user,      content: "current question" }
]
```

- History entries: **user question + generated SQL only** — never include query results
  (result rows can be thousands of lines and would overflow context immediately)
- Sliding window: keep last **3 turns** maximum
- Implementation: `llm.py` only — the API layer accumulates history per session

## Why Not More Than 3 Turns?

The system prompt is already large: full schema, 4 SQL patterns, all business rules.
On a 20B parameter model this consumes a significant portion of the context window.
Adding too many history turns risks:

1. **Silent context truncation** — older messages get dropped, the LLM loses system prompt
   instructions and starts generating incorrect SQL
2. **Degraded instruction-following** — smaller models struggle to maintain coherence over
   long histories while simultaneously following a complex system prompt

## Model Considerations

| Model size | History reliability | Notes |
|---|---|---|
| 20B | Low–Medium | Keep to 2–3 turns max; system prompt pressure is high |
| 32B (current) | Medium | 3 turns is safe; 5 turns feasible but watch for drift |
| 70B+ | High | Can handle longer history without losing instruction fidelity |

## Status
Not yet implemented. Pending decision on turn limit and session management approach.
