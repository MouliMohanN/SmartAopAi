# -----------------------------------------------------------------------------
# health.py — GET /health endpoint.
#
# Returns the status of each system component:
#   - Database: can we open the DuckDB file?
#   - LLM: is Ollama running and is the configured model available?
#
# This endpoint is used to confirm the system is ready before serving queries.
# It can also be polled after a weekly ingest to verify everything is still healthy.
# -----------------------------------------------------------------------------

from fastapi import APIRouter
from backend.api.models import HealthResponse
from backend.db.database import get_connection
from backend.engine.llm import check_ollama_reachable

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health_check():
    """
    Checks whether the database and LLM are reachable.
    Returns status='ok' only if both are healthy.
    """

    # Check 1: Can we open the database?
    db_connected = False
    try:
        conn = get_connection()
        # Run a trivial query to confirm the DB file is readable and actuals exist
        conn.execute("SELECT 1 FROM actuals LIMIT 1")
        conn.close()
        db_connected = True
    except Exception:
        pass

    # Check 2: Is Ollama running with the configured model loaded?
    llm_reachable = check_ollama_reachable()

    # Overall status is 'ok' only when both components are healthy
    overall_status = "ok" if (db_connected and llm_reachable) else "degraded"

    return HealthResponse(
        status=overall_status,
        db_connected=db_connected,
        llm_reachable=llm_reachable,
    )
