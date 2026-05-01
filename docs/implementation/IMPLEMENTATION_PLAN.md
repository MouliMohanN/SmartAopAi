# SmartAopAi — Implementation Plan

## Overview

5-phase build: ingest pipeline → query engine → REST API → React frontend → integration prep.

**PRD:** `docs/prd/PRD.md`
**Stack:** Python + FastAPI · DuckDB · Ollama (Qwen2.5-Coder-32B) · React · Recharts

---

## Project Structure

```
SmartAopAi/
├── backend/
│   ├── ingest/
│   │   ├── ingest.py          # CLI entry point + ingest orchestration
│   │   ├── schema.py          # column definitions, ignored columns, type mappings
│   │   └── validate.py        # schema validation on ingest
│   ├── db/
│   │   └── database.py        # DuckDB connection + table setup
│   ├── engine/
│   │   ├── metrics.py         # metrics catalog (single source of truth)
│   │   ├── prompt.py          # system prompt builder
│   │   ├── llm.py             # Ollama client wrapper
│   │   ├── executor.py        # SQL execution + result formatting
│   │   └── validator.py       # SQL safety check before execution
│   └── api/
│       ├── main.py            # FastAPI app
│       ├── models.py          # Pydantic request/response models
│       └── routes/
│           ├── query.py       # POST /query, POST /explain
│           └── health.py      # GET /health
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── QueryInput.tsx
│       │   ├── ResultTable.tsx
│       │   ├── ResultChart.tsx
│       │   ├── NoPlanBadge.tsx
│       │   └── ExplainButton.tsx
│       ├── hooks/
│       │   ├── useQuery.ts
│       │   └── useExplain.ts
│       └── App.tsx
├── .env                       # INGEST_DIR, DB_PATH (not committed)
├── .env.example
├── pyproject.toml
└── frontend/package.json
```

---

## Phase 1 — Data Infrastructure

**Goal:** Reliable, repeatable ingest from `.xlsx` → DuckDB.

### Tasks
1. Set up `.env` with `INGEST_DIR` and `DB_PATH` — read via `python-dotenv`
2. `schema.py` — define expected columns per sheet and ignored columns (`SWC Hrs`, `Vula Hrs`, `Month number`)
3. `ingest.py`:
   - Read `.xlsx` using `openpyxl` / `pandas`
   - Parse 3 sheets: `Utilization` → `actuals`, `Util CC Plan` → `cc_plan`, `Util T2 Plan` → `t2_plan`
   - Full table replacement on each run (DROP + CREATE + INSERT)
   - Normalize column names (strip whitespace, consistent casing)
4. `validate.py` — assert required columns present; assert hour columns are numeric
5. `database.py` — DuckDB connection factory, table DDL
6. CLI trigger: `python -m backend.ingest.ingest`

### DuckDB Tables

| Table | Source Sheet | Grain |
|---|---|---|
| `actuals` | Utilization | Employee × Week |
| `cc_plan` | Util CC Plan | Cost Center × Month |
| `t2_plan` | Util T2 Plan | HTS T2 × Month |

---

## Phase 2 — Metrics & Query Engine

**Goal:** NL query → valid SQL → DuckDB result.

### Metrics Catalog (`metrics.py`)

Single source of truth — injected into every LLM call. Contains:
- **Computed % metrics**: numerator column, denominator = `Std Billable Hours`
- **Raw hour metrics**: column name, aggregation = `SUM`
- **Plan metrics**: source table, numerator and denominator columns
- **Business rules** (see below)

| Metric | Type | Formula |
|---|---|---|
| Util % | % | SUM(Billed Hrs) / SUM(Std Billable Hours) |
| Vacation % | % | SUM(Vacn Hrs taken) / SUM(Std Billable Hours) |
| Capex % | % | SUM(Capex Hrs) / SUM(Std Billable Hours) |
| Admin % | % | SUM(Admin Hrs) / SUM(Std Billable Hours) |
| Holiday % | % | SUM(Holiday Paid Leave) / SUM(Std Billable Hours) |
| Training % | % | SUM(Trg Hrs) / SUM(Std Billable Hours) |
| Internal % | % | SUM(Internal Project Hours) / SUM(Std Billable Hours) |
| Billable Hours | Hours | SUM(Billed Hrs) |
| Capital Hours | Hours | SUM(Capex Hrs) |
| Training Hours | Hours | SUM(Trg Hrs) |
| Admin Hours | Hours | SUM(Admin Hrs) |
| Vacation Hours | Hours | SUM(Vacn Hrs taken) |
| Holiday Hours | Hours | SUM(Holiday Paid Leave) |
| Internal Project Hours | Hours | SUM(Internal Project Hours) |
| Not Approved Hours | Hours | SUM(Not Approved Hrs) |
| CC Plan Util % | Plan % | CC Planned Hrs / CC Std Hrs |
| T2 Plan Util % | Plan % | T2 Planned Hrs / T2 Std Hrs |

**Plan only exists for Util%** — no plan for raw hour metrics.

### System Prompt (`prompt.py`)

Injected context per query:
- DuckDB table schemas (column names + types for all 3 tables)
- Full metrics catalog
- Business rules:
  - Always use `Month` column; never derive month from `WeekendDate`
  - YTD = Jan → specified/latest month; aggregate numerator and denominator separately across months before dividing
  - MTD = specified or latest month only
  - Plan/variance applies to Util% only
  - Week-level plan: join `cc_plan` on `Cost Center + Month`; join `t2_plan` on `HTS_T2 + Month`; plan value repeats per week in result
  - Variance = Actual Util% − Plan Util% (absolute)
  - Default hours metric = `SUM(Billed Hrs)`
  - Raw column query: aggregated (`SUM` grouped) if summary-phrased; row-level if detail-phrased
  - Missing plan entry → flag `plan_available: false` in response

### LLM (`llm.py`)
- Ollama HTTP API, model: `qwen2.5-coder:32b`
- Input: system prompt + user query string
- Output: raw SQL string

### Executor (`executor.py`)
- Runs validated SQL against DuckDB
- Returns:

```json
{
  "rows": [...],
  "columns": [...],
  "row_count": 42,
  "chart_hint": "line | bar | pie | null",
  "plan_available": true
}
```

**Chart hint heuristic:**
- Time dimension present (WeekendDate / Month) → `line`
- Categorical comparison, >1 group → `bar`
- Composition (≤6 categories, shares of whole) → `pie`
- Detail / row-level → `null`

### Validator (`validator.py`)
- Reject SQL containing `DROP`, `DELETE`, `INSERT`, `UPDATE`, `CREATE`, `ALTER`
- Parse-check with DuckDB `EXPLAIN` before execution

---

## Phase 3 — Backend API

**Goal:** REST API consumed by React frontend.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/query` | NL query → result set + metadata |
| `POST` | `/explain` | Prior result → narrative summary |
| `GET` | `/health` | Liveness check |

### Request / Response Shapes

**POST /query**
```json
// Request
{ "query": "show me util% for HTS_SC in March YTD" }

// Response
{
  "rows": [...],
  "columns": ["Cost Center", "Month", "Util %"],
  "row_count": 3,
  "chart_hint": "bar",
  "plan_available": true,
  "temporal_mode": "YTD"
}
```

**POST /explain**
```json
// Request
{ "query": "...", "result": [...] }

// Response
{ "narrative": "HTS_SC achieved 78% utilization YTD through March..." }
```

**GET /health**
```json
{ "status": "ok", "db_connected": true, "llm_reachable": true }
```

---

## Phase 4 — Frontend

**Goal:** React UI with query input, results table, auto-chart, and narrative.

### Components

| Component | Responsibility |
|---|---|
| `QueryInput` | Text input + submit button |
| `ResultTable` | Tabular result display |
| `ResultChart` | Auto-type chart using `chart_hint` from backend (Recharts) |
| `NoPlanBadge` | Shown in result header when `plan_available: false` |
| `ExplainButton` | Triggers `POST /explain`, renders narrative below result |

### Behaviour
- Submit query → `POST /query` → render table + chart (if `chart_hint` is set)
- "Explain this" button → `POST /explain` → narrative rendered below result
- `plan_available: false` → `NoPlanBadge` shown in result header
- URL param `?q=<encoded query>` pre-populates input on mount (for Phase 5)

**Chart library:** Recharts

---

## Phase 5 — Integration Prep

**Goal:** Make the app deep-linkable from the future external webapp.

### Tasks
1. On mount, read `?q=` URL param and pre-populate the query input
2. Auto-submit if `?q=` param is present
3. Document the integration contract in `docs/implementation/INTEGRATION_CONTRACT.md`:
   - Base URL format
   - `?q=` param spec
   - Expected backend port
4. Update the README.md to give concise overview of the project and link the available docs.

---

## Verification Checklist

| Area | Test |
|---|---|
| Ingest | Run CLI; confirm 3 DuckDB tables populated; row counts match xlsx |
| Schema validation | Feed a malformed xlsx; confirm ingest errors cleanly |
| Metrics | Unit-test catalog formulas with known data from `Data-lite.xlsx` |
| NL→SQL | Smoke-test 10 queries: monthly Util%, YTD, MTD, plan vs actual, variance, raw hours, week-level CC plan, missing plan entry, row-level detail, chart hint detection |
| API | `GET /health` returns ok; `POST /query` returns expected JSON shape |
| Frontend | Table renders on query; chart appears on aggregation query; "no plan available" badge shows on missing plan; "Explain this" returns narrative |
