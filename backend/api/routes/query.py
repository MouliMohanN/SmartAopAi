# -----------------------------------------------------------------------------
# query.py — POST /query and POST /explain endpoints.
#
# POST /query  — the main endpoint. Takes a plain-English question,
#                runs it through the full pipeline, and returns results.
#
#   Pipeline:
#     1. Detect temporal mode (YTD / MTD) from the question text
#     2. Build the system prompt (includes latest DB state, all metrics, all rules)
#     3. Send question to Ollama LLM → get back a SQL string
#     4. Validate the SQL (safety check + syntax check)
#     5. Execute the SQL against DuckDB
#     6. Return rows, columns, chart hint, plan_available, temporal_mode, and the SQL
#
# POST /explain — takes the question + result rows and returns a plain-English
#                 narrative summary written by the LLM.
# -----------------------------------------------------------------------------

import re
from fastapi import APIRouter, HTTPException

from backend.api.models import QueryRequest, QueryResponse, ExplainRequest, ExplainResponse
from backend.db.database import get_connection
from backend.engine.prompt import build_system_prompt
from backend.engine.llm import generate_sql, generate_response
from backend.engine.validator import validate_sql
from backend.engine.executor import run_query

router = APIRouter()


def _detect_temporal_mode(query: str) -> str | None:
    """
    Looks for YTD or MTD keywords in the user's question.

    Returns 'YTD', 'MTD', or None.
    This is surfaced to the frontend so it can label the result appropriately.
    """
    q = query.lower()
    if re.search(r"\bytd\b|year.to.date", q):
        return "YTD"
    if re.search(r"\bmtd\b|month.to.date", q):
        return "MTD"
    return None


@router.post("/query", response_model=QueryResponse)
def run_nl_query(request: QueryRequest):
    """
    Converts a plain-English question into SQL, executes it, and returns the results.

    If the LLM is unreachable, returns HTTP 503 (service unavailable).
    If the generated SQL is invalid or execution fails, returns the error
    in the response body (so the frontend can display a friendly message).
    """
    query = request.query.strip()
    temporal_mode = _detect_temporal_mode(query)

    conn = get_connection()
    try:
        # Step 1: Build the system prompt with current DB state injected
        system_prompt = build_system_prompt(conn)

        # Step 2: Ask the LLM to generate SQL for the user's question
        try:
            sql = generate_sql(system_prompt, query)
        except RuntimeError as e:
            # Ollama is not running or the model is not loaded
            raise HTTPException(status_code=503, detail=str(e))

        # Step 3: Validate the SQL before running it
        validation_error = validate_sql(sql, conn)
        if validation_error:
            return QueryResponse(
                error=validation_error,
                sql=sql,
                temporal_mode=temporal_mode,
            )

        # Step 4: Execute the SQL and get results
        try:
            result = run_query(sql, conn)
        except Exception as e:
            return QueryResponse(
                error=f"Query execution failed: {e}",
                sql=sql,
                temporal_mode=temporal_mode,
            )

    finally:
        # Always close the DB connection, even if something went wrong
        conn.close()

    return QueryResponse(
        columns=result["columns"],
        rows=result["rows"],
        row_count=result["row_count"],
        chart_hint=result["chart_hint"],
        plan_available=result["plan_available"],
        temporal_mode=temporal_mode,
        sql=sql,
        error=None,
    )


@router.post("/explain", response_model=ExplainResponse)
def explain_result(request: ExplainRequest):
    """
    Takes the user's original question and the result rows, and asks the LLM
    to write a plain-English narrative summary of what the data shows.

    This is triggered by the "Explain this" button in the frontend.
    If the LLM is unreachable, returns HTTP 503.
    """

    # Format the result rows as a simple text table to include in the prompt
    if request.result:
        headers = list(request.result[0].keys())
        header_row = " | ".join(headers)
        divider    = "-" * len(header_row)
        data_rows  = "\n".join(
            " | ".join(str(row.get(h, "")) for h in headers)
            for row in request.result[:50]  # cap at 50 rows to keep prompt size reasonable
        )
        result_text = f"{header_row}\n{divider}\n{data_rows}"
    else:
        result_text = "(no data returned)"

    # Build a focused prompt for narrative generation — simpler than the SQL prompt
    explain_prompt = (
        "You are a data analyst explaining employee utilization results to business stakeholders. "
        "Write a concise 2-3 sentence summary of the data shown below. "
        "Highlight the key insight, any notable pattern, and what it means for the business. "
        "Use plain English — avoid SQL terms and technical jargon."
    )

    user_message = (
        f"Question that was asked: {request.query}\n\n"
        f"Results:\n{result_text}"
    )

    try:
        narrative = generate_response(explain_prompt, user_message)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return ExplainResponse(narrative=narrative)
