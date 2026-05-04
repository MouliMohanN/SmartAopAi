# LLM API Cost & Token Estimates

When connecting SmartAopAi to a cloud-based LLM API (like Nvidia's API, OpenAI, or a hosted Ollama proxy) that charges per token, it is helpful to understand the expected token consumption and query costs.

## Token Consumption Breakdown

For a typical analytical query (e.g., *"Show YTD util% by cost center"*):

1. **SQL Generation (Primary Call)**
   - **Input Tokens:** ~4,800 tokens. This is heavily driven by the system prompt, which injects the database schema and table definitions so the LLM can generate accurate SQL.
   - **Output Tokens:** ~750 to 1,000 tokens. Reasoning models tend to be verbose (often outputting `<think>` reasoning steps before the final SQL), resulting in higher output token counts.

2. **Narrative Generation (Secondary Call)**
   - **Input Tokens:** ~1,500 tokens. This includes the initial question and the first ~50 rows of execution results.
   - **Output Tokens:** ~150 tokens. This generates the short, 2-3 sentence English explanation of the data.

## Example Cost Calculation

Assuming GPT 40 nano pricing (e.g., **$0.10** per 1M input tokens and **$0.40** per 1M output tokens):

### 1. Cost per SQL Generation:
* **Input Cost:** 4,800 tokens × ($0.10 / 1,000,000) = **$0.00048**
* **Output Cost:** 800 tokens × ($0.40 / 1,000,000) = **$0.00032**
* **Total:** **$0.00080** per query.

*(At this rate, you can generate SQL for **1,250 questions per $1.00**)*

### 2. Cost including Narrative Summary:
* **Input Cost:** 1,500 tokens × ($0.10 / 1,000,000) = **$0.00015**
* **Output Cost:** 150 tokens × ($0.40 / 1,000,000) = **$0.00006**
* **Total:** **$0.00021** per narrative.

### Total Cost per Full Interaction
Combining both the SQL generation and the narrative summary, the total expected cost is **~$0.00101 per full question**.

Even with both the SQL generation and the text summary, you can expect to process roughly **1,000 full queries + explanations per $1.00**.
