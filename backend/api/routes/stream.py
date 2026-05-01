# -----------------------------------------------------------------------------
# stream.py — POST /stream: unified NDJSON streaming endpoint.
#
# Protocol: NDJSON (Newline-Delimited JSON) over HTTP chunked transfer.
# Each line is a self-contained JSON object terminated by '\n'.
#
# Event schema:
#   {"event": "step", "step": "<id>", "status": "active", "message": "..."}
#                                                          — stage started
#   {"event": "step", "step": "<id>", "status": "done"}   — stage finished
#   {"event": "step", "step": "<id>", "status": "error"}  — stage failed
#   {"event": "sql_token", "text": "..."}                 — SQL token (streaming)
#   {"event": "sql_done",  "sql":  "..."}                 — SQL fully generated
#   {"event": "result", "columns": [...], "rows": [...],  — DB execution complete
#            "row_count": N, "chart_hint": "bar",
#            "plan_available": true, "temporal_mode": "YTD", "error": null}
#   {"event": "token",  "text": "..."}                    — narrative chunk
#   {"event": "done"}                                     — stream complete
#   {"event": "error",  "message": "..."}                 — unrecoverable failure
#
# Step IDs emitted in order:
#   analyzing · generating_sql · validating_sql · executing_query
#   detecting_chart · generating_insights
# -----------------------------------------------------------------------------

import re
import json
from typing import AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.db.database import get_connection
from backend.engine.prompt import build_system_prompt
from backend.engine.llm import stream_sql, stream_narrative, _extract_sql
from backend.engine.validator import validate_sql
from backend.engine.executor import execute_sql, detect_chart_hint, check_plan_available

router = APIRouter()


# ── Request model ─────────────────────────────────────────────────────────────

class StreamRequest(BaseModel):
    """Body for POST /stream."""
    query: str = Field(..., min_length=1, description="The natural language question to answer")


# ── Temporal mode detection ───────────────────────────────────────────────────

def _detect_temporal_mode(query: str) -> str | None:
    q = query.lower()
    if re.search(r"\bmtd\b|month.to.date", q):
        return "MTD"
    if re.search(r"\bthis month\b|\bin (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\bfor (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b", q):
        return "MTD"
    return "YTD"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _ndjson(obj: dict) -> str:
    return json.dumps(obj, ensure_ascii=False) + "\n"


def _step(step_id: str, status: str, message: str | None = None) -> str:
    payload: dict = {"event": "step", "step": step_id, "status": status}
    if message:
        payload["message"] = message
    return _ndjson(payload)


def _build_explain_prompt(query: str, result: list[dict]) -> tuple[str, str]:
    if result:
        headers    = list(result[0].keys())
        header_row = " | ".join(headers)
        divider    = "-" * len(header_row)
        data_rows  = "\n".join(
            " | ".join(str(row.get(h, "")) for h in headers)
            for row in result[:50]
        )
        result_text = f"{header_row}\n{divider}\n{data_rows}"
    else:
        result_text = "(no data returned)"

    system_prompt = (
        "You are a data analyst explaining employee utilization results to business stakeholders. "
        "Write a concise 2-3 sentence summary of the data shown below. "
        "Highlight the key insight, any notable pattern, and what it means for the business. "
        "Use plain English — avoid SQL terms and technical jargon."
    )
    user_message = (
        f"Question that was asked: {query}\n\n"
        f"Results:\n{result_text}"
    )
    return system_prompt, user_message


# ── Stream generator ──────────────────────────────────────────────────────────

async def _stream_pipeline(request: StreamRequest) -> AsyncGenerator[str, None]:
    query         = request.query.strip()
    temporal_mode = _detect_temporal_mode(query)

    # ── Stage 1: Analyzing ────────────────────────────────────────────────────
    yield _step("analyzing", "active", "Analyzing your question…")

    conn = get_connection()
    try:
        system_prompt = build_system_prompt(conn)
        yield _step("analyzing", "done")

        # ── Stage 2: SQL generation ───────────────────────────────────────────
        yield _step("generating_sql", "active", "Writing SQL query…")
        raw_tokens: list[str] = []
        try:
            async for token in stream_sql(system_prompt, query):
                raw_tokens.append(token)
                yield _ndjson({"event": "sql_token", "text": token})
        except RuntimeError as e:
            yield _step("generating_sql", "error")
            yield _ndjson({"event": "error", "message": str(e)})
            return

        raw_sql = "".join(raw_tokens)
        sql     = _extract_sql(raw_sql)
        yield _ndjson({"event": "sql_done", "sql": sql})
        yield _step("generating_sql", "done")

        # ── Stage 3: Validation ───────────────────────────────────────────────
        yield _step("validating_sql", "active", "Validating SQL syntax…")
        validation_error = validate_sql(sql, conn)
        if validation_error:
            yield _step("validating_sql", "error")
            yield _ndjson({
                "event":          "result",
                "columns":        [],
                "rows":           [],
                "row_count":      0,
                "chart_hint":     None,
                "plan_available": True,
                "temporal_mode":  temporal_mode,
                "sql":            sql,
                "error":          validation_error,
            })
            yield _ndjson({"event": "done"})
            return
        yield _step("validating_sql", "done")

        # ── Stage 4: Execution ────────────────────────────────────────────────
        yield _step("executing_query", "active", "Querying the database…")
        try:
            columns, rows = execute_sql(sql, conn)
        except Exception as e:
            yield _step("executing_query", "error")
            yield _ndjson({
                "event":          "result",
                "columns":        [],
                "rows":           [],
                "row_count":      0,
                "chart_hint":     None,
                "plan_available": True,
                "temporal_mode":  temporal_mode,
                "sql":            sql,
                "error":          f"Query execution failed: {e}",
            })
            yield _ndjson({"event": "done"})
            return
        yield _step("executing_query", "done")

        # ── Stage 5: Chart detection ──────────────────────────────────────────
        yield _step("detecting_chart", "active", "Detecting best visualization…")
        chart_hint     = detect_chart_hint(columns, rows)
        plan_available = check_plan_available(columns, rows)
        yield _step("detecting_chart", "done")

        yield _ndjson({
            "event":          "result",
            "columns":        columns,
            "rows":           rows,
            "row_count":      len(rows),
            "chart_hint":     chart_hint,
            "plan_available": plan_available,
            "temporal_mode":  temporal_mode,
            "sql":            sql,
            "error":          None,
        })

        # ── Stage 6: Narrative ────────────────────────────────────────────────
        if rows:
            yield _step("generating_insights", "active", "Generating insights…")
            explain_system, explain_user = _build_explain_prompt(query, rows)
            try:
                async for token in stream_narrative(explain_system, explain_user):
                    yield _ndjson({"event": "token", "text": token})
                yield _step("generating_insights", "done")
            except RuntimeError:
                yield _step("generating_insights", "error")

    finally:
        conn.close()

    yield _ndjson({"event": "done"})


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/stream")
async def stream_query(request: StreamRequest) -> StreamingResponse:
    """
    Unified streaming endpoint. Returns chunked NDJSON with step-level events
    for every stage: analyzing → generating_sql → validating_sql →
    executing_query → detecting_chart → generating_insights.
    """
    return StreamingResponse(
        _stream_pipeline(request),
        media_type="application/x-ndjson",
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control":     "no-cache",
        },
    )
