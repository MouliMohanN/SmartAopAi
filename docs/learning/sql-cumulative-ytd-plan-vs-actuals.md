# SQL Concepts: Cumulative YTD, Fan-out, CTEs, and Plan vs Actuals

## The Problem We Solved

When building plan vs actuals queries, the first instinct is to JOIN the plan table to actuals and then aggregate. This produces **wrong plan numbers** because of a problem called fan-out. The correct approach is to aggregate actuals and plan **independently** in separate CTEs, then join the already-aggregated results.

This document explains every concept involved with real examples from this project's data.

---

## 1. CTE (Common Table Expression)

A CTE is a named temporary result you define at the top of a SQL query using `WITH`. It works like giving a name to a sub-query so you can reference it like a table later in the same query. It only exists for the duration of that one query — it is not stored in the database.

### Why use CTEs?

- Breaks a complex query into readable named steps
- Lets you reuse the same intermediate result multiple times
- Makes it possible to aggregate two things independently before joining them (the key technique in this project)

### Example

**Without CTE — nested and hard to read:**
```sql
SELECT hts_t2, ROUND(SUM(billed_hrs) / SUM(std_billable_hours) * 100, 1) AS "Util %"
FROM (SELECT * FROM actuals WHERE month IN ('Jan','Feb','Mar')) sub
GROUP BY hts_t2
```

**With CTE — named and clear:**
```sql
WITH actuals_ytd AS (
    SELECT hts_t2,
           SUM(billed_hrs)          AS total_billed,
           SUM(std_billable_hours)  AS total_std
    FROM actuals
    WHERE month IN ('Jan','Feb','Mar')
    GROUP BY hts_t2
)
SELECT
    hts_t2,
    ROUND(total_billed / NULLIF(total_std, 0) * 100, 1) AS "Util %"
FROM actuals_ytd
```

Same result. `actuals_ytd` is the CTE — a named intermediate step.

---

## 2. Dimension (dim)

A dimension is the column (or columns) you are grouping or slicing data by. It defines the granularity of your output — one row per unique combination of dimension values.

In this project, the common dimensions are:

| User asks for | Dimension column(s) |
|---|---|
| T2 level | `hts_t2` |
| Cost Center level | `cost_center` |
| Employee level | `employee_name` |
| Supervisor level | `supervisor_name` |
| Month-wise | `month` (added to whatever other dimension) |
| Week-wise | `weekend_date` |

When a query says "GROUP BY dim" it means GROUP BY whatever dimension the user is asking for. For "T2 level util" the dim is `hts_t2`. For "CC level month-wise util" the dims are `cost_center` and `month`.

---

## 3. Fan-out

Fan-out is the inflation of values that happens when you JOIN a monthly table to a weekly table **before** aggregating. Each monthly plan row gets duplicated once per week row that matches it — causing `SUM` on plan columns to multiply by the number of weeks.

### Why this happens in our data

`t2_plan` has **one row per T2 per month**:

| hts_t2 | month | t2_planned_hrs | t2_std_hrs |
|---|---|---|---|
| Consulting | Jan | 10,000 | 12,000 |

`actuals` has **four rows for Consulting in January** (one per week):

| hts_t2 | month | billed_hrs | std_billable_hours |
|---|---|---|---|
| Consulting | Jan | 2,100 | 3,000 |
| Consulting | Jan | 2,300 | 3,000 |
| Consulting | Jan | 1,900 | 3,000 |
| Consulting | Jan | 2,200 | 3,000 |

### What JOIN does before aggregation

When you join actuals to t2_plan on `hts_t2 + month`, the one plan row attaches to all four actuals rows:

| hts_t2 | month | billed_hrs | t2_planned_hrs |
|---|---|---|---|
| Consulting | Jan | 2,100 | **10,000** |
| Consulting | Jan | 2,300 | **10,000** |
| Consulting | Jan | 1,900 | **10,000** |
| Consulting | Jan | 2,200 | **10,000** |

Now if you run `SUM(t2_planned_hrs)`:

```
10,000 + 10,000 + 10,000 + 10,000 = 40,000   ← WRONG (4× the real value)
```

But `SUM(billed_hrs)` = 8,500 ← correct (each week's hours are distinct).

This is fan-out. The plan number got multiplied by 4 (the number of weeks in that month).

### The fix: aggregate each side independently, then join

```sql
WITH actuals_jan AS (
    SELECT hts_t2,
           SUM(billed_hrs)         AS total_billed,
           SUM(std_billable_hours) AS total_std
    FROM actuals
    WHERE month = 'Jan'
    GROUP BY hts_t2
),
plan_jan AS (
    SELECT hts_t2,
           SUM(t2_planned_hrs) AS total_planned,
           SUM(t2_std_hrs)     AS total_plan_std
    FROM t2_plan
    WHERE month = 'Jan'
    GROUP BY hts_t2
)
SELECT
    a.hts_t2                                                         AS "T2 Group",
    ROUND(a.total_billed   / NULLIF(a.total_std, 0)      * 100, 1)  AS "Util %",
    ROUND(p.total_planned  / NULLIF(p.total_plan_std, 0) * 100, 1)  AS "Plan Util %",
    ROUND(
        (a.total_billed  / NULLIF(a.total_std, 0)) -
        (p.total_planned / NULLIF(p.total_plan_std, 0))
    ) * 100, 1)                                                      AS "Variance"
FROM actuals_jan a
LEFT JOIN plan_jan p ON a.hts_t2 = p.hts_t2
ORDER BY a.hts_t2
```

Both sides are already aggregated before the join. The plan row for Consulting = 10,000 exactly. No fan-out.

**The universal rule:** Never reference plan table columns inside a GROUP BY query that also touches actuals. Always aggregate each table into its own CTE first.

---

## 4. Anchor Month (for running cumulative YTD)

The anchor month is only relevant for the YTD month-wise (running cumulative) case. It is the output month each row represents — and it acts as the upper boundary of the cumulation window for that row.

### What "running cumulative" means

"T2 level month-wise YTD util" should return one row per T2 per month, where each month's % is computed from all data from January up to and including that month:

| Month (anchor) | T2 | Util % | Actuals included in this row |
|---|---|---|---|
| Jan | Consulting | 84.2% | Jan only |
| Feb | Consulting | 83.7% | Jan + Feb |
| Mar | Consulting | 85.1% | Jan + Feb + Mar |
| Apr | Consulting | 84.8% | Jan + Feb + Mar + Apr |

The March row's Util % is not just March's data — it is the cumulative sum of billed hours (Jan+Feb+Mar) divided by the cumulative sum of standard hours (Jan+Feb+Mar). This gives the true YTD picture as of March.

### How the anchor join works

To build this, we assign a sequence number to each month (Jan=1, Feb=2, ...) and then join actuals to each anchor month where `actuals.month_num <= anchor.month_num`:

```
For anchor = Mar (num = 3):
  Jan actuals (num=1) → 1 <= 3 ✓ included
  Feb actuals (num=2) → 2 <= 3 ✓ included
  Mar actuals (num=3) → 3 <= 3 ✓ included
  Apr actuals (num=4) → 4 <= 3 ✗ excluded
```

The same logic applies to the plan CTE — for the March anchor row, we sum `t2_planned_hrs` for Jan+Feb+Mar from `t2_plan`.

### SQL structure for running cumulative

```sql
WITH month_seq AS (
    -- Assigns a sort number to every possible month
    SELECT month,
           CASE month
               WHEN 'Jan' THEN 1  WHEN 'Feb' THEN 2  WHEN 'Mar' THEN 3
               WHEN 'Apr' THEN 4  WHEN 'May' THEN 5  WHEN 'Jun' THEN 6
               WHEN 'Jul' THEN 7  WHEN 'Aug' THEN 8  WHEN 'Sep' THEN 9
               WHEN 'Oct' THEN 10 WHEN 'Nov' THEN 11 WHEN 'Dec' THEN 12
           END AS n
    FROM (VALUES ('Jan'),('Feb'),('Mar'),('Apr'),('May'),('Jun'),
                 ('Jul'),('Aug'),('Sep'),('Oct'),('Nov'),('Dec')) t(month)
),
ytd_anchors AS (
    -- The output months we want rows for (Jan through latest)
    SELECT month, n FROM month_seq WHERE month IN ('Jan','Feb','Mar','Apr')
),
actuals_cumulative AS (
    -- For each anchor month, sum all actuals from Jan up to that anchor
    SELECT
        anc.month  AS anchor_month,
        anc.n      AS anchor_n,
        a.hts_t2,
        SUM(a.billed_hrs)         AS cum_billed,
        SUM(a.std_billable_hours) AS cum_std
    FROM actuals a
    JOIN month_seq ms  ON ms.month = a.month
    JOIN ytd_anchors anc ON ms.n <= anc.n        -- ← the cumulative window condition
    WHERE a.month IN ('Jan','Feb','Mar','Apr')
    GROUP BY anc.month, anc.n, a.hts_t2
),
plan_cumulative AS (
    -- Same logic applied to the plan table independently
    SELECT
        anc.month  AS anchor_month,
        anc.n      AS anchor_n,
        p.hts_t2,
        SUM(p.t2_planned_hrs) AS cum_planned,
        SUM(p.t2_std_hrs)     AS cum_plan_std
    FROM t2_plan p
    JOIN month_seq ms  ON ms.month = p.month
    JOIN ytd_anchors anc ON ms.n <= anc.n        -- ← same cumulative window
    WHERE p.month IN ('Jan','Feb','Mar','Apr')
    GROUP BY anc.month, anc.n, p.hts_t2
)
SELECT
    ac.anchor_month                                                       AS "Month",
    ac.hts_t2                                                             AS "T2 Group",
    ROUND(ac.cum_billed   / NULLIF(ac.cum_std, 0)       * 100, 1)        AS "Util %",
    ROUND(pc.cum_planned  / NULLIF(pc.cum_plan_std, 0)  * 100, 1)        AS "Plan Util %",
    ROUND(
        (ac.cum_billed  / NULLIF(ac.cum_std, 0)) -
        (pc.cum_planned / NULLIF(pc.cum_plan_std, 0))
    ) * 100, 1)                                                           AS "Variance"
FROM actuals_cumulative ac
LEFT JOIN plan_cumulative pc
       ON pc.anchor_month = ac.anchor_month AND pc.hts_t2 = ac.hts_t2
ORDER BY ac.anchor_n, ac.hts_t2
```

No fan-out — actuals and plan are each aggregated in their own CTE before being joined.

---

## Summary of All Four Query Patterns

| Pattern | actuals CTE | plan CTE | JOIN key |
|---|---|---|---|
| **YTD, no month breakdown** | `WHERE month IN (ytd)` GROUP BY dim | `WHERE month IN (ytd)` GROUP BY dim | dim |
| **YTD, month-wise (running cumulative)** | Self-join on month_seq with `ms.n <= anc.n`, GROUP BY anchor+dim | Same self-join on month_seq, GROUP BY anchor+dim | anchor+dim |
| **MTD, no month breakdown** | `WHERE month = target` GROUP BY dim | `WHERE month = target` GROUP BY dim | dim |
| **MTD, month-wise (each month standalone)** | `WHERE month IN (all available)` GROUP BY month+dim | Same filter, GROUP BY month+dim | month+dim |

The pattern is always: **aggregate independently → join results**.
