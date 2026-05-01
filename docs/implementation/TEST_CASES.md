# SmartAopAi — Test Cases

All tests were executed manually during development of Phase 1 and Phase 2.
Test data used: `Data-lite.xlsx` (7 actuals rows, 672 cc_plan rows, 168 t2_plan rows).

---

## Phase 1 — Data Infrastructure

### TC-01: Ingest blocked when no xlsx file is present

**What we tested:** The ingest script should fail gracefully when the configured folder is empty.

**How it was run:**
```bash
# Point INGEST_DIR to an empty folder
INGEST_DIR=/tmp/empty-folder python -m backend.ingest.ingest
```

**Expected result:** Clear error message — `No .xlsx file found in: /tmp/empty-folder`

**Actual result:** ✅ Script printed the error and exited cleanly without crashing.

---

### TC-02: Ingest blocked when multiple xlsx files are present

**What we tested:** If more than one .xlsx file exists in the folder, the ingest script should stop and ask the user to keep only one — ambiguity is not allowed.

**How it was run:**
```bash
# Project root contains Data-lite.xlsx and Data_Full.xlsx
INGEST_DIR=/Users/.../SmartAopAi python -m backend.ingest.ingest
```

**Expected result:** Error — `Multiple .xlsx files found: ['Data-lite.xlsx', 'Data_Full.xlsx']. Keep only one.`

**Actual result:** ✅ Script printed the error and exited cleanly.

---

### TC-03: Successful ingest with a single xlsx file

**What we tested:** Happy path — one xlsx file in the folder, all 3 sheets load correctly.

**How it was run:**
```bash
mkdir -p /tmp/smartaop-ingest
cp Data-lite.xlsx /tmp/smartaop-ingest/
INGEST_DIR=/tmp/smartaop-ingest python -m backend.ingest.ingest
```

**Expected result:**
```
Ingesting: Data-lite.xlsx
  Utilization     → actuals:  7 rows loaded
  Util CC Plan    → cc_plan:  672 rows loaded
  Util T2 Plan    → t2_plan:  168 rows loaded
Ingest complete.
```

**Actual result:** ✅ Exact match.

---

### TC-04: Database tables populated with correct data

**What we tested:** After ingest, all 3 DuckDB tables contain the expected data — correct columns, correct types, correct row counts.

**How it was run:**
```python
conn = duckdb.connect('./data/smartaop.duckdb')

# Row counts
actuals  → 7 rows
cc_plan  → 672 rows
t2_plan  → 168 rows

# Sample actuals row
SELECT * FROM actuals LIMIT 1
→ employee_name='Manoj Kumar', empno='E208657', cost_center='SC_ENG_AERO_DIGI_SOL',
  weekend_date=2026-01-04 (DATE type), month='Jan', billed_hrs=8.0 (DOUBLE type)

# Sample cc_plan row
SELECT * FROM cc_plan LIMIT 1
→ cc_no='1010000116', cost_center='AAT_ENG_APP', hts_t2='HTS_AAT',
  month='Jan', cc_std_hrs=96.0, cc_planned_hrs=67.2

# Sample t2_plan row
SELECT * FROM t2_plan LIMIT 1
→ hts_t2='HTS_AAT', month='Jan', t2_std_hrs=96.0, t2_planned_hrs=67.2
```

**Expected result:** Correct column names, correct types, correct values.

**Actual result:** ✅ All verified — dates parsed as DATE, hours as DOUBLE, text as VARCHAR.

---

### TC-05: Double-space column name handled correctly

**What we tested:** The Excel column `'Not Approved  Hrs'` (two spaces) must be correctly normalised and renamed to `not_approved_hrs` in the database.

**How it was run:** Verified by inspecting actuals schema after ingest:
```python
conn.execute("DESCRIBE actuals").df()
# not_approved_hrs present as DOUBLE ✅
```

**Expected result:** Column exists with no errors.

**Actual result:** ✅ The normalize step collapses multiple spaces before applying the rename mapping.

---

### TC-06: Ignored columns excluded from database

**What we tested:** `SWC Hrs`, `Vula Hrs`, and `Month number` must NOT appear in the `actuals` table.

**How it was run:**
```python
columns = [col[0] for col in conn.execute("DESCRIBE actuals").fetchall()]
assert 'swc_hrs' not in columns
assert 'vula_hrs' not in columns
assert 'month_number' not in columns
```

**Expected result:** None of the ignored columns present.

**Actual result:** ✅ All ignored columns correctly excluded.

---

### TC-07: Full replacement on re-ingest

**What we tested:** Running the ingest twice should replace all data — not duplicate it. Row count must remain the same after a second run.

**How it was run:**
```bash
# Run ingest twice
python -m backend.ingest.ingest
python -m backend.ingest.ingest

# Check row count
SELECT COUNT(*) FROM actuals  → 7 (not 14)
```

**Expected result:** 7 rows (not 14).

**Actual result:** ✅ Tables dropped and recreated on each run — no duplication.

---

## Phase 2 — Metrics & Query Engine

### TC-08: System prompt builds without errors

**What we tested:** `build_system_prompt()` queries the database for the latest month and available months, then assembles the full prompt string without errors.

**How it was run:**
```python
from backend.engine.prompt import build_system_prompt
conn = get_connection()
prompt = build_system_prompt(conn)

assert 'Util %' in prompt      # metrics catalog present
assert 'YTD' in prompt         # YTD rules present
assert 'MTD' in prompt         # MTD rules present
assert 'Jan' in prompt         # latest month injected
assert len(prompt) > 5000      # substantive content
```

**Expected result:** Prompt builds successfully and contains all key sections.

**Actual result:** ✅ Prompt built — 6,934 characters, all sections present.

---

### TC-09: Validator blocks DROP statement

**What we tested:** SQL containing `DROP` must be rejected before execution to protect the database.

**How it was run:**
```python
error = validate_sql("DROP TABLE actuals", conn)
assert error is not None
```

**Expected result:** Error message returned, SQL not executed.

**Actual result:** ✅ `"Query blocked: SQL contains the forbidden keyword 'DROP'."`

---

### TC-10: Validator blocks DELETE statement

**What we tested:** SQL containing `DELETE` must be rejected.

**How it was run:**
```python
error = validate_sql("DELETE FROM actuals", conn)
assert error is not None
```

**Expected result:** Error message returned.

**Actual result:** ✅ Blocked correctly.

---

### TC-11: Validator blocks INSERT statement

**What we tested:** SQL containing `INSERT` must be rejected — the system is read-only.

**How it was run:**
```python
error = validate_sql("INSERT INTO actuals VALUES (1)", conn)
assert error is not None
```

**Expected result:** Error message returned.

**Actual result:** ✅ Blocked correctly.

---

### TC-12: Validator catches SQL syntax errors

**What we tested:** Malformed SQL (e.g. typo in `FROM`) must be caught and reported before execution.

**How it was run:**
```python
error = validate_sql("SELECT * FORM actuals", conn)
assert error is not None
```

**Expected result:** Syntax error message returned (DuckDB EXPLAIN fails).

**Actual result:** ✅ `"SQL syntax error: Parser Error: ..."`

---

### TC-13: Validator passes valid SQL

**What we tested:** A well-formed SELECT query must pass validation without errors.

**How it was run:**
```python
error = validate_sql(
    "SELECT cost_center, SUM(billed_hrs) FROM actuals GROUP BY cost_center",
    conn
)
assert error is None
```

**Expected result:** `None` returned (no error).

**Actual result:** ✅ SQL passed both safety check and syntax check.

---

### TC-14: Executor returns correct result shape for categorical query

**What we tested:** A query grouping by cost center returns the right columns, row count, and chart hint.

**How it was run:**
```python
result = run_query(
    """SELECT cost_center AS "Cost Center",
       ROUND(SUM(billed_hrs)/NULLIF(SUM(std_billable_hours),0)*100,2) AS "Util %"
       FROM actuals WHERE month = 'Jan'
       GROUP BY cost_center ORDER BY cost_center""",
    conn
)

assert result['row_count'] == 3
assert 'Util %' in result['columns']
assert result['chart_hint'] == 'bar'
assert result['plan_available'] == True
```

**Expected result:** 3 rows, chart_hint=bar, plan_available=True.

**Actual result:** ✅ Exact match.

---

### TC-15: Executor returns no chart for single-row result

**What we tested:** A query that returns a single summary number (e.g. overall Util%) should not suggest a chart — it's just a number.

**How it was run:**
```python
result = run_query(
    """SELECT ROUND(SUM(billed_hrs)/NULLIF(SUM(std_billable_hours),0)*100,2) AS "Util %"
       FROM actuals""",
    conn
)

assert result['row_count'] == 1
assert result['chart_hint'] is None
```

**Expected result:** 1 row, chart_hint=None.

**Actual result:** ✅ Exact match.

---

### TC-16: Chart hint — multi-week weekend_date column → line

**What we tested:** When results include a `weekend_date` column with multiple rows, a line chart should be suggested (time series).

**How it was run (unit test on chart hint function directly):**
```python
from backend.engine.executor import _detect_chart_hint

cols = ['weekend_date', 'Util %']
rows = [
    {'weekend_date': '2026-01-04', 'Util %': 41.88},
    {'weekend_date': '2026-01-11', 'Util %': 55.0},
    {'weekend_date': '2026-01-18', 'Util %': 62.3},
]
assert _detect_chart_hint(cols, rows) == 'line'
```

**Expected result:** `'line'`

**Actual result:** ✅ Correct.

---

### TC-17: Chart hint — multi-month column → line

**What we tested:** When results have a `Month` column with multiple distinct months, a line chart should be suggested.

**How it was run:**
```python
cols = ['Month', 'Util %']
rows = [
    {'Month': 'Jan', 'Util %': 41.88},
    {'Month': 'Feb', 'Util %': 55.0},
]
assert _detect_chart_hint(cols, rows) == 'line'
```

**Expected result:** `'line'`

**Actual result:** ✅ Correct.

---

### TC-18: Chart hint — categorical dimension → bar

**What we tested:** Results with a text dimension (e.g. cost center names) and a numeric metric should suggest a bar chart.

**How it was run:**
```python
cols = ['Cost Center', 'Util %']
rows = [
    {'Cost Center': 'SC_ENG_A', 'Util %': 80.0},
    {'Cost Center': 'SC_ENG_B', 'Util %': 60.0},
    {'Cost Center': 'SC_ENG_C', 'Util %': 75.0},
]
assert _detect_chart_hint(cols, rows) == 'bar'
```

**Expected result:** `'bar'`

**Actual result:** ✅ Correct.

---

### TC-19: Chart hint — composition summing to ~100% → pie

**What we tested:** When values sum to approximately 100 (e.g. a breakdown of how hours are distributed), a pie chart should be suggested.

**How it was run:**
```python
cols = ['Category', 'Share %']
rows = [
    {'Category': 'Billed',  'Share %': 60.0},
    {'Category': 'Admin',   'Share %': 20.0},
    {'Category': 'Leave',   'Share %': 20.0},
]
assert _detect_chart_hint(cols, rows) == 'pie'
```

**Expected result:** `'pie'`

**Actual result:** ✅ Correct — sum is 100.0, within the 95–105 threshold.

---

### TC-20: Chart hint — single row → no chart

**What we tested:** A single-value result should never suggest a chart.

**How it was run:**
```python
cols = ['Util %']
rows = [{'Util %': 78.5}]
assert _detect_chart_hint(cols, rows) is None
```

**Expected result:** `None`

**Actual result:** ✅ Correct.

---

### TC-21: Executor detects plan_available when plan data exists

**What we tested:** When a query joins to `cc_plan` and matching plan rows are found, `plan_available` should be `True`.

**How it was run:**
```python
result = run_query(
    """SELECT a.cost_center AS "Cost Center",
       ROUND(SUM(a.billed_hrs)/NULLIF(SUM(a.std_billable_hours),0)*100,2) AS "Util %",
       MAX(p.cc_planned_hrs) AS "CC Plan Hrs"
       FROM actuals a
       LEFT JOIN cc_plan p ON a.cost_center = p.cost_center AND a.month = p.month
       WHERE a.month = 'Jan'
       GROUP BY a.cost_center""",
    conn
)
assert result['plan_available'] == True
```

**Expected result:** `plan_available=True`

**Actual result:** ✅ Plan data found for all 3 cost centers in Jan.

---

### TC-22: End-to-end NL→SQL pipeline

**What we tested:** A natural language question flows through the full pipeline — prompt → LLM → SQL → validator → executor → result.

**How it was run:**
```python
query = "show me util% for each cost center in Jan"
system_prompt = build_system_prompt(conn)
sql = generate_sql(system_prompt, query)
error = validate_sql(sql, conn)
result = run_query(sql, conn)   # only if error is None
```

**Model used:** `qwen2.5-coder:1.5b` (placeholder during 32B model download)

**Result:**
- SQL was generated successfully
- Validator caught an ambiguous column reference in the `ORDER BY` clause (a known 1.5B model limitation)
- The validator correctly blocked execution and surfaced a clear error

**Note:** This test is expected to pass cleanly once `qwen2.5-coder:32b` is in use. The 1.5B model is too small for reliable SQL generation but the rest of the pipeline (validator, executor) is confirmed working.

---

## Summary

| TC | Area | Description | Status |
|---|---|---|---|
| TC-01 | Ingest | No xlsx file — clear error | ✅ Pass |
| TC-02 | Ingest | Multiple xlsx files — clear error | ✅ Pass |
| TC-03 | Ingest | Single xlsx — all 3 sheets loaded | ✅ Pass |
| TC-04 | Ingest | Tables populated with correct data and types | ✅ Pass |
| TC-05 | Ingest | Double-space column name normalised | ✅ Pass |
| TC-06 | Ingest | Ignored columns excluded from DB | ✅ Pass |
| TC-07 | Ingest | Re-ingest replaces data, no duplication | ✅ Pass |
| TC-08 | Engine | System prompt builds correctly | ✅ Pass |
| TC-09 | Engine | Validator blocks DROP | ✅ Pass |
| TC-10 | Engine | Validator blocks DELETE | ✅ Pass |
| TC-11 | Engine | Validator blocks INSERT | ✅ Pass |
| TC-12 | Engine | Validator catches syntax errors | ✅ Pass |
| TC-13 | Engine | Validator passes valid SQL | ✅ Pass |
| TC-14 | Engine | Executor — categorical result shape | ✅ Pass |
| TC-15 | Engine | Executor — single row, no chart | ✅ Pass |
| TC-16 | Engine | Chart hint: weekend_date → line | ✅ Pass |
| TC-17 | Engine | Chart hint: multi-month → line | ✅ Pass |
| TC-18 | Engine | Chart hint: categorical → bar | ✅ Pass |
| TC-19 | Engine | Chart hint: composition → pie | ✅ Pass |
| TC-20 | Engine | Chart hint: single row → None | ✅ Pass |
| TC-21 | Engine | plan_available detection | ✅ Pass |
| TC-22 | Engine | End-to-end NL→SQL pipeline | ⚠️ Partial (32B model pending) |
