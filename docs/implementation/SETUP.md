# SmartAopAi — Setup Guide

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

### Python packages (installed via pip into `.venv`)

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

### Frontend packages (installed via npm)

| Package | Purpose |
|---|---|
| `react` | UI framework |
| `recharts` | Chart rendering |
| `typescript` | Type safety |
| `vite` | Frontend dev server + build tool |

---

## Mac

### 1. Clone the repository

```bash
git clone <repo-url>
cd SmartAopAi
```

### 2. Python virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

> You must activate the venv each time you open a new terminal before running any backend commands.

### 3. Install Python dependencies

```bash
pip install duckdb pandas openpyxl fastapi uvicorn python-dotenv httpx pydantic
```

### 4. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### 5. Pull the LLM model

```bash
ollama pull qwen2.5-coder:32b
```

> This downloads ~20 GB. Requires Ollama to be running (`ollama serve` or launch the Ollama desktop app).

### 6. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set:

```
INGEST_DIR=/absolute/path/to/your/xlsx/drop/folder
DB_PATH=./data/smartaop.duckdb
```

### 7. Run the ingest

Place the `.xlsx` file in your `INGEST_DIR` folder, then:

```bash
python -m backend.ingest.ingest
```

### 8. Start the backend

```bash
uvicorn backend.api.main:app --reload --port 8000
```

### 9. Start the frontend

```bash
cd frontend
npm run dev
```

App will be available at `http://localhost:5173`.

---

## Windows

### 1. Clone the repository

```powershell
git clone <repo-url>
cd SmartAopAi
```

### 2. Python virtual environment

```powershell
python -m venv .venv
.venv\Scripts\activate
```

> If you get an execution policy error, run this first (once):
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

> You must activate the venv each time you open a new terminal before running any backend commands.

### 3. Install Python dependencies

```powershell
pip install duckdb pandas openpyxl fastapi uvicorn python-dotenv httpx pydantic
```

### 4. Install frontend dependencies

```powershell
cd frontend
npm install
cd ..
```

### 5. Pull the LLM model

Open a new terminal and start Ollama:

```powershell
ollama serve
```

In another terminal, pull the model:

```powershell
ollama pull qwen2.5-coder:32b
```

> This downloads ~20 GB.

### 6. Configure environment

```powershell
copy .env.example .env
```

Open `.env` in any text editor and set:

```
INGEST_DIR=C:\absolute\path\to\your\xlsx\drop\folder
DB_PATH=./data/smartaop.duckdb
```

> Use forward slashes or double backslashes in `INGEST_DIR` on Windows to avoid escape issues.

### 7. Run the ingest

Place the `.xlsx` file in your `INGEST_DIR` folder, then:

```powershell
python -m backend.ingest.ingest
```

### 8. Start the backend

```powershell
uvicorn backend.api.main:app --reload --port 8000
```

### 9. Start the frontend

```powershell
cd frontend
npm run dev
```

App will be available at `http://localhost:5173`.

---

## Weekly Data Refresh

Each week, drop the new `.xlsx` file into your configured `INGEST_DIR` and re-run the ingest:

```bash
# Mac
python -m backend.ingest.ingest

# Windows
python -m backend.ingest.ingest
```

The ingest fully replaces all data — no manual cleanup needed.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `venv not found` | Ensure Python 3.11+ is installed and on your PATH |
| `ollama: command not found` | Install Ollama from ollama.com and restart terminal |
| `ollama pull` times out | Check internet connection; model is ~20 GB |
| `INGEST_DIR not set` | Ensure `.env` exists and `INGEST_DIR` has a valid absolute path |
| `No sheet named Utilization` | Verify the `.xlsx` file has the correct sheet names: `Utilization`, `Util CC Plan`, `Util T2 Plan` |
| Port 8000 already in use | Change port: `uvicorn backend.api.main:app --port 8001` |
| Port 5173 already in use | Vite will auto-select the next available port — check terminal output |
