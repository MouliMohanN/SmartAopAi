# -----------------------------------------------------------------------------
# ingest.py — Reads the weekly Excel file and loads it into the database.
#
# HOW IT WORKS (plain English):
#   1. Read the folder path from the .env file (INGEST_DIR)
#   2. Find the single .xlsx file in that folder
#   3. For each of the 3 relevant Excel sheets:
#        a. Read the sheet into memory
#        b. Drop columns we don't need
#        c. Rename columns to the clean database format
#        d. Validate that all expected columns are present
#        e. Convert hour columns to numbers and date columns to dates
#        f. Wipe the old data in the database table and load the new data
#   4. Close the database connection
#
# This script performs a FULL REPLACEMENT every time it runs.
# The latest Excel file is always treated as the single source of truth.
#
# HOW TO RUN:
#   python -m backend.ingest.ingest
# -----------------------------------------------------------------------------

import os
import sys
import pandas as pd
from pathlib import Path
from dotenv import load_dotenv

from backend.ingest.schema import SHEET_CONFIGS
from backend.ingest.validate import validate_sheet
from backend.db.database import get_connection, ACTUALS_DDL, CC_PLAN_DDL, T2_PLAN_DDL

# Load environment variables from the .env file (e.g. INGEST_DIR, DB_PATH)
load_dotenv()

# Maps each database table name to the SQL statement that creates it.
# Used when we wipe and recreate a table during ingest.
TABLE_DDL = {
    "actuals":  ACTUALS_DDL,
    "cc_plan":  CC_PLAN_DDL,
    "t2_plan":  T2_PLAN_DDL,
}


def find_xlsx(ingest_dir: str) -> Path:
    """
    Looks for a single .xlsx file in the given folder.
    Raises an error if there are zero or more than one .xlsx files,
    because we need exactly one unambiguous file to ingest.
    """
    files = list(Path(ingest_dir).glob("*.xlsx"))

    if not files:
        raise FileNotFoundError(f"No .xlsx file found in: {ingest_dir}")

    if len(files) > 1:
        names = [f.name for f in files]
        raise ValueError(
            f"Multiple .xlsx files found in {ingest_dir}: {names}. "
            f"Please keep only one file in the ingest folder."
        )

    return files[0]


def normalize_columns(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """
    Cleans up column names and removes columns we don't need.

    Step 1: Fix whitespace — some Excel column names have extra spaces
            (e.g. "Not Approved  Hrs" with two spaces). We collapse those
            to a single space so the rename mapping works correctly.

    Step 2: Drop ignored columns — removes columns that are not needed
            for analysis (e.g. "SWC Hrs", "Vula Hrs", "Month number").

    Step 3: Rename columns — converts Excel-style names (e.g. "Billed Hrs")
            to clean database-style names (e.g. "billed_hrs").
    """
    # Step 1: Collapse multiple spaces to one in all column names
    df.columns = [" ".join(c.split()) for c in df.columns]

    # Step 2: Drop columns that are flagged as ignored in the schema
    df = df.drop(columns=[c for c in df.columns if c in config["ignored"]], errors="ignore")

    # Step 3: Rename remaining columns using the mapping from schema.py
    df = df.rename(columns=config["rename"])

    return df


def convert_types(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """
    Converts columns to their correct data types.

    - Hour columns (numeric): any blank or non-numeric cell becomes 0.0
    - Date columns: parsed into proper date format for the database
    """
    # Convert hour columns to decimal numbers
    for col in config["numeric"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    # Convert date columns to proper date objects
    for col in config["date"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    return df


def ingest_sheet(xlsx_path: Path, sheet_name: str, config: dict, conn) -> int:
    """
    Processes one Excel sheet and loads it into the corresponding database table.

    Returns the number of rows loaded.
    """
    # Read the sheet from Excel into memory
    df = pd.read_excel(xlsx_path, sheet_name=sheet_name)

    # Clean and rename the columns
    df = normalize_columns(df, config)

    # Make sure all expected columns are present
    validate_sheet(df, sheet_name, config)

    # Convert hours and dates to the right types
    df = convert_types(df, config)

    table = config["table"]

    # Wipe the existing data in this table (full replacement every time)
    conn.execute(f"DROP TABLE IF EXISTS {table}")

    # Recreate the empty table with the correct column structure
    conn.execute(TABLE_DDL[table])

    # Load all the new data from the Excel sheet into the table
    conn.execute(f"INSERT INTO {table} SELECT * FROM df")

    return len(df)


def main():
    """
    Entry point — orchestrates the full ingest process.

    Reads INGEST_DIR from .env, finds the Excel file,
    processes all 3 sheets, and reports the results.
    """

    # Read the ingest folder path from .env
    ingest_dir = os.getenv("INGEST_DIR")
    if not ingest_dir:
        print("ERROR: INGEST_DIR is not set in the .env file.")
        sys.exit(1)

    # Make sure the folder actually exists
    if not Path(ingest_dir).is_dir():
        print(f"ERROR: INGEST_DIR folder does not exist: {ingest_dir}")
        sys.exit(1)

    # Find the Excel file in the folder
    try:
        xlsx_path = find_xlsx(ingest_dir)
    except (FileNotFoundError, ValueError) as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    print(f"Ingesting: {xlsx_path.name}")

    # Open a connection to the database
    conn = get_connection()

    try:
        # Process each sheet one by one, in the order defined in schema.py
        for sheet_name, config in SHEET_CONFIGS.items():
            count = ingest_sheet(xlsx_path, sheet_name, config, conn)
            print(f"  {sheet_name} → {config['table']}: {count:,} rows loaded")

    except Exception as e:
        print(f"ERROR during ingest: {e}")
        conn.close()
        sys.exit(1)

    # Close the database connection cleanly
    conn.close()
    print("Ingest complete.")


# This block runs only when the script is executed directly from the command line.
# It will NOT run if this file is imported by another Python file.
if __name__ == "__main__":
    main()
