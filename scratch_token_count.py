import asyncio
from backend.db.database import get_connection
from backend.engine.prompt import build_system_prompt
import httpx
import os

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:32b")

def test():
    conn = get_connection()
    system_prompt = build_system_prompt(conn)
    user_query = "Show YTD util% by cost center"
    
    print(f"System prompt length (chars): {len(system_prompt)}")
    
    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Generate a DuckDB SQL query for: {user_query}"},
        ],
    }
    
    try:
        response = httpx.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload, timeout=120)
        data = response.json()
        print(f"Input tokens (prompt_eval_count): {data.get('prompt_eval_count')}")
        print(f"Output tokens (eval_count): {data.get('eval_count')}")
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    test()
