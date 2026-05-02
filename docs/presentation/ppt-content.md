# SmartAopAi — Presentation Slide Content

Full content for a 10-slide PowerPoint deck. Each section contains the headline, body copy, and speaker notes where relevant.

---

## Slide 1: Title Slide

**Title:** SmartAopAi
**Subtitle:** Natural Language Insights for Workforce Utilization Data
**Tagline:** *Ask in plain English. Get charts, tables, and AI-written insights — instantly.*

---

## Slide 2: The Problem

**Headline:** Utilization data exists. Access doesn't.

**Body:**
- ~300 internal users — managers, supervisors, delivery leads — need weekly workforce insights
- Data lives in Excel files updated weekly, requiring manual analysis
- Answering questions like *"Which cost center is over-utilized this month?"* requires SQL knowledge or analyst intervention
- Result: delayed decisions, analyst bottlenecks, and data that sits unused

**Key callout:**
> Every insight request that goes through an analyst adds hours of delay to a decision that could be made in seconds.

---

## Slide 3: The Solution

**Headline:** Type a question. Get the answer.

**What it does:**
- Business users type a plain-English question into a chat interface
- The system generates SQL automatically, runs it against live data, and returns:
  - A **chart** (bar, line, or pie — auto-selected based on the data shape)
  - A **data table**
  - An **AI-written narrative** explaining the result in plain English
  - The **generated SQL** for full transparency

**Example questions users can ask:**
- *"What is the billable utilization for each cost center in April?"*
- *"Show me the top 5 employees by training hours this quarter"*
- *"Compare planned vs actual hours for T2 groups year to date"*

**Bottom line:** No SQL. No Excel. No analyst required.

---

## Slide 4: How It Works — The Pipeline

**Headline:** 6-step real-time pipeline, fully visible to the user

| Step | Name | What Happens |
|---|---|---|
| 1 | Analyzing | Database schema and business rules are loaded into the LLM context |
| 2 | Generating SQL | Local LLM converts the plain-English question into a SQL query |
| 3 | Validating SQL | Safety layer checks and blocks any write or destructive operations |
| 4 | Executing | SQL runs against DuckDB — results returned as structured rows |
| 5 | Detecting Chart | System selects the best chart type for the shape of the result data |
| 6 | Generating Insights | LLM writes a plain-English narrative summarizing the findings |

**Key UX points:**
- Users see a live **step tracker** progressing in real time — no blank loading screen
- Built on **NDJSON streaming over HTTP** — each step emits events the moment it completes
- The experience feels conversational and responsive, not like waiting for a batch report

---

## Slide 5: Tech Stack

**Headline:** Modern, lean, and fully on-premise

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 19, TypeScript, Vite | Fast, type-safe UI with real-time streaming support |
| Charting | Recharts | Dynamic bar, line, and pie chart rendering |
| Backend | Python, FastAPI | Async API server built for streaming responses |
| Database | DuckDB | Embedded analytical SQL — no separate database server needed |
| LLM Runtime | Ollama (local) | Runs entirely on-premise — no data sent to any cloud service |
| LLM Model | qwen2.5-coder:32b | Optimized for accurate SQL generation |
| Data Protocol | NDJSON over chunked HTTP | Enables real-time step-by-step streaming to the browser |
| Deployment | Vercel (frontend) | Zero-config cloud hosting for the React UI |

**Key highlight:**
The LLM runs **locally via Ollama** — no OpenAI, no external API, no employee data leaving the organization.

---

## Slide 6: Data Model

**Headline:** Three tables. One source of truth. Refreshed weekly.

Data is loaded from an `.xlsx` file placed weekly into a configured directory on the backend. Each upload is a **full historical replacement** — the latest file is always treated as authoritative, including any corrections to past data.

### Table 1: `actuals` — Employee utilization by week
- **Grain:** one row per employee per week (per cost center)
- **Key columns:** Billed Hrs, Capex Hrs, Vacation Hrs, Training Hrs, Admin Hrs, Standard Billable Hrs
- **Used for:** actual utilization analysis at individual, team, and cost center level

### Table 2: `cc_plan` — Cost center planned hours by month
- **Grain:** one row per cost center per month
- **Key columns:** CC Planned Hrs, CC Standard Hrs
- **Used for:** plan vs actual comparisons at the department level

### Table 3: `t2_plan` — T2 hierarchy planned hours by month
- **Grain:** one row per T2 org group per month
- **Key columns:** T2 Planned Hrs, T2 Standard Hrs
- **Used for:** org-level rollup comparisons across the hierarchy

**Critical business rule baked into the system:**
> The business calendar does not match the standard calendar. January = 3 weeks, December = 6 weeks. The `Month` column in the data is always used as-is — months are never derived from dates.

---

## Slide 7: Safety & Reliability

**Headline:** Built so business users can't break anything — and can trust the answers.

### SQL Safety
- Every generated SQL query passes through a **validator before it ever reaches the database**
- Any query containing `INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE`, or `ALTER` is **blocked outright**
- Only `SELECT` statements are executed — the data is always read-only from the user's perspective

### Prompt Engineering for Accuracy
- The full database schema is injected into every LLM prompt — no hallucinated column names
- Metric formulas are explicitly defined in the prompt (e.g., Billable Utilization = Billed Hrs ÷ Std Billable Hrs)
- Business calendar rules and known data quirks are described so the model applies them correctly
- The model is explicitly instructed never to derive months from dates — always use the `Month` column

### Streaming Reliability
- Each pipeline step is isolated — a failure in chart detection does not block the narrative step
- The frontend handles partial results gracefully — users see each result as it arrives
- Real-time progress feedback means users are never left staring at a blank screen

---

## Slide 8: Live Demo / Screenshots

**Headline:** The full experience in one flow

**Three moments to show:**

### Moment 1 — Query Input
- User types: *"Show billable utilization by cost center for Q1"*
- A sidebar shows pre-built suggested queries to help new users get started immediately
- Voice input is also supported for hands-free querying

### Moment 2 — Step Tracker + SQL Panel
As the pipeline processes the request:
- All 6 steps light up one by one in real time
- The generated SQL is displayed in a collapsible panel — users can see exactly what query ran against their data

### Moment 3 — Results
Final output rendered on screen:
- **Bar chart** showing billable utilization % per cost center
- **Data table** with the raw query results below the chart
- **AI narrative:** *"Cost center X led Q1 with 94% billable utilization, while cost center Y trailed at 61%, primarily due to elevated training hours in February."*
- **Export to PDF** button for sharing or archiving the result

---

## Slide 9: Impact

**Headline:** Self-serve data access for 300 users — no SQL required.

### Before SmartAopAi
- Utilization questions routed through analysts or Excel-literate team members
- Hours of lag between asking a question and getting an answer
- Insights locked to whoever can write SQL or build pivot tables
- Excel files opened manually, filtered, and interpreted each time

### After SmartAopAi
- Any manager types their question and gets a visual answer in under 30 seconds
- Charts and AI narratives require zero interpretation effort from the user
- Analysts freed from handling repetitive ad-hoc reporting requests
- Data-driven decisions happen in the meeting room, not after it

### Key Technical Wins
- **Local LLM = zero data privacy risk** — no employee or utilization data is sent to any external service
- **DuckDB** handles analytical queries over Excel-scale data with no infrastructure overhead — no database server to manage
- **Streaming UX** keeps users engaged throughout — no blank wait screens, progress is always visible

---

## Slide 10: What's Next

**Headline:** Foundation is live. Here's where it goes.

| Feature | Description |
|---|---|
| Authentication & Embedding | Integrate into the internal portal; users arrive via deep link from existing app |
| Conversation History | Multi-turn queries — follow-up questions that build on prior results in the same session |
| Scheduled Reports | Automatically push weekly utilization summaries to managers |
| Expanded Data Sources | Add headcount, project allocation, and cost data alongside utilization |
| Fine-Tuned SQL Model | Train on org-specific queries over time for higher accuracy on domain-specific questions |

**Closing line:**
> SmartAopAi turns a weekly Excel file into a live, queryable analytics layer — accessible to every manager in the organization, right now.

---

*Document generated: 2026-05-02*
