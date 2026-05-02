# SmartAopAi — Comprehensive Technical Reference

## Table of Contents

1. [Project Purpose](#1-project-purpose)
2. [Tech Stack](#2-tech-stack)
3. [Repository Structure](#3-repository-structure)
4. [Data Layer](#4-data-layer)
5. [Backend Pipeline](#5-backend-pipeline)
6. [LLM Integration](#6-llm-integration)
7. [Frontend Architecture](#7-frontend-architecture)
8. [Streaming Protocol](#8-streaming-protocol)
9. [Metrics System](#9-metrics-system)
10. [SQL Safety & Validation](#10-sql-safety--validation)
11. [Chart Detection](#11-chart-detection)
12. [Data Ingest](#12-data-ingest)
13. [Configuration](#13-configuration)
14. [Example End-to-End Flows](#14-example-end-to-end-flows)

---

## 1. Project Purpose

SmartAopAi enables non-technical business stakeholders to query employee utilization and project allocation data using plain English. The system:

- Converts natural language questions into SQL via a local LLM
- Executes SQL against a DuckDB analytical database loaded from Excel files
- Returns results as charts, tables, and AI-generated narrative insights
- Streams all progress in real time so users see each processing step as it happens

**Target users**: Business analysts, delivery managers, resource planners who need utilization insights without writing SQL.

---

## 2. Tech Stack

### Backend

| Component | Technology | Purpose |
|---|---|---|
| Language | Python 3.x | |
| Web Framework | FastAPI + Uvicorn | Async HTTP server |
| Database | DuckDB | Embedded analytical SQL engine |
| LLM Runtime | Ollama | Local LLM inference |
| LLM Model | qwen2.5-coder:32b / gpt-oss:20b | SQL + narrative generation |
| Data Processing | Pandas, OpenPyXL | Excel ingestion |
| Validation | Pydantic | Request/response schemas |
| HTTP Client | httpx | Async calls to Ollama |

### Frontend

| Component | Technology | Purpose |
|---|---|---|
| Language | TypeScript | |
| Framework | React 19 | UI components |
| Build Tool | Vite 8 | Dev server + bundling |
| Charting | Recharts 3 | Dynamic chart rendering |
| State | Custom hooks (no Redux) | Streaming state management |

### Infrastructure

| Component | Technology |
|---|---|
| Frontend hosting | Vercel |
| LLM hosting | Local (Ollama) |
| Database | Single-file DuckDB on backend host |
| Protocol | NDJSON over chunked HTTP |

---

## 3. Repository Structure

```
SmartAopAi/
├── backend/
│   ├── api/
│   │   ├── main.py           # FastAPI app, CORS config
│   │   ├── models.py         # Pydantic schemas
│   │   └── routes/
│   │       ├── stream.py     # POST /stream — main endpoint
│   │       ├── query.py      # POST /query (legacy)
│   │       └── health.py     # GET /health
│   ├── db/
│   │   └── database.py       # DuckDB setup, DDL, connection
│   ├── engine/
│   │   ├── llm.py            # Ollama streaming client
│   │   ├── prompt.py         # System prompt builder
│   │   ├── metrics.py        # Metric definitions
│   │   ├── validator.py      # SQL safety + syntax check
│   │   └── executor.py       # SQL execution + chart hints
│   └── ingest/
│       ├── ingest.py         # Excel → DuckDB loader
│       ├── schema.py         # Column rename mappings
│       └── validate.py       # Data type validation
│
├── frontend/
│   └── src/
│       ├── App.tsx           # Root layout, suggestions sidebar
│       ├── api.ts            # HTTP client, NDJSON reader
│       ├── types.ts          # TypeScript interfaces
│       ├── hooks/
│       │   └── useStream.ts  # Main state machine
│       └── components/
│           ├── QueryInput.tsx
│           ├── StepTracker.tsx
│           ├── ResultChart.tsx
│           ├── ResultTable.tsx
│           ├── NarrativePanel.tsx
│           ├── SqlPanel.tsx
│           ├── ResultSkeleton.tsx
│           ├── ExplainButton.tsx
│           └── NoPlanBadge.tsx
│
├── data/inputFile/           # Drop Excel files here
├── docs/
├── .env.example
└── requirements.txt
```

---

## 4. Data Layer

### Tables

DuckDB holds three tables, all loaded from Excel sheets:

**`actuals`** — weekly employee actual hours

| Column | Description |
|---|---|
| `employee_id` | Unique employee identifier |
| `employee_name` | Full name |
| `weekend_date` | Week-ending date (Saturday) |
| `billable_hours` | Client-billable hours worked |
| `non_billable_hours` | Internal non-billable hours |
| `vacation_hours` | PTO/vacation |
| `training_hours` | Training and certifications |
| `total_hours` | Sum of all hour types |
| `project_code` | Associated project |
| `cost_center` | Org cost center |

**`cc_plan`** — cost-center planned hours per week

**`t2_plan`** — T2 hierarchy planned hours per week

### Key metrics derived in SQL

```sql
-- Utilization %
SUM(billable_hours) / NULLIF(SUM(total_hours), 0) * 100

-- Billable hours YTD (example for 2024)
SUM(CASE WHEN YEAR(weekend_date) = 2024 THEN billable_hours ELSE 0 END)

-- MTD utilization
SUM(CASE WHEN DATE_TRUNC('month', weekend_date) = DATE_TRUNC('month', CURRENT_DATE)
         THEN billable_hours ELSE 0 END)
/ NULLIF(SUM(CASE WHEN DATE_TRUNC('month', weekend_date) = DATE_TRUNC('month', CURRENT_DATE)
                  THEN total_hours ELSE 0 END), 0) * 100
```

---

## 5. Backend Pipeline

The main endpoint `POST /stream` runs a **6-step sequential pipeline**. Each step emits NDJSON events to the frontend as it starts and completes.

```
Question
  │
  ▼
[Step 1: Analyzing]
  Load DB schema → list available months → build system prompt
  │
  ▼
[Step 2: Generating SQL]
  Send prompt + question to Ollama → stream SQL tokens
  Emit token events for real-time display
  │
  ▼
[Step 3: Validating SQL]
  Check for forbidden keywords (DELETE, DROP, INSERT…)
  Run EXPLAIN to catch syntax errors without executing
  │
  ▼
[Step 4: Executing]
  Run SQL on DuckDB → get result rows + column names
  Check if plan data requested but all nulls → NoPlan flag
  │
  ▼
[Step 5: Detecting Chart]
  Analyze result shape → emit chart type hint (line/bar/pie/null)
  │
  ▼
[Step 6: Generating Insights]
  Send result data to Ollama → stream narrative tokens
  Emit token events for real-time display
```

### Step event format

```json
{"event": "step", "step": "analyzing", "status": "active"}
{"event": "step", "step": "analyzing", "status": "done"}
{"event": "step", "step": "generating_sql", "status": "active"}
{"event": "token", "content": "SELECT"}
{"event": "token", "content": " employee_name"}
...
{"event": "step", "step": "generating_sql", "status": "done", "sql": "SELECT ..."}
```

---

## 6. LLM Integration

### System prompt composition (`engine/prompt.py`)

The prompt is built dynamically at query time and contains:

1. **Role instruction** — "You are a SQL expert for workforce analytics"
2. **Database schema** — full DDL of all three tables
3. **Available months** — list of distinct `weekend_date` months in current data
4. **Metric formulas** — every defined metric with its SQL expression
5. **Business rules** — how to compute YTD, MTD, plan vs actuals joins
6. **Output format** — "Return only the SQL query, no explanation"

### Example prompt snippet

```
You are a SQL expert for workforce analytics.

Schema:
  CREATE TABLE actuals (
    employee_id VARCHAR,
    employee_name VARCHAR,
    weekend_date DATE,
    billable_hours DOUBLE,
    ...
  );

Available months in data: 2024-01, 2024-02, ..., 2024-12

Metrics:
  utilization_pct = SUM(billable_hours) / NULLIF(SUM(total_hours),0) * 100
  billable_hours  = SUM(billable_hours)
  vacation_hours  = SUM(vacation_hours)
  ...

Rules:
  - For YTD: filter WHERE YEAR(weekend_date) = <year>
  - For MTD: filter WHERE DATE_TRUNC('month', weekend_date) = DATE_TRUNC('month', CURRENT_DATE)
  - Join actuals with cc_plan on (cost_center, weekend_date) for plan vs actuals

Question: {user_question}

Return only the SQL query.
```

### Ollama client (`engine/llm.py`)

Uses httpx async streaming to consume Ollama's token-by-token response:

```python
async def stream_sql(prompt: str) -> AsyncIterator[str]:
    async with httpx.AsyncClient() as client:
        async with client.stream("POST", f"{OLLAMA_BASE_URL}/api/generate",
                                  json={"model": MODEL, "prompt": prompt}) as r:
            async for line in r.aiter_lines():
                data = json.loads(line)
                yield data["response"]
                if data.get("done"):
                    break
```

---

## 7. Frontend Architecture

### State management — `useStream.ts`

All interaction state lives in a single custom hook. Key state shape:

```typescript
interface Interaction {
  id: string
  question: string
  sql: string | null
  result: QueryResult | null
  narrative: string
  steps: Step[]           // 6 steps with status: idle | active | done | error
  chartHint: ChartHint    // "line" | "bar" | "pie" | null
  noPlanData: boolean
  status: "idle" | "streaming" | "done" | "error"
  sqlTokenBuffer: string  // accumulates SQL tokens during generation
}
```

The hook exposes:
- `submit(question)` — starts a new streaming interaction
- `abort()` — cancels via AbortController
- `interactions` — array of all past interactions (chat history)

### Component tree

```
App.tsx
├── QueryInput          ← text input + submit
└── InteractionList
    └── Interaction (per query)
        ├── StepTracker     ← 6-step live progress bar
        ├── SqlPanel        ← collapsible, shows SQL tokens as they stream
        ├── ResultSkeleton  ← shown while executing
        ├── ResultChart     ← Recharts, hidden when chartHint = null
        ├── ResultTable     ← always shown when result exists
        ├── NoPlanBadge     ← shown when plan data requested but unavailable
        └── NarrativePanel  ← streams AI narrative tokens
```

### Chart rendering — `ResultChart.tsx`

Recharts chart type is selected based on `chartHint`:

```typescript
switch (chartHint) {
  case "line": return <LineChart data={rows} />
  case "bar":  return <BarChart data={rows} />
  case "pie":  return <PieChart data={rows} />
  default:     return null  // table only
}
```

---

## 8. Streaming Protocol

The frontend and backend communicate via **NDJSON** (newline-delimited JSON) over a single HTTP POST with chunked transfer encoding.

### Event types

| Event | Fields | Description |
|---|---|---|
| `step` | `step`, `status` | Pipeline step lifecycle |
| `token` | `content` | Single LLM output token |
| `result` | `columns`, `rows` | SQL execution result |
| `chart_hint` | `type` | Suggested chart type |
| `no_plan` | `value` | Plan data unavailable flag |
| `error` | `message` | Error details |
| `done` | — | Stream complete |

### Example full stream

```
{"event":"step","step":"analyzing","status":"active"}
{"event":"step","step":"analyzing","status":"done"}
{"event":"step","step":"generating_sql","status":"active"}
{"event":"token","content":"SELECT "}
{"event":"token","content":"employee_name, "}
{"event":"token","content":"SUM(billable_hours) as billable_hours "}
{"event":"token","content":"FROM actuals "}
{"event":"token","content":"WHERE YEAR(weekend_date) = 2024 "}
{"event":"token","content":"GROUP BY employee_name "}
{"event":"token","content":"ORDER BY billable_hours DESC"}
{"event":"step","step":"generating_sql","status":"done","sql":"SELECT ..."}
{"event":"step","step":"validating_sql","status":"active"}
{"event":"step","step":"validating_sql","status":"done"}
{"event":"step","step":"executing","status":"active"}
{"event":"result","columns":["employee_name","billable_hours"],"rows":[["Alice",1840],["Bob",1620]]}
{"event":"step","step":"executing","status":"done"}
{"event":"step","step":"detecting_chart","status":"active"}
{"event":"chart_hint","type":"bar"}
{"event":"step","step":"detecting_chart","status":"done"}
{"event":"step","step":"generating_insights","status":"active"}
{"event":"token","content":"Alice led the team with 1,840 billable hours in 2024..."}
{"event":"step","step":"generating_insights","status":"done"}
{"event":"done"}
```

---

## 9. Metrics System

All metrics are defined in `engine/metrics.py` as a registry. Each entry has:

```python
@dataclass
class Metric:
    name: str           # canonical name
    aliases: list[str]  # natural language synonyms
    type: str           # "percent" | "hours" | "plan_percent"
    formula: str        # SQL expression
```

### Defined metrics (examples)

| Name | Aliases | Formula |
|---|---|---|
| `utilization_pct` | util, utilization, util% | `SUM(billable_hours) / NULLIF(SUM(total_hours),0) * 100` |
| `billable_hours` | billable, billed hours | `SUM(billable_hours)` |
| `vacation_hours` | vacation, pto | `SUM(vacation_hours)` |
| `training_hours` | training | `SUM(training_hours)` |
| `plan_utilization_pct` | planned util, plan% | `SUM(plan_billable) / NULLIF(SUM(plan_total),0) * 100` |

The full metrics registry is injected into the LLM system prompt, so the model understands business terminology and generates correct SQL formulas.

---

## 10. SQL Safety & Validation

### Two-stage validation (`engine/validator.py`)

**Stage 1 — Keyword blocklist**

Rejects any SQL containing write or DDL keywords:

```python
FORBIDDEN = {"DELETE", "DROP", "INSERT", "UPDATE", "CREATE",
             "ALTER", "TRUNCATE", "REPLACE", "MERGE"}

def check_forbidden(sql: str) -> None:
    tokens = sql.upper().split()
    for token in tokens:
        if token in FORBIDDEN:
            raise ValidationError(f"Forbidden keyword: {token}")
```

**Stage 2 — Syntax check via EXPLAIN**

Runs `EXPLAIN <sql>` against DuckDB without executing. Catches LLM syntax errors:

```python
def check_syntax(sql: str, conn) -> None:
    try:
        conn.execute(f"EXPLAIN {sql}")
    except duckdb.Error as e:
        raise ValidationError(f"SQL syntax error: {e}")
```

If either stage fails, the pipeline emits an error step event and stops without executing anything.

---

## 11. Chart Detection

After execution, `executor.py` analyzes the result shape to recommend a chart type:

```python
def detect_chart_hint(columns, rows) -> str | None:
    if len(rows) == 0 or len(columns) < 2:
        return None

    # Time series: first column is a date
    if is_date_column(columns[0]):
        return "line"

    # Composition: single numeric column, values roughly sum to 100
    if len(columns) == 2 and is_percent_like(rows):
        return "pie"

    # Categorical + numeric
    if len(columns) >= 2 and is_numeric(columns[1]):
        return "bar"

    return None
```

---

## 12. Data Ingest

Excel files dropped in `data/inputFile/` are loaded via `ingest/ingest.py`.

### Process

1. Read all sheets from the `.xlsx` file using `openpyxl`/`pandas`
2. Rename columns per `schema.py` mapping rules
3. Validate data types per `validate.py` rules
4. Drop and recreate the target DuckDB table
5. Bulk insert all rows

### Column mapping example (`ingest/schema.py`)

```python
ACTUALS_COLUMN_MAP = {
    "Employee ID":       "employee_id",
    "Employee Name":     "employee_name",
    "Week Ending Date":  "weekend_date",
    "Billable Hours":    "billable_hours",
    "Non-Billable Hrs":  "non_billable_hours",
    "Vacation":          "vacation_hours",
    "Training":          "training_hours",
    "Total Hours":       "total_hours",
    "Project Code":      "project_code",
    "Cost Center":       "cost_center",
}
```

Ingest is triggered manually (run `ingest.py` directly) and does a **full replace** — there is no incremental/upsert logic.

---

## 13. Configuration

All runtime config is driven by `.env`:

```bash
# Database
DB_PATH=./data/smartaop.duckdb

# Ingest
INGEST_DIR=./data/inputFile

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5-coder:32b
OLLAMA_TIMEOUT=120

# CORS (comma-separated)
ALLOWED_ORIGINS=http://localhost:5173,https://your-app.vercel.app
```

---

## 14. Example End-to-End Flows

### Example 1 — "Who had the highest utilization in Q1 2024?"

**Step 1 — Analyzing**
System prompt built with schema + metrics. Available months: Jan–Dec 2024 detected.

**Step 2 — Generating SQL**
```sql
SELECT
    employee_name,
    ROUND(SUM(billable_hours) / NULLIF(SUM(total_hours), 0) * 100, 1) AS utilization_pct
FROM actuals
WHERE weekend_date BETWEEN '2024-01-01' AND '2024-03-31'
GROUP BY employee_name
ORDER BY utilization_pct DESC
LIMIT 10
```

**Step 3 — Validating**
No forbidden keywords. EXPLAIN passes.

**Step 4 — Executing**
Returns 10 rows: `[("Alice Chen", 94.2), ("Bob Park", 91.8), ...]`

**Step 5 — Detecting Chart**
Column 0 is varchar (name), column 1 is numeric → `"bar"`

**Step 6 — Generating Insights**
> "Alice Chen led the team in Q1 2024 with a 94.2% utilization rate, closely followed by Bob Park at 91.8%. The top 10 employees all exceeded 85%, indicating strong billable demand across the team during this period."

---

### Example 2 — "Show me weekly billable hours trend for the data team in 2024"

**Generated SQL**
```sql
SELECT
    weekend_date,
    SUM(billable_hours) AS billable_hours
FROM actuals
WHERE YEAR(weekend_date) = 2024
  AND cost_center = 'Data'
GROUP BY weekend_date
ORDER BY weekend_date
```

**Chart hint**: `"line"` (column 0 is a date)

**Result**: A line chart with weeks on x-axis, billable hours on y-axis.

---

### Example 3 — "Compare actual vs planned utilization by cost center this year"

**Generated SQL**
```sql
SELECT
    a.cost_center,
    ROUND(SUM(a.billable_hours) / NULLIF(SUM(a.total_hours), 0) * 100, 1) AS actual_util_pct,
    ROUND(SUM(p.plan_billable) / NULLIF(SUM(p.plan_total), 0) * 100, 1)   AS plan_util_pct
FROM actuals a
LEFT JOIN cc_plan p ON a.cost_center = p.cost_center
                    AND a.weekend_date = p.weekend_date
WHERE YEAR(a.weekend_date) = 2024
GROUP BY a.cost_center
ORDER BY actual_util_pct DESC
```

**NoPlan flag**: If all `plan_util_pct` values are NULL, frontend shows `NoPlanBadge` — "No plan data available for this query."

**Chart hint**: `"bar"` (categorical + two numeric columns)

---

### Example 4 — Blocked query attempt

**User**: "Delete all records from actuals"

**Generated SQL**: `DELETE FROM actuals`

**Validation**: Keyword `DELETE` in blocklist → error emitted immediately

**Frontend**: Step 3 (Validating SQL) shows error status. No SQL executed.
