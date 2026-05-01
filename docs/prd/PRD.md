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
- Storage target: **DuckDB** (converted from xlsx on ingest)

### Schema

| Column | Description |
|---|---|
| Employee Name | Full name (not unique) |
| Empno | Unique employee identifier (primary key) |
| Cost Center | Department / functional unit |
| Supervisor Name | Direct manager |
| HTS T2 | Org hierarchy level above Cost Center |
| WeekendDate | Week-ending date (always a Sunday) |
| Month | Business-defined month label — **always use this, never derive from WeekendDate** |
| Month number | Ignored |
| Billed Hrs | Hours billed to external clients |
| Capex Hrs | Hours on internally funded capital projects |
| Holiday Paid Leave | Public / company holiday hours |
| Internal Project Hours | Non-billable internal project time |
| Not Approved Hrs | Submitted but not yet manager-approved hours (treat as final, no reclassification) |
| Admin Hrs | Non-project operational time |
| Std Billable Hours | Standard billable capacity for the employee that week (taken as-is from sheet) |
| Trg Hrs | Training hours |
| Vacn Hrs taken | Vacation / personal leave hours |
| SWC Hrs | Ignored |
| Vula Hrs | Ignored |

### Key Data Rules
- Hours columns are **independent** (not mutually exclusive, do not sum to a total)
- Business calendar months do not align with calendar months (e.g. Jan = 3 weeks, Dec = 6 weeks) — the `Month` column is always correct
- An employee can have **multiple rows per week** if split across cost centers
- Each row's hours are attributed to its cost center only — no cross-attribution

---

## Core Metric

**Billable Utilization** = `Billed Hrs / Std Billable Hrs`

---

## Query Dimensions

Utilization must be queryable at all of the following levels:
- Weekly
- Monthly
- Employee
- Supervisor
- Cost Center
- HTS T2

---

## Features

### Natural Language Query
- User types a plain-English question
- System translates to SQL via on-prem LLM, executes against DuckDB, returns results

### Output Types
- **Table** — default for row-level or detail queries
- **Chart** — auto-selected for aggregation queries; chart type determined by a heuristic (cardinality, time dimension, etc.)
- **Narrative summary** — optional, triggered explicitly ("explain this") to avoid latency on every query

---

## Tech Stack

| Layer | Choice |
|---|---|
| Data store | DuckDB |
| Backend | Python + FastAPI |
| Frontend | React |
| NL→SQL | On-prem LLM (model TBD, pending hardware spec) |
| Deployment | Local machine (initial), no cloud dependency |

---

## Open Questions

1. **On-prem LLM hardware spec** — RAM and GPU available on the deployment machine determines which model is viable for NL→SQL.
2. **Chart type heuristic** — needs design: how to auto-select bar vs line vs pie based on query shape.
3. **Designated ingest directory** — path and file naming convention to be defined.
4. **Future webapp integration** — integration mechanism (URL params, postMessage, iframe) to be confirmed when that phase begins.
