# -----------------------------------------------------------------------------
# database.py — Sets up and connects to the DuckDB database.
#
# DuckDB is a lightweight analytical database that lives in a single file
# on disk (similar to how SQLite works). No server installation needed.
#
# This file is responsible for:
#   1. Defining the structure (columns and types) of all 3 database tables
#   2. Providing a function to open a connection to the database
#   3. Providing a function to create all tables (used during first-time setup)
# -----------------------------------------------------------------------------

import os
import duckdb
from pathlib import Path
from dotenv import load_dotenv

# Load the DB_PATH setting from the .env file
load_dotenv()

# -----------------------------------------------------------------------------
# Table definitions (DDL = Data Definition Language)
# These SQL statements define the structure of each table:
# what columns exist and what type of data each column holds.
#
# VARCHAR = text
# DOUBLE  = decimal number (used for hours, e.g. 8.5)
# DATE    = calendar date
# -----------------------------------------------------------------------------

# Table 1: actuals
# Stores the weekly actuals data from the "Utilization" Excel sheet.
# One row = one employee's hours for one week.
ACTUALS_DDL = """
    CREATE TABLE actuals (
        employee_name           VARCHAR,   -- full name of the employee
        empno                   VARCHAR,   -- unique employee ID (primary key)
        cost_center             VARCHAR,   -- department / team the employee belongs to
        supervisor_name         VARCHAR,   -- name of the employee's direct manager
        weekend_date            DATE,      -- the Sunday that ends the reporting week
        month                   VARCHAR,   -- business month label (always use this for filtering by month)
        hts_t2                  VARCHAR,   -- org hierarchy level above cost center
        billed_hrs              DOUBLE,    -- hours billed to external clients
        capex_hrs               DOUBLE,    -- hours on capital projects
        holiday_paid_leave      DOUBLE,    -- public/company holiday hours
        internal_project_hours  DOUBLE,    -- hours on internal (non-billable) projects
        not_approved_hrs        DOUBLE,    -- hours submitted but not yet approved
        admin_hrs               DOUBLE,    -- administrative / non-project time
        std_billable_hours      DOUBLE,    -- expected billable capacity for this employee this week
        trg_hrs                 DOUBLE,    -- training hours
        vacn_hrs_taken          DOUBLE     -- vacation / leave hours taken
    )
"""

# Table 2: cc_plan
# Stores the planned (target) utilization from the "Util CC Plan" Excel sheet.
# One row = planned hours for one cost center for one month.
# NOTE: Plan data only exists for Util% — there is no plan for raw hour metrics.
CC_PLAN_DDL = """
    CREATE TABLE cc_plan (
        cc_no           VARCHAR,   -- numeric code that identifies the cost center
        cost_center     VARCHAR,   -- name of the cost center
        hts_t2          VARCHAR,   -- parent T2 group for this cost center
        month           VARCHAR,   -- business month label
        cc_std_hrs      DOUBLE,    -- total standard/available hours for this cost center this month
        cc_planned_hrs  DOUBLE     -- planned billable hours for this cost center this month
    )
"""

# Table 3: t2_plan
# Stores the planned utilization from the "Util T2 Plan" Excel sheet.
# One row = planned hours for one T2 group for one month.
T2_PLAN_DDL = """
    CREATE TABLE t2_plan (
        hts_t2          VARCHAR,   -- name of the T2 org group
        month           VARCHAR,   -- business month label
        t2_std_hrs      DOUBLE,    -- total standard/available hours for this T2 group this month
        t2_planned_hrs  DOUBLE     -- planned billable hours for this T2 group this month
    )
"""


def get_connection() -> duckdb.DuckDBPyConnection:
    """
    Opens and returns a connection to the DuckDB database file.

    The file path is read from DB_PATH in the .env file.
    If the folder for the database file does not exist yet, it is created automatically.
    """
    db_path = os.getenv("DB_PATH", "./data/smartaop.duckdb")

    # Create the folder if it doesn't already exist (e.g. first time setup)
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    return duckdb.connect(db_path)


def create_tables(conn: duckdb.DuckDBPyConnection):
    """
    Creates all 3 tables in the database.
    Used during initial setup if the tables do not yet exist.
    During normal weekly ingest, tables are dropped and recreated by ingest.py.
    """
    for ddl in (ACTUALS_DDL, CC_PLAN_DDL, T2_PLAN_DDL):
        conn.execute(ddl)
