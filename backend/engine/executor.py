# -----------------------------------------------------------------------------
# executor.py — Runs the validated SQL against DuckDB and formats the result.
#
# This is the final step in the query pipeline:
#   NL query → LLM → SQL → [validator] → executor → result
#
# The executor does three things:
#   1. Runs the SQL and retrieves the result rows and column names
#   2. Determines a "chart hint" — what type of chart best fits the result shape
#   3. Detects whether plan data was requested but unavailable (all NULLs)
#
# CHART HINT LOGIC:
#   The frontend uses this hint to automatically pick the right chart type.
#   - "line"  → result has a time dimension (weekend_date or month across multiple months)
#   - "bar"   → result has a categorical dimension and one or more numeric metrics
#   - "pie"   → result has ≤ 5 rows and a single numeric metric (composition view)
#   - null    → single row result, or detail/row-level data — show as table only
# -----------------------------------------------------------------------------

import duckdb


def detect_chart_hint(columns: list[str], rows: list[dict]) -> str | None:
    """
    Looks at the result shape and returns a suggested chart type.

    columns — list of column names from the query result
    rows    — list of result rows as dicts
    """

    # A single row result is just a summary number — no chart needed
    if len(rows) <= 1:
        return None

    col_names_lower = [c.lower() for c in columns]

    # If the result has a date column, it's a time series — best shown as a line chart
    if "weekend_date" in col_names_lower:
        return "line"

    # If there's a month column with multiple distinct months, it's a time series
    if "month" in col_names_lower:
        month_values = {row.get("month") or row.get("Month") for row in rows}
        if len(month_values) > 1:
            return "line"

    # Count how many columns are numeric (these are the metric values)
    numeric_cols = [
        c for c, val in zip(columns, rows[0].values())
        if isinstance(val, (int, float)) and not isinstance(val, bool)
    ]

    # Pie chart: only when the numeric values form a composition (sum ≈ 100).
    # This catches cases like "breakdown of hours by category" where values add to ~100%.
    # Util %, Admin %, etc. across cost centers do NOT sum to 100, so they get bar charts.
    if len(numeric_cols) == 1 and len(rows) <= 6:
        numeric_key = numeric_cols[0]
        total = sum(row.get(numeric_key) or 0 for row in rows)
        if 95 <= total <= 105:
            return "pie"

    # Default for categorical + numeric data: bar chart
    if numeric_cols:
        return "bar"

    # No numeric columns — just show as a table
    return None


def check_plan_available(columns: list[str], rows: list[dict]) -> bool:
    """
    Checks whether plan data was included in the result and has actual values.

    If the query joined to a plan table but no matching plan rows were found,
    the plan columns will all be NULL. In that case we flag plan as unavailable
    so the frontend can show the "no plan available" indicator.
    """
    # Find any columns whose name suggests they come from a plan table
    plan_cols = [c for c in columns if "plan" in c.lower()]

    # If there are no plan columns, plan was not part of this query
    if not plan_cols:
        return True

    # Check if at least one row has a non-NULL value in any plan column
    for row in rows:
        for col in plan_cols:
            if row.get(col) is not None:
                return True

    # All plan column values are NULL — no plan data found
    return False


def execute_sql(sql: str, conn: duckdb.DuckDBPyConnection) -> tuple[list[str], list[dict]]:
    """Runs SQL and returns (columns, rows) with no further analysis."""
    result   = conn.execute(sql)
    columns  = [desc[0] for desc in result.description]
    raw_rows = result.fetchall()
    rows     = [dict(zip(columns, row)) for row in raw_rows]
    return columns, rows


def run_query(sql: str, conn: duckdb.DuckDBPyConnection) -> dict:
    """
    Executes the SQL query and returns a structured result dictionary.

    sql  — a validated SQL string ready to execute
    conn — an open DuckDB connection

    Returns a dict with:
      columns        — list of column name strings
      rows           — list of row dicts (column name → value)
      row_count      — total number of rows returned
      chart_hint     — suggested chart type: "line", "bar", "pie", or null
      plan_available — True if plan data was found, False if all plan values are NULL
    """
    columns, rows  = execute_sql(sql, conn)
    chart_hint     = detect_chart_hint(columns, rows)
    plan_available = check_plan_available(columns, rows)

    return {
        "columns":        columns,
        "rows":           rows,
        "row_count":      len(rows),
        "chart_hint":     chart_hint,
        "plan_available": plan_available,
    }
