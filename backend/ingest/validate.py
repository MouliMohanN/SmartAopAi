# -----------------------------------------------------------------------------
# validate.py — Checks that the Excel sheet has all the columns we expect.
#
# After reading the Excel file and renaming columns, we run this check
# to catch problems early. If a required column is missing (e.g. the Excel
# file was updated with a renamed column), we raise a clear error message
# instead of silently producing wrong results in the database.
# -----------------------------------------------------------------------------


def validate_sheet(df, sheet_name: str, config: dict):
    """
    Checks that all expected columns are present in the sheet after renaming.

    df         — the data we read from the Excel sheet (already renamed)
    sheet_name — the name of the Excel tab (used only for the error message)
    config     — the schema config for this sheet (from schema.py)
    """

    # The full set of column names we expect to find after renaming
    expected = set(config["rename"].values())

    # Find any columns that are expected but not actually present
    missing = expected - set(df.columns)

    if missing:
        # Something is wrong — the Excel file may have renamed or removed a column.
        # Raise an error that clearly says which columns are missing and in which sheet.
        raise ValueError(
            f"[{sheet_name}] The following columns are missing after renaming: {sorted(missing)}. "
            f"Check that the Excel file has not changed its column names."
        )
