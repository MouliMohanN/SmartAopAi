# -----------------------------------------------------------------------------
# main.py — The FastAPI application entry point.
#
# This file wires together all the API routes and configures the server.
#
# HOW TO START THE SERVER:
#   uvicorn backend.api.main:app --reload --port 8000
#
# CORS (Cross-Origin Resource Sharing):
#   The React frontend runs on a different port (5173) than the backend (8000).
#   Without CORS headers, browsers block requests between different ports.
#   We configure CORS here to allow the frontend to talk to the backend.
#   In production, restrict `allow_origins` to the actual frontend URL.
# -----------------------------------------------------------------------------

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes.query  import router as query_router
from backend.api.routes.health import router as health_router
from backend.api.routes.stream import router as stream_router

# Create the FastAPI application
app = FastAPI(
    title="SmartAopAi",
    description="Natural language query interface for employee utilization data",
    version="1.0.0",
)

# ── CORS Configuration ────────────────────────────────────────────────────────
# Allows the React frontend (running on localhost:5173 during development)
# to make requests to this backend (running on localhost:8000).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server (React)
        "http://localhost:5174",   # Vite fallback port (when 5173 is in use)
        "http://localhost:3000",   # alternative React dev port
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── Register Routes ───────────────────────────────────────────────────────────
# Each router handles a group of related endpoints.
# - query_router  → POST /query, POST /explain  (legacy, kept for backward compat)
# - stream_router → POST /stream                (unified streaming endpoint)
# - health_router → GET /health

app.include_router(query_router)
app.include_router(stream_router)
app.include_router(health_router)


# ── Root endpoint ─────────────────────────────────────────────────────────────
@app.get("/")
def root():
    """Basic confirmation that the server is running."""
    return {"message": "SmartAopAi API is running. Use POST /query to ask questions."}
