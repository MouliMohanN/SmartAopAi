# -----------------------------------------------------------------------------
# llm.py — Sends queries to the Ollama LLM and retrieves the SQL response.
#
# Ollama is a tool that runs AI language models locally on your machine.
# This file acts as the "bridge" between our application and Ollama.
#
# FLOW:
#   1. We send two things to the LLM:
#        - The system prompt (the full instruction set built by prompt.py)
#        - The user's natural language question
#   2. The LLM returns a SQL query string
#   3. We clean up the response (strip markdown formatting if the model added any)
#   4. We return the clean SQL string to the caller
#
# CONFIGURATION (set in .env):
#   OLLAMA_BASE_URL — where Ollama is running (default: http://localhost:11434)
#   OLLAMA_MODEL    — which model to use (default: qwen2.5-coder:32b)
# -----------------------------------------------------------------------------

import os
import re
import httpx
from dotenv import load_dotenv

load_dotenv()

# Where the Ollama service is running. Default is localhost.
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# The AI model to use for generating SQL.
# Switch to a larger model (e.g. qwen2.5-coder:32b) for better accuracy.
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:32b")

# How long to wait for the LLM to respond before giving up (in seconds).
# Larger models take longer — 120 seconds is safe for a 32B model.
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "120"))


def _extract_sql(text: str) -> str:
    """
    Cleans the LLM's raw response to extract just the SQL string.

    Even though we instruct the model to return only SQL, some models
    occasionally wrap their response in markdown code blocks like:
        ```sql
        SELECT ...
        ```
    This function strips those wrappers and returns the bare SQL.
    """
    # Remove ```sql ... ``` or ``` ... ``` markdown code block wrappers
    match = re.search(r"```(?:sql)?\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()

    # No code block found — return the text as-is, just trimmed
    return text.strip()


def generate_sql(system_prompt: str, user_query: str) -> str:
    """
    Sends the user's question to the LLM and returns the generated SQL.

    system_prompt — the full instruction set built by prompt.py
    user_query    — the plain-English question from the user

    Raises an exception if Ollama is unreachable or returns an error.
    """
    try:
        response = httpx.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json={
                "model":  OLLAMA_MODEL,
                "stream": False,           # wait for the full response before returning
                "messages": [
                    {
                        "role":    "system",
                        "content": system_prompt,
                    },
                    {
                        "role":    "user",
                        "content": f"Generate a DuckDB SQL query for: {user_query}",
                    },
                ],
            },
            timeout=OLLAMA_TIMEOUT,
        )
        response.raise_for_status()

    except httpx.ConnectError:
        raise RuntimeError(
            f"Cannot connect to Ollama at {OLLAMA_BASE_URL}. "
            f"Make sure Ollama is running (run 'ollama serve' in a terminal)."
        )
    except httpx.TimeoutException:
        raise RuntimeError(
            f"Ollama did not respond within {int(OLLAMA_TIMEOUT)} seconds. "
            f"The model may still be loading — try again in a moment."
        )

    raw_text = response.json()["message"]["content"]
    return _extract_sql(raw_text)


def check_ollama_reachable() -> bool:
    """
    Checks whether Ollama is running and the configured model is available.
    Used by the health check endpoint.
    Returns True if reachable, False otherwise.
    """
    try:
        response = httpx.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5.0)
        if response.status_code != 200:
            return False
        models = [m["name"] for m in response.json().get("models", [])]
        return any(OLLAMA_MODEL in m for m in models)
    except Exception:
        return False
