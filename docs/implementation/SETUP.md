# SmartAopAi — Setup & Run Guide

## Hardware Requirements

| Component | Minimum | Recommended |
|---|---|---|
| RAM | 32 GB | 48 GB (required to run Qwen2.5-Coder-32B comfortably) |
| Storage | 30 GB free | 40 GB free (model is ~20 GB + data + dependencies) |
| CPU | Apple Silicon or x86-64 | Apple M-series (M1 Pro or later) for best on-prem LLM performance |
| GPU | Optional | Apple Unified Memory (M-series) or NVIDIA GPU accelerates inference |

> The 32B model will run on CPU-only but will be significantly slower. Apple M-series chips with 48 GB unified memory are the recommended on-prem setup.

---

## Required Software

| Tool | Version | Purpose | Mac | Windows |
|---|---|---|---|---|
| Python | 3.11+ | Backend runtime | [python.org](https://www.python.org/downloads/) or `brew install python` | [python.org](https://www.python.org/downloads/) |
| Node.js + npm | 18+ | Frontend build & dev server | [nodejs.org](https://nodejs.org) or `brew install node` | [nodejs.org](https://nodejs.org) |
| Ollama | Latest | Runs the on-prem LLM locally | [ollama.com](https://ollama.com/download) | [ollama.com](https://ollama.com/download) |
| Qwen2.5-Coder-32B | — | NL→SQL model (~20 GB download) | `ollama pull qwen2.5-coder:32b` | `ollama pull qwen2.5-coder:32b` |
| Git | Any | Version control | `brew install git` | [git-scm.com](https://git-scm.com) |
| Homebrew | Latest | Mac package manager | [brew.sh](https://brew.sh) | — |

### Python packages (`requirements.txt`)

| Package | Purpose |
|---|---|
| `duckdb` | Embedded analytical database |
| `pandas` | Excel file parsing |
| `openpyxl` | `.xlsx` read support for pandas |
| `fastapi` | REST API framework |
| `uvicorn` | ASGI server for FastAPI |
| `python-dotenv` | `.env` file loading |
| `httpx` | HTTP client for Ollama API calls |
| `pydantic` | Request/response validation |
| `openai` | Client for streaming SQL from Nvidia API |

### Frontend packages (npm)

| Package | Purpose |
|---|---|
| `react` | UI framework |
| `recharts` | Chart rendering |
| `typescript` | Type safety |
| `vite` | Frontend dev server + build tool |

---

## Project Structure (quick reference)

```
SmartAopAi/
├── backend/
│   ├── ingest/          # Excel → DuckDB pipeline
│   ├── engine/          # NL→SQL, LLM, validator, executor
│   └── api/             # FastAPI routes (/query, /explain, /health)
├── data/
│   ├── inputFile/       # Drop your .xlsx file here (INGEST_DIR)
│   └── smartaop.duckdb  # Auto-created by the ingest step
├── frontend/            # React + Vite app
├── .env                 # Local config (not committed)
├── .env.example         # Template — copy this to .env
└── requirements.txt     # Python dependencies
```

---

## One-time Setup

### Mac

#### 1. Clone the repository

```bash
git clone <repo-url>
cd SmartAopAi
```

#### 2. Python virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

> You must activate the venv every time you open a new terminal before running backend commands.

#### 3. Install Python dependencies

```bash
pip install -r requirements.txt
```

> If you are updating an existing setup, make sure to re-run this command to install newly added dependencies like `openai`.

#### 4. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

#### 5. Configure environment

The `.env.example` file is the template. Copy it and it will work as-is for a standard local setup:

```bash
cp .env.example .env
```

Your `.env` should look like this:

```
INGEST_DIR=./data/inputFile
DB_PATH=./data/smartaop.duckdb

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5-coder:32b
OLLAMA_TIMEOUT=120

# Nvidia API configuration for OpenAI client
NVIDIA_API_KEY=your_nvidia_api_key_here
```

> **Note:** The `NVIDIA_API_KEY` is required for the new streamed SQL generation endpoint. You must obtain an API key from the Nvidia integration portal and add it here.

> `INGEST_DIR` is where you drop the weekly `.xlsx` file. The path above is relative to the project root — it already exists in the repo.

#### 6. Pull the LLM model

Make sure Ollama is running (launch the Ollama desktop app or run `ollama serve` in a terminal), then:

```bash
ollama pull qwen2.5-coder:32b
```

> This downloads ~20 GB. It only needs to be done once.

---

### Windows

#### 1. Clone the repository

```powershell
git clone <repo-url>
cd SmartAopAi
```

#### 2. Python virtual environment

```powershell
python -m venv .venv
.venv\Scripts\activate
```

> If you get an execution policy error, run this once:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

#### 3. Install Python dependencies

```powershell
pip install -r requirements.txt
```

> If you are updating an existing setup, make sure to re-run this command to install newly added dependencies like `openai`.

#### 4. Install frontend dependencies

```powershell
cd frontend
npm install
cd ..
```

#### 5. Configure environment

```powershell
copy .env.example .env
```

Open `.env` in any text editor. The defaults work as-is. If you want to use an absolute path for `INGEST_DIR` on Windows:

```
INGEST_DIR=C:\path\to\SmartAopAi\data\inputFile
```

> Use forward slashes or double backslashes to avoid escape issues.

#### 6. Pull the LLM model

Open Ollama, then in a terminal:

```powershell
ollama pull qwen2.5-coder:32b
```

---

## Running the Project

Every time you want to run the app, you need **three things** running:

1. **Ollama** (LLM server)
2. **FastAPI backend** (port 8000)
3. **React frontend** (port 5173)

Open three separate terminal windows.

---

### Terminal 1 — Ollama

**Mac:**
```bash
ollama serve
```
**Windows:**  
Launch the Ollama desktop app, or run `ollama serve` in PowerShell.

> If the Ollama desktop app is already running in your menu bar, skip this — it starts the server automatically.

---

### Terminal 2 — Backend

From the project root (`SmartAopAi/`):

**Mac:**
```bash
source .venv/bin/activate
uvicorn backend.api.main:app --reload --port 8000
```

**Windows:**
```powershell
.venv\Scripts\activate
uvicorn backend.api.main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

Verify it's healthy:
```bash
curl http://localhost:8000/health
```
Expected response:
```json
{"status":"ok","db_connected":true,"llm_reachable":true}
```

> `llm_reachable: false` means Ollama is not running or the model hasn't finished downloading yet.

---

### Terminal 3 — Frontend

```bash
cd frontend
npm run dev
```

You should see:
```
VITE ready in ...ms
➜  Local:   http://localhost:5173/
```

Open `http://localhost:5173` in your browser. Type a question and press **Ask**.

---

## Weekly Data Refresh

Each week, drop the new `.xlsx` file into `data/inputFile/` (replacing the previous one), then re-run the ingest from the project root:

**Mac:**
```bash
source .venv/bin/activate
python -m backend.ingest.ingest
```

**Windows:**
```powershell
.venv\Scripts\activate
python -m backend.ingest.ingest
```

The ingest fully replaces all data — no manual cleanup needed. The backend does **not** need to be restarted after ingest.

---

## Integration: Pre-populate from another app

The frontend reads a `?q=` URL parameter on load and auto-submits it as the first query. Use this to deep-link from a portal or another tool:

```
http://localhost:5173/?q=Show%20YTD%20util%25%20by%20cost%20center
```

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `ModuleNotFoundError` on backend start | Activate the venv first: `source .venv/bin/activate` (Mac) or `.venv\Scripts\activate` (Windows) |
| `ollama: command not found` | Install Ollama from ollama.com and restart terminal |
| `ollama pull` times out | Check internet connection; model is ~20 GB |
| `llm_reachable: false` in `/health` | Start Ollama (`ollama serve`) and ensure the model finished downloading |
| `db_connected: false` in `/health` | Run the ingest first: `python -m backend.ingest.ingest` |
| `INGEST_DIR not set` | Ensure `.env` exists at the project root with `INGEST_DIR` defined |
| `No sheet named Utilization` | Verify the `.xlsx` has sheets named exactly: `Utilization`, `Util CC Plan`, `Util T2 Plan` |
| Multiple `.xlsx` files in `INGEST_DIR` | The ingest expects exactly one `.xlsx` file — remove old files from `data/inputFile/` |
| Port 8000 already in use | Change port: `uvicorn backend.api.main:app --port 8001` and set `VITE_API_URL=http://localhost:8001` in `frontend/.env.local` |
| Port 5173 already in use | Vite auto-selects the next available port — check terminal output for the actual URL |
| Slow LLM responses (>2 min) | Normal for a 32B model on CPU. Apple M-series with 48 GB RAM runs it in ~10–30s per query |
