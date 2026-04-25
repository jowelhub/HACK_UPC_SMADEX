# Web stack (`web/`)

Dockerized **PostgreSQL + FastAPI + React** demo for the Smadex Creative Intelligence hackathon. The UI calls the API; the API reads **only from Postgres** (pandas `read_sql_table` + in-memory joins). There is **no CSV read on each HTTP request**.

---

## Smadex context (why this app exists)

**Smadex** is modeled as a **DSP**: a system that runs **campaigns** for **advertisers**, each campaign having multiple **creatives** (images/videos/playables). Marketers care about **delivery KPIs** (CTR, CVR, spend efficiency) and **creative fatigue** (performance decay over time). This UI exposes **performance exploration**, **fatigue-style signals**, and **recommendations** APIs backed by the synthetic dataset loaded into Postgres.

For full **ad-tech vocabulary**, **hackathon judging goals**, and **column-by-column CSV documentation**, see the repo root **[README.md](../README.md)**. The CSVs that seed the database live under **`../data_science/data/`**; see **[../data_science/README.md](../data_science/README.md)** for file-level intent.

---

## PostgreSQL model (table mode)

Schema DDL: **`db/schema.sql`**. Four tables are loaded from CSV; the API joins them in memory into an enriched daily frame for queries, fatigue, ML, and recommendations.

| Table | Role | Source CSV (`data_science/data/`) |
|-------|------|-------------------------------------|
| **`advertisers`** | Advertiser dimension (name, vertical, HQ). | `advertisers.csv` |
| **`campaigns`** | Campaign dimension: links to advertiser, app, objective, dates, budget, targeting. | `campaigns.csv` |
| **`creatives`** | One row per ad asset: format, dimensions, copy/theme hooks, visual feature scores, asset path. | `creatives.csv` |
| **`creative_daily_country_os_stats`** | **Fact table**: one row per **date × creative × country × OS** — spend, impressions, clicks, conversions, revenue, `days_since_launch`, etc. | `creative_daily_country_os_stats.csv` |

**Relationships:** `campaigns.advertiser_id` → `advertisers`. `creatives.campaign_id` → `campaigns`. Each daily row references `campaign_id` and `creative_id` (and must match the creative’s campaign).

**Not in Postgres:** `creative_summary.csv` / `campaign_summary.csv` remain optional **offline** analysis files under `data_science/`; the web stack does **not** create or seed a `creative_summary` table. Lifetime and “first 7d / last 7d” style metrics for recommendations are **derived in Python** from the daily fact table plus `creatives`.

**Legacy volumes:** On startup, `ensure_db_seeded` drops a `creative_summary` table if it still exists from an older image so the DB matches this schema.

---

## Automatic seeding (Docker)

On **every backend container start**, `python -m scripts.ensure_db_seeded` runs **before** Uvicorn:

1. If core tables are missing → apply **`db/schema.sql`**.
2. Count rows in **`creative_daily_country_os_stats`**.
3. If count **> 0** → log **`skip import`** and **do nothing else** (no truncate, no CSV load).
4. If count **== 0** → **`TRUNCATE`** the four seeded tables (restart identities) → load CSVs from **`IMPORT_DATA_DIR`** (Compose: **`/import`**, bind-mounted from **`../data_science/data`**).

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
- **`/api/agent/sql`** (POST) — **Read-only** PostgreSQL for the **Analytics copilot** (internal; called by the `ai-agent` service). One `SELECT` / `WITH … SELECT` at a time, row cap, optional shared secret: `AGENT_SQL_TOKEN` on backend and `X-Agent-Token` on the request.
- **Analytics copilot (UI: `/copilot`)** — Separate **Node** service `web/ai-agent/`: Vercel **AI SDK** + Google **Gemma 4** (or `CHAT_MODEL` override), streaming at **`/api/agent/chat`**, with a SQL tool that calls the backend **read-only** Postgres API. Nginx in the frontend container proxies `/api/agent/` to that service. Required env: **`GOOGLE_GENERATIVE_AI_API_KEY`**. Local Vite dev proxies `/api/agent` to port **3001** (run `cd web/ai-agent && npm install && npm start` while the API runs on 8000).

---

## Related docs

- **Domain + columns:** [../README.md](../README.md)
- **CSV-first analysis:** [../data_science/README.md](../data_science/README.md)
