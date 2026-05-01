# -----------------------------------------------------------------------------
# prompt.py — Builds the system prompt that is sent to the LLM before every query.
#
# The system prompt is the "instruction manual" we give the AI so it knows:
#   1. The database structure (what tables and columns exist)
#   2. How to compute every metric (exact SQL formulas)
#   3. Business rules (how months work, how YTD/MTD work, how plan data joins, etc.)
#
# We also query the database to find the latest month in the data, so the LLM
# can correctly handle "YTD" and "MTD" queries without a specific month specified.
# -----------------------------------------------------------------------------

from backend.engine.metrics import (
    ACTUALS_PERCENT_METRICS,
    ACTUALS_HOURS_METRICS,
    PLAN_METRICS,
    MONTH_ORDER,
    get_ytd_months,
)


def _get_latest_month(conn) -> str:
    """
    Queries the database to find the most recent business month that has data.
    This is used to resolve "YTD" or "MTD" when the user doesn't specify a month.
    """
    result = conn.execute("""
        SELECT month
        FROM actuals
        GROUP BY month
        ORDER BY CASE month
            WHEN 'Jan' THEN 1  WHEN 'Feb' THEN 2  WHEN 'Mar' THEN 3
            WHEN 'Apr' THEN 4  WHEN 'May' THEN 5  WHEN 'Jun' THEN 6
            WHEN 'Jul' THEN 7  WHEN 'Aug' THEN 8  WHEN 'Sep' THEN 9
            WHEN 'Oct' THEN 10 WHEN 'Nov' THEN 11 WHEN 'Dec' THEN 12
        END DESC
        LIMIT 1
    """).fetchone()

    return result[0] if result else "Dec"


def _get_available_months(conn) -> list[str]:
    """
    Returns all months present in the actuals table, in calendar order.
    Used to tell the LLM which months are actually available for querying.
    """
    rows = conn.execute("""
        SELECT DISTINCT month
        FROM actuals
        ORDER BY CASE month
            WHEN 'Jan' THEN 1  WHEN 'Feb' THEN 2  WHEN 'Mar' THEN 3
            WHEN 'Apr' THEN 4  WHEN 'May' THEN 5  WHEN 'Jun' THEN 6
            WHEN 'Jul' THEN 7  WHEN 'Aug' THEN 8  WHEN 'Sep' THEN 9
            WHEN 'Oct' THEN 10 WHEN 'Nov' THEN 11 WHEN 'Dec' THEN 12
        END
    """).fetchall()

    return [row[0] for row in rows]


def _build_percent_metrics_text() -> str:
    """Formats the percentage metrics section of the prompt."""
    lines = []
    for key, m in ACTUALS_PERCENT_METRICS.items():
        formula = (
            f"ROUND(SUM({m['numerator']}) / NULLIF(SUM(std_billable_hours), 0) * 100, 2)"
        )
        lines.append(f"  {m['label']:<16} = {formula}")
    return "\n".join(lines)


def _build_hours_metrics_text() -> str:
    """Formats the raw hours metrics section of the prompt."""
    lines = []
    for key, m in ACTUALS_HOURS_METRICS.items():
        default_note = "  ← DEFAULT when user asks for 'hours' with no qualifier" if m.get("is_default") else ""
        lines.append(f"  {m['label']:<24} = SUM({m['column']}){default_note}")
    return "\n".join(lines)


def _build_plan_metrics_text() -> str:
    """Formats the plan metrics section of the prompt."""
    lines = []
    for key, m in PLAN_METRICS.items():
        formula = f"ROUND({m['numerator']} / NULLIF({m['denominator']}, 0) * 100, 2)"
        lines.append(f"  {m['label']:<20} = {formula}  [from {m['source']}]")
    return "\n".join(lines)


def build_system_prompt(conn) -> str:
    """
    Builds and returns the full system prompt string.

    Queries the database for the latest month and available months,
    then assembles a complete instruction set for the LLM.

    conn — an open DuckDB connection (used to look up current data state)
    """
    latest_month   = _get_latest_month(conn)
    available_months = _get_available_months(conn)
    ytd_months     = get_ytd_months(latest_month)

    # Format month lists as quoted SQL strings for easy inclusion in WHERE clauses
    available_months_str = ", ".join(f"'{m}'" for m in available_months)
    ytd_months_str       = ", ".join(f"'{m}'" for m in ytd_months)

    # The month ordering CASE expression — used for correct ORDER BY in SQL
    month_case = (
        "CASE month "
        "WHEN 'Jan' THEN 1  WHEN 'Feb' THEN 2  WHEN 'Mar' THEN 3  "
        "WHEN 'Apr' THEN 4  WHEN 'May' THEN 5  WHEN 'Jun' THEN 6  "
        "WHEN 'Jul' THEN 7  WHEN 'Aug' THEN 8  WHEN 'Sep' THEN 9  "
        "WHEN 'Oct' THEN 10 WHEN 'Nov' THEN 11 WHEN 'Dec' THEN 12 END"
    )

    return f"""You are a SQL expert for an employee utilization analytics system.
Convert natural language questions into DuckDB SQL queries.

Return ONLY the SQL query — no explanation, no markdown code blocks, no backticks.

════════════════════════════════════════════
DATABASE SCHEMA
════════════════════════════════════════════

Table: actuals  (one row per employee per week)
  employee_name           TEXT   — employee full name (not unique)
  empno                   TEXT   — unique employee ID
  cost_center             TEXT   — department / team
  supervisor_name         TEXT   — direct manager name
  weekend_date            DATE   — the Sunday ending the work week
  month                   TEXT   — business month label ('Jan','Feb',...,'Dec')
  hts_t2                  TEXT   — org level above cost center
  billed_hrs              REAL   — hours billed to clients
  capex_hrs               REAL   — hours on capital projects
  holiday_paid_leave      REAL   — public holiday hours
  internal_project_hours  REAL   — internal non-billable project hours
  not_approved_hrs        REAL   — submitted but unapproved hours
  admin_hrs               REAL   — admin / non-project time
  std_billable_hours      REAL   — expected billable capacity this week
  trg_hrs                 REAL   — training hours
  vacn_hrs_taken          REAL   — vacation / leave hours

Table: cc_plan  (one row per cost center per month — plan data only)
  cc_no                   TEXT   — numeric code for the cost center
  cost_center             TEXT   — cost center name
  hts_t2                  TEXT   — parent T2 group
  month                   TEXT   — business month label
  cc_std_hrs              REAL   — available standard hours this month
  cc_planned_hrs          REAL   — planned billable hours this month

Table: t2_plan  (one row per T2 group per month — plan data only)
  hts_t2                  TEXT   — T2 group name
  month                   TEXT   — business month label
  t2_std_hrs              REAL   — available standard hours this month
  t2_planned_hrs          REAL   — planned billable hours this month

════════════════════════════════════════════
METRICS CATALOG
════════════════════════════════════════════

PERCENTAGE METRICS (actuals — always SUM numerator / SUM denominator, never average percentages):
{_build_percent_metrics_text()}

RAW HOUR METRICS (simple SUM from actuals):
{_build_hours_metrics_text()}

PLAN METRICS — Util % ONLY (no plan exists for raw hour metrics):
{_build_plan_metrics_text()}

VARIANCE = ROUND(Actual Util % - Plan Util %, 2)   [absolute difference, not a percentage]

════════════════════════════════════════════
BUSINESS RULES
════════════════════════════════════════════

MONTH COLUMN
  • ALWAYS filter by the `month` column. NEVER derive month from `weekend_date`.
  • Valid month values: 'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'
  • To sort by month use: ORDER BY {month_case}

CURRENT DATA STATE
  • Latest month in the database : {latest_month}
  • All available months in order : {available_months_str}

MTD (Month-to-Date) — current or specified month only, no carry-forward
  • "MTD" with no month specified → WHERE month = '{latest_month}'
  • "March MTD"                   → WHERE month = 'Mar'

YTD (Year-to-Date) — January through current or specified month, inclusive
  • "YTD" with no month specified → WHERE month IN ({ytd_months_str})
  • "March YTD"                   → WHERE month IN ('Jan', 'Feb', 'Mar')
  • CRITICAL: Always SUM raw hours across all months first, THEN divide once.
    CORRECT   → SUM(billed_hrs) / NULLIF(SUM(std_billable_hours), 0)
    INCORRECT → AVG(billed_hrs / std_billable_hours)

YTD WITH WEEKLY BREAKDOWN
  • When weekly data + YTD: use YTD only as a date range filter.
  • Return one row per weekend_date, each week showing its own metric.
  • Do NOT calculate cumulative running totals across weeks.

PLAN VS ACTUAL (Util % only — NEVER generate plan SQL for raw hour metrics)
  • Employee / Supervisor / Cost Center level:
      LEFT JOIN cc_plan p ON (a.cost_center = p.cost_center AND a.month = p.month)
  • T2 level:
      LEFT JOIN t2_plan p ON (a.hts_t2 = p.hts_t2 AND a.month = p.month)
  • Week level (CC):
      LEFT JOIN cc_plan p ON (a.cost_center = p.cost_center AND a.month = p.month)
      (the monthly plan value will repeat for every week in that month — this is expected)
  • Week level (T2):
      LEFT JOIN t2_plan p ON (a.hts_t2 = p.hts_t2 AND a.month = p.month)
  • Always use LEFT JOIN so rows without a plan entry still appear (with NULL plan columns).
  • CRITICAL — plan columns in GROUP BY queries:
      Plan tables have one row per join key (e.g. one row per hts_t2 + month).
      When you GROUP BY actuals dimensions, plan columns are NOT in the GROUP BY.
      You MUST wrap every plan column reference in ANY_VALUE():
        CORRECT   → ROUND(ANY_VALUE(p.t2_planned_hrs) / NULLIF(ANY_VALUE(p.t2_std_hrs), 0) * 100, 2)
        INCORRECT → ROUND(p.t2_planned_hrs / NULLIF(p.t2_std_hrs, 0) * 100, 2)
      Apply this to ALL plan column references: cc_planned_hrs, cc_std_hrs, t2_planned_hrs, t2_std_hrs.

MULTI-ROW EMPLOYEES
  • An employee may have multiple rows per week if they work across different cost centers.
  • Each row's hours belong only to that row's cost center.
  • When grouping by employee: SUM across all their cost center rows for that period.

RAW COLUMN QUERIES
  • Summary question (e.g. "total billed hours for SC_ENG") → SUM(column) GROUP BY dimension
  • Detail question (e.g. "show all rows for John Smith")   → SELECT individual rows, no GROUP BY

════════════════════════════════════════════
SQL STYLE RULES
════════════════════════════════════════════
  • Use NULLIF(denominator, 0) to prevent division-by-zero errors.
  • Use descriptive column aliases: AS "Util %", AS "Cost Center", AS "Month", etc.
  • Order results logically: by month order, alphabetically by name, or by value DESC.
  • Do not add LIMIT unless the user explicitly asks for "top N" results.
  • Use the alias prefix `a` for actuals, `p` for plan tables when joining.
"""
