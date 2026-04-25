# Smadex Creative Intelligence (HackUPC) — Project context

Use this file as **persistent context** for LLMs, teammates, or future you. It explains the **business domain**, the **hackathon goal**, how **datasets relate**, and **every column** in the CSVs (verified against `data/` headers and `data/data_dictionary.csv`).

---

## 1. What is Smadex and what does this challenge assume?

**Smadex** is a **mobile advertising platform**, specifically a **DSP (Demand-Side Platform)**. A DSP buys ad inventory on behalf of **advertisers** (brands that want installs, purchases, signups, etc.). When you see an ad inside a mobile app, a chain of systems decided in near real time whether to show it and which creative to show.

Public messaging often cites extreme scale (for example, millions of bid opportunities per second and sub-100ms decision windows). You do **not** need live auction logs for this hackathon; the provided CSVs are a **fully synthetic** teaching dataset.

---

## 2. Ad-tech vocabulary (minimum viable mental model)

### Who is who

| Role | Meaning |
|------|---------|
| **Advertiser** | Pays to run ads to hit a business goal (install app, purchase, etc.). |
| **Publisher** | Owns the app or site where the ad appears; sells impressions. |
| **DSP** | Advertiser-side buying automation (bid, budget, creatives, targeting). Smadex is modeled as a DSP here. |
| **SSP** | Publisher-side selling automation. |
| **Ad exchange** | Liquidity layer where buy and sell meet (not represented as a table in this dataset). |

### Real-time bidding (RTB), in one paragraph

When an impression becomes available, eligible buyers evaluate a **bid request** (often includes coarse geo, device/OS, app category, etc.). Buyers respond with bids; a winner is chosen; the winning creative is served. **This repository does not contain bid-level auction logs.** It contains **delivery and outcome statistics** after the fact (spend, impressions, clicks, conversions, revenue), plus **creative and campaign metadata**.

### Objects in this dataset

| Object | Meaning |
|--------|---------|
| **Creative** | The actual ad unit (image/video/playable layout). Identified by `creative_id`. |
| **Campaign** | A structured flight with budget, dates, targeting, and an **objective**. Identified by `campaign_id`. |
| **Advertiser** | The company running campaigns. Identified by `advertiser_id`. |

### KPIs you will compute constantly

| KPI | Definition | Notes |
|-----|------------|--------|
| **Impression** | Ad was served (row count in daily fact table). | Use `impressions` column. |
| **Click** | User tapped the ad. | `clicks`. |
| **Conversion** | User completed the campaign objective (install, purchase, etc.). | `conversions`; meaning depends on `campaigns.objective`. |
| **CTR** | `clicks / impressions` | Guard divide-by-zero. |
| **CVR** | `conversions / clicks` | Guard divide-by-zero. |
| **IPM** | `1000 * conversions / impressions` | Installs (or conversions) per mille impressions. |
| **ROAS** | `revenue_usd / spend_usd` | Above 1 means revenue exceeds spend on that slice. |
| **CPA** | `spend_usd / conversions` | **This dataset’s stated KPI focus** (`kpi_goal` is CPA in campaigns). |

### Creative fatigue (the narrative hook)

**Fatigue** means performance **degrades over time** for a creative that used to work: CTR/CVR/efficiency slip even if targeting is unchanged. Marketers want **early warnings** and **actions** (refresh creative, rotate variants, reallocate budget).

---

## 3. Hackathon goal (what judges want)

Build a product-style demo that helps a marketer answer:

1. **Which ads are working right now?** — Performance explorer (slice metrics by time, geo, OS, format, etc.).
2. **Which ads are dying (fatigue)?** — Fatigue detection (trends vs a baseline, not only a static leaderboard).
3. **What should I do next?** — Recommendations / explainability (actions on **creatives**, not “what to bid on an auction slot” unless you bring external auction data).

**Bonus differentiator:** combine **`asset_file` PNGs** with performance to explain *why* patterns exist (vision model, human review UI, clustering, etc.).

**Framing:** this is not a perfect Kaggle-style leaderboard problem. Strong projects blend **analysis + simple models + explainability + UX**.

---

## 4. Dataset inventory (sizes and roles)

From `data/README.md` (canonical counts):

| Entity | Count |
|--------|------:|
| Advertisers | 36 |
| Campaigns | 180 |
| Creatives | 1,080 |
| Daily fact rows | 192,315 |

**Uniformity quirk:** every advertiser has **5** campaigns and every campaign has **6** creatives by design. Portfolio-size comparisons are meaningless; compare **performance and creative traits** instead.

---

## 5. How files relate (join graph)

```
advertisers.csv
  └── advertiser_id ──< campaigns.csv
                          └── campaign_id ──< creatives.csv
                                                └── creative_id ──< creative_daily_country_os_stats.csv
                                                (also join daily rows by campaign_id for sanity)
```

**Practical joins**

- `campaigns.advertiser_id` -> `advertisers.advertiser_id`
- `creatives.campaign_id` -> `campaigns.campaign_id`
- `creative_daily_country_os_stats.creative_id` -> `creatives.creative_id`
- `creative_daily_country_os_stats.campaign_id` -> `campaigns.campaign_id` (redundant but useful)

**Pre-aggregated convenience tables**

- `creative_summary.csv` = one row per creative: lifetime totals, decay features, **synthetic labels** (`creative_status`, `fatigue_day`, `perf_score`), plus creative metadata columns mirrored from `creatives.csv`.
- `campaign_summary.csv` = one row per campaign: lifetime totals + campaign metadata.

**Authoritative column gloss:** `data/data_dictionary.csv` (machine-readable). The sections below match **actual CSV headers** in this repo.

---

## 6. File-by-file column reference

### 6.1 `advertisers.csv`

| Column | Type | Meaning |
|--------|------|---------|
| `advertiser_id` | int | Primary key. |
| `advertiser_name` | string | Synthetic company name. |
| `vertical` | string | Industry vertical (gaming, fintech, etc.). |
| `hq_region` | string | Synthetic HQ region (e.g. LATAM, North America). |

### 6.2 `campaigns.csv`

| Column | Type | Meaning |
|--------|------|---------|
| `campaign_id` | int | Primary key. |
| `advertiser_id` | int | FK to `advertisers.advertiser_id`. |
| `advertiser_name` | string | Denormalized name (matches advertiser). |
| `app_name` | string | Promoted app/product name. |
| `vertical` | string | Vertical. |
| `objective` | string | Conversion goal: `install`, `purchase`, `signup`, `booking`, `order`, etc. |
| `primary_theme` | string | Campaign-level creative angle. |
| `target_age_segment` | string | Age band targeted. |
| `target_os` | string | `Android`, `iOS`, or `Both`. |
| `countries` | string | Pipe-separated list, e.g. `CA|US|ES|JP`. |
| `start_date` | date | Campaign start. |
| `end_date` | date | Campaign end. |
| `daily_budget_usd` | float | Approximate daily budget. |
| `kpi_goal` | string | In this dataset: **CPA** focus. |

### 6.3 `creatives.csv`

Rich **metadata + engineered visual features** (synthetic) for each creative. Includes path to a synthetic PNG.

**Identity and delivery**

| Column | Type | Meaning |
|--------|------|---------|
| `creative_id` | int | Primary key. |
| `campaign_id` | int | FK to `campaigns.campaign_id`. |
| `advertiser_name` | string | Denormalized. |
| `app_name` | string | Denormalized promoted app. |
| `vertical` | string | Denormalized vertical. |
| `format` | string | e.g. `interstitial`, `rewarded_video`, `banner`, `native`, `playable`. |
| `width`, `height` | int | Asset dimensions (pixels). |
| `language` | string | Creative copy language code. |
| `creative_launch_date` | string/date | First active date for the creative. |
| `asset_file` | string | Relative path to a synthetic PNG (bundle may or may not ship `assets/` next to the CSVs; paths are still valid when images are present). |

**Concept / copy**

| Column | Type | Meaning |
|--------|------|---------|
| `theme` | string | Story/concept bucket. |
| `hook_type` | string | Attention hook category. |
| `cta_text` | string | Call to action text. |
| `headline` | string | Primary headline text in asset. |
| `subhead` | string | Secondary line. |
| `dominant_color` | string | Color family. |
| `emotional_tone` | string | Tone bucket. |

**Visual scores (roughly 0-1 floats unless noted)**

| Column | Type | Meaning |
|--------|------|---------|
| `duration_sec` | int | Video/interactive length; **0** for static. |
| `text_density` | float | Share of layout covered by text (0-1). |
| `copy_length_chars` | int | Approximate character count of copy. |
| `readability_score` | float | Estimated readability (0-1). |
| `brand_visibility_score` | float | Logo/brand prominence (0-1). |
| `clutter_score` | float | Busyness (0-1). |
| `novelty_score` | float | Originality (0-1). |
| `motion_score` | float | Motion intensity (0-1). |
| `faces_count` | int | Number of faces visible. |
| `product_count` | int | Product/food elements shown. |

**Binary flags (0/1)**

| Column | Meaning |
|--------|---------|
| `has_price` | Price or monetary offer visible. |
| `has_discount_badge` | Sale/discount badge visible. |
| `has_gameplay` | Gameplay footage visible. |
| `has_ugc_style` | UGC / creator-style layout. |

### 6.4 `creative_daily_country_os_stats.csv` (main fact table)

Grain: **one row per (`date`, `creative_id`, `country`, `os`)** (also carries `campaign_id`).

| Column | Type | Meaning |
|--------|------|---------|
| `date` | date | Observation date. |
| `campaign_id` | int | FK to campaigns. |
| `creative_id` | int | FK to creatives. |
| `country` | string | Delivery country code. |
| `os` | string | `Android` or `iOS`. |
| `days_since_launch` | int | Days since creative launch on that date (fatigue axis). |
| `impressions_last_7d` | int | **Precomputed rolling** impressions (see caveats below). |
| `spend_usd` | float | Spend attributed to this slice. |
| `impressions` | int | Served impressions for the slice. |
| `viewable_impressions` | int | Estimated viewable impressions. |
| `clicks` | int | Clicks. |
| `conversions` | int | Conversions (meaning per campaign objective). |
| `revenue_usd` | float | Attributed revenue. |
| `video_completions` | int | Completed video views (0 for static). |

**Important analytical caveat:** `impressions_last_7d` is a **rolling** field defined by the dataset authors. **Do not blindly sum it across rows** the same way you sum `impressions`; for rollups you usually aggregate `impressions`, `spend_usd`, etc., and compute your own rolling windows if needed.

### 6.5 `creative_summary.csv`

Grain: **one row per `creative_id`**. Contains:

- Lifetime totals and overall rates (`overall_*`).
- First-week vs last-week decay features (`first_7d_*`, `last_7d_*`, `*_decay_pct`).
- Synthetic supervision-ish fields: `creative_status`, `fatigue_day`, `perf_score`.
- Creative metadata duplicated for modeling convenience (same themes as `creatives.csv`).

**IDs and labels**

| Column | Meaning |
|--------|---------|
| `creative_id`, `campaign_id` | Keys. |
| `advertiser_name`, `app_name`, `vertical`, `format` | Denormalized context. |
| `creative_status` | `top_performer`, `stable`, `fatigued`, `underperformer` (synthetic). |
| `fatigue_day` | Populated for **fatigued** rows; blank otherwise (see quirks). |
| `perf_score` | Synthetic scalar score (0-1). |

**Lifetime totals**

| Column | Meaning |
|--------|---------|
| `total_days_active` | Active lifetime length (days). |
| `total_spend_usd`, `total_impressions`, `total_clicks`, `total_conversions`, `total_revenue_usd` | Rolled-up sums. |
| `overall_ctr`, `overall_cvr`, `overall_ipm`, `overall_roas` | Derived rates. |

**Fatigue / momentum features**

| Column | Meaning |
|--------|---------|
| `first_7d_ctr`, `last_7d_ctr`, `ctr_decay_pct` | CTR early vs late and relative change. |
| `first_7d_cvr`, `last_7d_cvr`, `cvr_decay_pct` | Same for CVR. |
| `peak_rolling_ctr_5` | Peak short-window CTR early in life. |

**Creative metadata columns** (same families as `creatives.csv`)

Includes: `width`, `height`, `language`, `creative_launch_date`, `theme`, `hook_type`, `cta_text`, `headline`, `subhead`, `dominant_color`, `emotional_tone`, `duration_sec`, `text_density`, `copy_length_chars`, readability/brand/clutter/novelty/motion scores, counts, `has_*` flags, `asset_file`.

**Volume helpers**

| Column | Meaning |
|--------|---------|
| `peak_day_impressions` | Max impressions on a single day. |
| `first_7d_impressions`, `first_7d_clicks`, `first_7d_conversions` | First week raw counts. |
| `last_7d_impressions`, `last_7d_clicks`, `last_7d_conversions` | Last week raw counts. |

### 6.6 `campaign_summary.csv`

Grain: **one row per `campaign_id`**. Campaign metadata plus rolled-up performance.

| Column | Meaning |
|--------|---------|
| `campaign_id` | Key. |
| `total_spend_usd`, `total_impressions`, `total_clicks`, `total_conversions`, `total_revenue_usd` | Totals. |
| `advertiser_id`, `advertiser_name` | Advertiser linkage. |
| `app_name`, `vertical`, `objective`, `primary_theme`, `target_age_segment`, `target_os`, `countries` | Targeting/setup. |
| `start_date`, `end_date`, `daily_budget_usd`, `kpi_goal` | Flight + KPI. |
| `overall_ctr`, `overall_cvr`, `overall_roas` | Campaign-level rates. |

### 6.7 `data_dictionary.csv`

Row-wise mapping of `(file_name, column_name, data_type, description)`. Treat it as the **schema glossary** for tools and LLMs.

---

## 7. Known quirks (do not get surprised)

From `data/README.md` and dataset design:

1. **`fatigue_day` only exists for `creative_status == fatigued`**. Other statuses leave it blank by construction.
2. **Uniform portfolio sizes** make “who is biggest” questions meaningless; compare KPIs and creative features.
3. **Synthetic data**: patterns are realistic for learning, but this is **not** a production benchmark.
4. **Hidden generator variables** are not shipped; do not expect to invert the full generative process from public files alone.

---

## 8. This repository (v1 implementation snapshot)

Layout:

- `data/` — CSVs (and optionally `assets/` for PNGs referenced by `asset_file`).
- `backend/` — FastAPI + pandas: `/api/performance/*`, `/api/fatigue/*`, `/api/recommendations/*`.
- `frontend/` — React + Vite UI: Performance, Fatigue, Recommendations routes.
- `docker-compose.yml` — Run full stack in containers.

**Environment:** backend reads CSVs from `SMADEX_DATA_DIR` (default in code: repo `data/`). Docker Compose mounts `./data` to `/data` and sets `SMADEX_DATA_DIR=/data`.

**Run locally (typical)**

```bash
# Terminal A
cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8000

# Terminal B
cd frontend && npm install && npm run dev
```

**Run with Docker**

```bash
docker compose up --build
# UI: http://localhost:8080  (nginx proxies /api to backend)
# API direct: http://localhost:8000
```

---

## 9. Suggested “next context” sections to append after you iterate

When your team changes the product, append short dated notes here:

- Which KPI definitions you standardized (CTR denominators, CPA smoothing rules).
- Any new derived tables you materialize (daily creative totals, per-country baselines).
- Model cards (inputs, labels, leakage checks) if you add ML.

Keeping this README current is cheaper than re-explaining the domain in every chat.
