# -----------------------------------------------------------------------------
# metrics.py — The single source of truth for every metric the system knows about.
#
# This file defines ALL metrics that users can query in plain English.
# It is used in two places:
#   1. Injected into the LLM's system prompt so it knows the exact SQL formulas
#   2. Referenced by the executor to interpret result columns
#
# HOW TO READ THIS FILE:
#   Each metric has a "type" which is one of:
#     "percent"      — a percentage computed from actuals (e.g. Util %)
#     "hours"        — a raw hour sum from actuals (e.g. Billable Hours)
#     "plan_percent" — a planned percentage from the plan tables (e.g. CC Plan Util %)
#
#   For "percent" metrics, the formula is:
#     ROUND(SUM(numerator_col) / NULLIF(SUM(std_billable_hours), 0) * 100, 2)
#
#   For "hours" metrics, the formula is:
#     SUM(column)
#
#   For "plan_percent" metrics, the formula is:
#     ROUND(numerator_col / NULLIF(denominator_col, 0) * 100, 2)
#     (no SUM needed — plan table already stores totals per CC/T2 per month)
# -----------------------------------------------------------------------------

# ── Actuals Metrics ───────────────────────────────────────────────────────────
# These are computed by aggregating rows from the `actuals` table.

ACTUALS_PERCENT_METRICS = {
    "util_pct": {
        "label":       "Util %",
        "numerator":   "billed_hrs",
        "denominator": "std_billable_hours",   # same denominator for all % metrics
        "aliases":     ["utilization", "util", "utilization %", "util%", "billable utilization"],
    },
    "vacation_pct": {
        "label":       "Vacation %",
        "numerator":   "vacn_hrs_taken",
        "denominator": "std_billable_hours",
        "aliases":     ["vacation", "vacation %", "vacn %"],
    },
    "capex_pct": {
        "label":       "Capex %",
        "numerator":   "capex_hrs",
        "denominator": "std_billable_hours",
        "aliases":     ["capex", "capital %", "capex %"],
    },
    "admin_pct": {
        "label":       "Admin %",
        "numerator":   "admin_hrs",
        "denominator": "std_billable_hours",
        "aliases":     ["admin", "admin %", "administrative %"],
    },
    "holiday_pct": {
        "label":       "Holiday %",
        "numerator":   "holiday_paid_leave",
        "denominator": "std_billable_hours",
        "aliases":     ["holiday", "holiday %"],
    },
    "training_pct": {
        "label":       "Training %",
        "numerator":   "trg_hrs",
        "denominator": "std_billable_hours",
        "aliases":     ["training", "training %", "trg %"],
    },
    "internal_pct": {
        "label":       "Internal %",
        "numerator":   "internal_project_hours",
        "denominator": "std_billable_hours",
        "aliases":     ["internal", "internal %", "internal project %"],
    },
}

ACTUALS_HOURS_METRICS = {
    "billable_hours": {
        "label":      "Billable Hours",
        "column":     "billed_hrs",
        "is_default": True,    # used when user asks for "hours" with no qualifier
        "aliases":    ["billed hours", "billable hrs", "billed hrs"],
    },
    "capital_hours": {
        "label":   "Capital Hours",
        "column":  "capex_hrs",
        "aliases": ["capex hours", "capital hrs"],
    },
    "training_hours": {
        "label":   "Training Hours",
        "column":  "trg_hrs",
        "aliases": ["trg hours", "training hrs"],
    },
    "admin_hours": {
        "label":   "Admin Hours",
        "column":  "admin_hrs",
        "aliases": ["admin hrs", "administrative hours"],
    },
    "vacation_hours": {
        "label":   "Vacation Hours",
        "column":  "vacn_hrs_taken",
        "aliases": ["vacation hrs", "leave hours", "vacn hours"],
    },
    "holiday_hours": {
        "label":   "Holiday Hours",
        "column":  "holiday_paid_leave",
        "aliases": ["holiday hrs", "public holiday hours"],
    },
    "internal_hours": {
        "label":   "Internal Project Hours",
        "column":  "internal_project_hours",
        "aliases": ["internal hrs", "internal hours"],
    },
    "not_approved_hours": {
        "label":   "Not Approved Hours",
        "column":  "not_approved_hrs",
        "aliases": ["unapproved hours", "not approved hrs"],
    },
}

# ── Plan Metrics ──────────────────────────────────────────────────────────────
# Plan data ONLY exists for Util % — there is NO plan for raw hour metrics.
# These come from cc_plan and t2_plan tables (one row per CC/T2 per month).

PLAN_METRICS = {
    "cc_plan_util_pct": {
        "label":       "CC Plan Util %",
        "source":      "cc_plan",
        "numerator":   "cc_planned_hrs",
        "denominator": "cc_std_hrs",
        "join_keys":   ["cost_center", "month"],  # how actuals joins to cc_plan
    },
    "t2_plan_util_pct": {
        "label":       "T2 Plan Util %",
        "source":      "t2_plan",
        "numerator":   "t2_planned_hrs",
        "denominator": "t2_std_hrs",
        "join_keys":   ["hts_t2", "month"],        # how actuals joins to t2_plan
    },
}

# ── Month Ordering ────────────────────────────────────────────────────────────
# Business months are stored as text labels ('Jan', 'Feb', etc.).
# This mapping is used to correctly sort months in SQL and to compute YTD ranges.

MONTH_ORDER = {
    "Jan": 1, "Feb": 2,  "Mar": 3,  "Apr": 4,
    "May": 5, "Jun": 6,  "Jul": 7,  "Aug": 8,
    "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}

# Reverse lookup: number → month name
MONTH_NAMES = {v: k for k, v in MONTH_ORDER.items()}


def get_ytd_months(up_to_month: str) -> list[str]:
    """
    Returns the list of months from January up to and including the given month.
    Example: get_ytd_months("Mar") → ["Jan", "Feb", "Mar"]
    """
    target = MONTH_ORDER.get(up_to_month)
    if target is None:
        raise ValueError(f"Unknown month: {up_to_month}")
    return [MONTH_NAMES[i] for i in range(1, target + 1)]
