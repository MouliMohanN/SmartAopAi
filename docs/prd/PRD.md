# SmartAopAi — Product Requirements Document

## Overview

A natural language query interface over employee utilization data. Users ask questions in plain English and get back tables, charts, and optional narrative summaries — no SQL or data tooling required.

---

## Problem Statement

Utilization data is available weekly in Excel. Managers, supervisors, and business leads across ~300 users need self-serve access to query this data at multiple dimensions without technical help.

---

## Users

- ~300 internal users (managers, supervisors, business leads)
- No authentication required
- Future: app will be embedded in / deep-linked from an existing internal web app (users navigate to it via a button click)

---

## Data Source

### File
- Format: `.xlsx`, manually placed in a designated directory on a weekly basis
- Each upload is a **full historical dump** — prior data may be revised, so the latest file is always the source of truth
- Storage target: **DuckDB** (3 tables, full replacement on each ingest)

### Sheets & Tables

#### 1. `actuals` — Utilization sheet (grain: employee × week)

| Column | Description |
|---|---|
| Employee Name | Full name (not unique) |
| Empno | Unique employee identifier |
| Cost Center | Department / functional unit |
| Supervisor Name | Direct manager |
| HTS T2 | Org hierarchy level above Cost Center |
| WeekendDate | Week-ending date (always a Sunday) |
| Month | Business-defined month label — **always use this, never derive from WeekendDate** |
| Month number | **Ignored** |
| Billed Hrs | Hours billed to external clients |
| Capex Hrs | Hours on internally funded capital projects |
| Holiday Paid Leave | Public / company holiday hours |
| Internal Project Hours | Non-billable internal project time |
| Not Approved Hrs | Submitted but unapproved hours (treat as final, no reclassification) |
| Admin Hrs | Non-project operational time |
| Std Billable Hours | Standard billable capacity for the employee that week (taken as-is) |
| Trg Hrs | Training hours |
| Vacn Hrs taken | Vacation / personal leave hours |
| SWC Hrs | **Ignored** |
| Vula Hrs | **Ignored** |

**Key data rules:**
- Hours columns are independent (not mutually exclusive, do not sum to a total)
- Business calendar months do not align with calendar months (Jan=3w, Feb=4w, Mar=5w, Apr=4w, May=4w, Jun=5w, Jul=4w, Aug=4w, Sep=5w, Oct=4w, Nov=4w, Dec=6w) — `Month` column is always correct
- An employee can have multiple rows in the same week (split across cost centers)
- Each row's hours are attributed to its cost center only

#### 2. `cc_plan` — Util CC Plan sheet (grain: cost center × month)

| Column | Description |
|---|---|
| CC_No | Numeric identifier for cost center |
| Cost Center | Department / functional unit |
| HTS_T2 | Parent T2 for this cost center |
| Month | Business month label |
| CC Std Hrs | Standard hours for the cost center that month |
| CC Planned Hrs | Planned billable hours for the cost center that month |

#### 3. `t2_plan` — Util T2 Plan sheet (grain: HTS T2 × month)

| Column | Description |
|---|---|
| HTS_T2 | Org hierarchy T2 grouping |
| Month | Business month label |
| T2 Std Hrs | Standard hours for the T2 that month |
| T2 Planned Hrs | Planned billable hours for the T2 that month |

> Census Plan and Census Actuals sheets are out of scope for now.

---

## Metrics Catalog

### Actuals Metrics (computed by aggregating actuals table)

| Metric | Formula | Type |
|---|---|---|
| Util % | SUM(Billed Hrs) / SUM(Std Billable Hours) | % |
| Vacation % | SUM(Vacn Hrs taken) / SUM(Std Billable Hours) | % |
| Capex % | SUM(Capex Hrs) / SUM(Std Billable Hours) | % |
| Admin % | SUM(Admin Hrs) / SUM(Std Billable Hours) | % |
| Holiday % | SUM(Holiday Paid Leave) / SUM(Std Billable Hours) | % |
| Training % | SUM(Trg Hrs) / SUM(Std Billable Hours) | % |
| Internal % | SUM(Internal Project Hours) / SUM(Std Billable Hours) | % |
| Capital Hours | SUM(Capex Hrs) | Hours |
| Training Hours | SUM(Trg Hrs) | Hours |
| Admin Hours | SUM(Admin Hrs) | Hours |
| Vacation Hours | SUM(Vacn Hrs taken) | Hours |
| Holiday Hours | SUM(Holiday Paid Leave) | Hours |
| Internal Project Hours | SUM(Internal Project Hours) | Hours |
| Not Approved Hours | SUM(Not Approved Hrs) | Hours |
| Billable Hours | SUM(Billed Hrs) | Hours |
| Default (hours) | SUM(Billed Hrs) | Hours |

### Plan Metrics

Plan exists **only for Util%** — there is no plan for raw hour metrics (Billed Hours, Capital Hours, etc.).

| Metric | Formula | Source |
|---|---|---|
| CC Plan Util % | CC Planned Hrs / CC Std Hrs | cc_plan |
| T2 Plan Util % | T2 Planned Hrs / T2 Std Hrs | t2_plan |

### Variance (Plan vs Actual)

Applies **only to Util%**. Variance on raw hour metrics is not supported.

- **Definition:** Absolute — `Actual Util% − Plan Util%`
- **At Employee / Supervisor level** → maps to `cc_plan` via `Cost Center + Month`
- **At Cost Center level** → maps to `cc_plan` via `Cost Center + Month`
- **At HTS T2 level** → maps to `t2_plan` via `HTS_T2 + Month`
- **At Week level (CC dimension)** → use `cc_plan` for `Cost Center + Month`; the monthly plan value is shown as-is alongside each week's actual Util%
- **At Week level (T2 dimension)** → use `t2_plan` for `HTS_T2 + Month`; the monthly plan value is shown as-is alongside each week's actual Util%
- **At Week level (raw hours)** → no plan exists; actuals only
- **Missing plan entry** → return actuals with a "no plan available" indicator

---

## Query Dimensions

Queries must work at all of the following levels:

| Dimension | Actuals | Plan | Variance |
|---|---|---|---|
| Weekly | Yes | CC/T2 monthly plan shown as-is per week (Util% only) | Yes (Util% only, at CC or T2 dimension) |
| Monthly | Yes | Yes | Yes |
| Employee | Yes | Via CC Plan | Yes |
| Supervisor | Yes | Via CC Plan | Yes |
| Cost Center | Yes | Yes | Yes |
| HTS T2 | Yes | Yes | Yes |

---

## Features

### Natural Language Query
- User types a plain-English question
- System translates to SQL via on-prem LLM with metrics catalog injected into context
- SQL executes against DuckDB and results are returned

### Output Types
- **Table** — default for detail/row-level queries
- **Chart** — auto-selected for aggregation queries; type determined by heuristic (time dimension → line, categorical comparison → bar, composition → pie)
- **Narrative summary** — on-demand only via explicit "Explain this" action to avoid latency on every query

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Data store | DuckDB | Columnar OLAP, in-process, perfect for aggregation-heavy analytical queries |
| Backend | Python + FastAPI | Clean REST API, async, future webapp integration ready |
| Frontend | React | Componentised UI, deep-link friendly for future webapp integration |
| NL→SQL | Ollama + Qwen2.5-Coder-32B | On-prem, M4 Pro 48GB handles 32B quantised model comfortably |
| Deployment | Local machine (initial) | No cloud dependency; M4 Pro + 48GB RAM sufficient |

---

## Implementation Plan

### Phase 1 — Data Infrastructure
1. Define designated ingest directory and file naming convention
2. Build ingest pipeline: read `.xlsx` → parse 3 sheets → load into DuckDB (full replacement on each run)
3. Validate schema on ingest (column presence, type checks)
4. Expose a CLI command to trigger ingest manually

### Phase 2 — Metrics & Query Engine
1. Build metrics catalog as a structured Python dictionary (single source of truth)
2. Set up Ollama with Qwen2.5-Coder-32B
3. Design system prompt: injects DuckDB schema + metrics catalog + business rules (Month column authority, CC→T2 hierarchy, plan mapping logic)
4. Build NL→SQL pipeline: user query → LLM → SQL → DuckDB → result set
5. Add query validation layer (catch malformed SQL before execution)

### Phase 3 — Backend API
1. `POST /query` — accepts NL query, returns result set + metadata (chart type hint, plan availability flag)
2. `POST /explain` — accepts prior result, returns narrative summary
3. `GET /health` — liveness check

### Phase 4 — Frontend
1. Query input with submission
2. Result renderer: table view (default)
3. Chart renderer: auto-type selection based on metadata from backend
4. "Explain this" button wired to `/explain`
5. "No plan available" indicator in results when applicable

### Phase 5 — Integration Prep
1. Support URL query params to pre-populate query on load (for future webapp deep-link)
2. Document the integration contract

---

## Open Questions

1. **Designated ingest directory** — path and file naming convention to be confirmed.
2. **Future webapp integration mechanism** — URL params, postMessage, or iframe to be confirmed when that phase begins.
