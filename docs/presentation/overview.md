# SmartAopAi — Overview

## What It Is

SmartAopAi is a natural language query interface for employee utilization and project allocation data. Business users ask plain-English questions and get back charts, tables, and AI-written narrative insights — no SQL required.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, Recharts |
| Backend | Python, FastAPI |
| Database | DuckDB (single-file analytical DB) |
| LLM | Ollama — local, no cloud API |
| Data Source | Excel (.xlsx) ingested into DuckDB |
| Protocol | NDJSON streaming over HTTP |
| Deployment | Vercel (frontend) |

---

## Architecture

```
User (Browser)
     │
     │  POST /stream  →  NDJSON chunks
     ▼
┌──────────────────────────────────────┐
│            FastAPI Backend           │
│                                      │
│  6-step sequential pipeline:         │
│  1. Analyzing      — load schema     │
│  2. Generating SQL — LLM tokens      │
│  3. Validating SQL — block writes    │
│  4. Executing      — run on DuckDB   │
│  5. Detecting Chart — line/bar/pie   │
│  6. Generating Insights — narrative  │
└──────┬─────────────────────┬─────────┘
       │                     │
  ┌────▼────┐           ┌────▼─────┐
  │  Ollama │           │  DuckDB  │
  │  (local │           │ actuals  │
  │   LLM)  │           │ cc_plan  │
  └─────────┘           │ t2_plan  │
                        └────┬─────┘
                             │ loaded from
                        ┌────▼─────┐
                        │  Excel   │
                        └──────────┘

Frontend: React + useStream hook
  → StepTracker   live 6-step progress
  → ResultChart   dynamic chart type
  → NarrativePanel AI insight text
  → SqlPanel      generated SQL
```

---

## Key Design Decisions

- **LLM-generated SQL** — system prompt injects full schema + metric formulas; no hard-coded templates
- **Safety layer** — SQL validator blocks all write operations before execution
- **Streaming-first** — every pipeline step emits real-time events for responsive UX
- **Local LLM** — Ollama runs on-premise; no cloud calls for query generation
- **Excel as source of truth** — `.xlsx` sheets are full-replaced on each ingest

---

## Data Model

Three DuckDB tables loaded from Excel:

| Table | Contents |
|---|---|
| `actuals` | Weekly employee hours (billable, vacation, training, etc.) |
| `cc_plan` | Cost-center level planned hours |
| `t2_plan` | T2 hierarchy level planned hours |

---

## Query Flow (end-to-end)

1. User types question in chat
2. Frontend `POST /stream` with question text
3. Backend builds prompt (schema + metrics + rules) → sends to Ollama
4. Ollama streams SQL tokens back → validated → executed on DuckDB
5. Result shape analyzed → chart type selected
6. Ollama streams narrative explanation
7. Frontend renders: step progress → SQL panel → chart/table → narrative
