# -----------------------------------------------------------------------------
# schema.py — The single source of truth for how we read the Excel file.
#
# This file tells the ingest pipeline:
#   1. Which Excel sheets to read
#   2. Which columns to throw away (they are not needed for analysis)
#   3. How to rename columns from the Excel format into a clean database format
#      (e.g. "Employee Name" → "employee_name", spaces replaced by underscores)
#   4. Which columns contain numbers (hours) vs. dates vs. plain text
#
# If the Excel file ever changes its column names or adds new sheets,
# this is the ONLY file that needs to be updated.
# -----------------------------------------------------------------------------

# Each key is the exact name of a sheet tab in the Excel file.
# Each value is a configuration block that describes how to process that sheet.

SHEET_CONFIGS = {

    # -------------------------------------------------------------------------
    # Sheet 1: "Utilization"
    # This is the main actuals data — one row per employee per week.
    # It contains all the hours that employees actually logged.
    # -------------------------------------------------------------------------
    "Utilization": {
        # Name of the database table where this sheet's data will be stored
        "table": "actuals",

        # Columns in the Excel sheet that we do NOT need — they are ignored
        # and will be dropped before saving to the database.
        "ignored": {"Month number", "SWC Hrs", "Vula Hrs"},

        # Mapping from Excel column name → database column name.
        # We rename columns to remove spaces and use lowercase with underscores,
        # which is the standard format for database column names.
        "rename": {
            "Employee Name":        "employee_name",
            "Empno":                "empno",           # unique employee ID
            "Cost Center":          "cost_center",
            "Supervisor Name":      "supervisor_name",
            "WeekendDate":          "weekend_date",    # the Sunday that ends the work week
            "Month":                "month",           # business month label (always use this, not the date)
            "HTS T2":               "hts_t2",          # org hierarchy level above cost center
            "Billed Hrs":           "billed_hrs",
            "Capex Hrs":            "capex_hrs",
            "Holiday Paid Leave":   "holiday_paid_leave",
            "Internal Project Hours": "internal_project_hours",
            "Not Approved Hrs":     "not_approved_hrs",
            "Admin Hrs":            "admin_hrs",
            "Std Billable Hours":   "std_billable_hours",  # the expected/standard billable capacity for that week
            "Trg Hrs":              "trg_hrs",
            "Vacn Hrs taken":       "vacn_hrs_taken",
        },

        # Columns that must contain numbers (hours).
        # Any blank or text values will be treated as 0.
        "numeric": {
            "billed_hrs", "capex_hrs", "holiday_paid_leave",
            "internal_project_hours", "not_approved_hrs", "admin_hrs",
            "std_billable_hours", "trg_hrs", "vacn_hrs_taken",
        },

        # Columns that must be treated as dates (not plain text)
        "date": {"weekend_date"},
    },

    # -------------------------------------------------------------------------
    # Sheet 2: "Util CC Plan"
    # This is the planned (target) utilization data at the Cost Center level.
    # One row per cost center per month — not per employee.
    # -------------------------------------------------------------------------
    "Util CC Plan": {
        "table": "cc_plan",
        "ignored": set(),  # no columns to ignore in this sheet
        "rename": {
            "CC_No":          "cc_no",          # numeric code for the cost center
            "Cost Center":    "cost_center",
            "HTS_T2":         "hts_t2",
            "Month":          "month",
            "CC Std Hrs":     "cc_std_hrs",     # standard/available hours for this cost center that month
            "CC Planned Hrs": "cc_planned_hrs", # planned billable hours for this cost center that month
        },
        "numeric": {"cc_std_hrs", "cc_planned_hrs"},
        "date": set(),
    },

    # -------------------------------------------------------------------------
    # Sheet 3: "Util T2 Plan"
    # This is the planned utilization data at the T2 (higher org level) level.
    # One row per T2 group per month.
    # -------------------------------------------------------------------------
    "Util T2 Plan": {
        "table": "t2_plan",
        "ignored": set(),  # no columns to ignore in this sheet
        "rename": {
            "HTS_T2":         "hts_t2",
            "Month":          "month",
            "T2 Std Hrs":     "t2_std_hrs",     # standard/available hours for this T2 group that month
            "T2 Planned Hrs": "t2_planned_hrs", # planned billable hours for this T2 group that month
        },
        "numeric": {"t2_std_hrs", "t2_planned_hrs"},
        "date": set(),
    },
}
