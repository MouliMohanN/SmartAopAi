# -----------------------------------------------------------------------------
# llm.py — Sends prompts to the Ollama LLM and retrieves the response.
#
# Ollama is a tool that runs AI language models locally on your machine.
# This file acts as the "bridge" between our application and Ollama.
#
# Two functions are exposed:
#   generate_sql()      — for NL → SQL conversion (POST /query)
#   generate_response() — for free-form text generation (POST /explain)
#
# CONFIGURATION (set in .env):
#   OLLAMA_BASE_URL — where Ollama is running (default: http://localhost:11434)
#   OLLAMA_MODEL    — which model to use (default: qwen2.5-coder:32b)
#   OLLAMA_TIMEOUT  — seconds to wait for a response (default: 120)
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

    The LLM returns a SQL query string

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


def generate_response(system_prompt: str, user_message: str) -> str:
    """
    Sends a free-form request to the LLM and returns its plain-text response.
    Used by the /explain endpoint to generate narrative summaries.

    Unlike generate_sql(), this does not wrap the message in SQL framing
    and does not strip code block markers — it returns the raw response text.

    system_prompt — instructions for how the LLM should respond
    user_message  — the content to respond to (e.g. the question + result rows)
    """
    try:
        response = httpx.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json={
                "model":  OLLAMA_MODEL,
                "stream": False,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_message},
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
            f"Ollama did not respond within {int(OLLAMA_TIMEOUT)} seconds."
        )

    return response.json()["message"]["content"].strip()


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
