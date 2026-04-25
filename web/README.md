# Web stack (`web/`)

Dockerized **PostgreSQL + FastAPI + React** demo for the Smadex Creative Intelligence hackathon. The UI calls the API; the API reads **only from Postgres** (pandas `read_sql_table` + in-memory joins). There is **no CSV read on each HTTP request**.

---

## Smadex context (why this app exists)

**Smadex** is modeled as a **DSP**: a system that runs **campaigns** for **advertisers**, each campaign having multiple **creatives** (images/videos/playables). Marketers care about **delivery KPIs** (CTR, CVR, spend efficiency) and **creative fatigue** (performance decay over time). This UI exposes **performance exploration**, **fatigue-style signals**, and **recommendations** APIs backed by the synthetic dataset loaded into Postgres.

For full **ad-tech vocabulary**, **hackathon judging goals**, and **column-by-column CSV documentation**, see the repo root **[README.md](../README.md)**. The CSVs that seed the database live under **`../data_science/data/`**; see **[../data_science/README.md](../data_science/README.md)** for file-level intent.

---

## PostgreSQL model (table mode)

Schema DDL: **`db/schema.sql`**. Each **delivery / entity** CSV under **`../data_science/data/`** has a matching **public table** (same base name as the file). **`data_dictionary.csv`** is documentation only (not loaded into Postgres). The API builds the explorer from the **daily fact table** joined to dimensions in memory.

| Table | Source CSV |
|-------|------------|
| **`advertisers`** | `advertisers.csv` |
| **`campaigns`** | `campaigns.csv` |
| **`creatives`** | `creatives.csv` |
| **`campaign_summary`** | `campaign_summary.csv` |
| **`creative_summary`** | `creative_summary.csv` |
| **`advertiser_campaign_rankings`** | `advertiser_campaign_rankings.csv` |
| **`creative_daily_country_os_stats`** | `creative_daily_country_os_stats.csv` |

**Relationships:** `campaigns.advertiser_id` → `advertisers`. `creatives.campaign_id` → `campaigns`. `campaign_summary`, `advertiser_campaign_rankings`, and daily rows reference `campaign_id` where applicable. `creative_summary` and daily rows reference `creative_id`.

**Existing Docker volumes:** If **`creative_daily_country_os_stats`** already has rows but newer/empty tables exist, **`ensure_db_seeded`** backfills **`campaign_summary`**, **`creative_summary`**, and **`advertiser_campaign_rankings`** from `/import` without truncating the fact table.

---

## Automatic seeding (Docker)

On **every backend container start**, `python -m scripts.ensure_db_seeded` runs **before** Uvicorn:

1. If any expected seed table is missing → apply **`db/schema.sql`**.
2. Count rows in **`creative_daily_country_os_stats`**.
3. If count **> 0** → log **`skip full import`** and **backfill** any empty optional tables from CSV (no truncate of the fact table).
4. If count **== 0** → **`TRUNCATE`** all seven seeded tables (restart identities) → load every seeded CSV in dependency order from **`IMPORT_DATA_DIR`** (Compose: **`/import`** → **`../data_science/data`**).

So your log line **`fact table empty; truncating (if any) and importing CSVs`** means the fact table had **zero** rows (fresh volume or wiped data). A second `docker compose up` with the same volume should show **`creative_daily_country_os_stats has … rows; skip import`**.

**Reset Postgres data completely:** from this directory run `docker compose down -v` then `up` again (removes the named volume).

---

## Run (Docker)

```bash
cd web
docker compose up --build
```

| Service | URL / port |
|---------|------------|
| UI | http://localhost:8080 |
| API | http://localhost:8000 |
| Postgres | localhost:5432 — user / password / DB: `smadex` / `smadex` / `smadex` |

**Environment (backend):**

| Variable | Meaning |
|----------|---------|
| `DATABASE_URL` | SQLAlchemy URL (e.g. `postgresql+psycopg2://smadex:smadex@postgres:5432/smadex`) |
| `IMPORT_DATA_DIR` | Directory containing the CSVs (default in image: `/import`) |
| `SCHEMA_SQL_PATH` | Optional override path to `schema.sql` |

---

## Run (local dev, no full stack)

1. Postgres running and empty (or already seeded).
2. Seed once if needed (from repo root, with `web/backend` deps installed):

   ```bash
   export DATABASE_URL=postgresql+psycopg2://USER:PASS@localhost:5432/smadex
   export IMPORT_DATA_DIR=/absolute/path/to/HACK_UPC_SMADEX/data_science/data
   python web/backend/scripts/bootstrap_pg_from_csv.py
   ```

3. API: `cd web/backend && uvicorn main:app --reload --port 8000` with `DATABASE_URL` set.  
4. UI: `cd web/frontend && npm install && npm run dev` (Vite; ensure CORS origins match your dev URL).

---

## API surface (high level)

- **`/api/health`** — Liveness for Compose healthchecks.
- **`/api/performance/*`** — Sliced metrics from the enriched daily frame.
- **`/api/fatigue/*`** — Creative IDs and **ML-only** CTR training / prediction (no rule-based degradation API).
- **`/api/recommendations/*`** — Recommendation helpers.
- **`/api/agent/sql`** (POST) — **Read-only** PostgreSQL for the **NL → SQL copilot** (internal; called by the `ai-agent` service). One `SELECT` / `WITH … SELECT` at a time, row cap, optional shared secret: `AGENT_SQL_TOKEN` on backend and `X-Agent-Token` on the request.
- **Natural language to SQL copilot (UI: `/copilot`)** — Separate **Node** service `web/ai-agent/`: Google **`@google/genai`** (default **Gemma 4** `gemma-4-31b-it`, override with `CHAT_MODEL`). **Function calling** with **`runSQL`** + **`getDatabaseSchema`**. Server-Sent Events at **`/api/agent/chat`**: streaming text and optional “thought” parts. Nginx proxies `/api/agent/` to the copilot service. Required env: **`GOOGLE_GENERATIVE_AI_API_KEY`**. Local Vite dev proxies `/api/agent` to **3001** (`cd web/ai-agent && npm install && npm start` with the API on 8000).

---

## Related docs

- **Domain + columns:** [../README.md](../README.md)
- **CSV-first analysis:** [../data_science/README.md](../data_science/README.md)
