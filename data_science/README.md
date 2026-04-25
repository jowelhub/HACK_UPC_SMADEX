# Data science workspace (`data_science/`)

This folder holds **everything you need to explore the Smadex hackathon dataset without Docker**: CSVs, optional notebooks, and domain context below. The **web app** lives in `../web/` and reads the same facts from **PostgreSQL** after seeding from these files (see `../web/README.md`).

---

## Smadex in one paragraph

**Smadex** is modeled here as a **DSP (Demand-Side Platform)**: software that helps **advertisers** buy mobile ad impressions against business goals (installs, purchases, signups). This repository does **not** ship raw auction logs. It ships **delivery and outcome statistics** (impressions, clicks, conversions, spend, revenue) at **creative × day × country × OS** granularity, plus **campaign and creative metadata** (formats, copy, themes, synthetic creative assets paths).

---

## Hackathon goal (domain framing)

Strong demos usually answer three questions for a marketer:

1. **Which creatives work right now?** — Slice performance by time, geo, OS, format, vertical.
2. **Which creatives are fatiguing?** — Trends vs baselines, not only a static leaderboard.
3. **What should we try next?** — Recommendations grounded in features and history.

The data is **fully synthetic** but patterned so those questions are meaningful. For **every column name and type**, use `data/data_dictionary.csv` and the long-form narrative in the repo root **[README.md](../README.md)**.

---

## Layout

| Path | Role |
|------|------|
| **`data/`** | Authoritative CSVs (and optional `assets/` for PNGs referenced by `creatives.asset_file`). |
| **`notebooks/`** | Example or team notebooks; point them at `../data` (or an absolute path) for CSV paths. |

---

## CSV files in `data/` (what each file is for)

| File | What it contains | Typical use |
|------|------------------|-------------|
| **`advertisers.csv`** | One row per **advertiser**: id, synthetic name, vertical, HQ region. | Portfolio and vertical segmentation; join root for campaigns. |
| **`campaigns.csv`** | One row per **campaign**: budget, dates, objective, targeting (OS, age band, countries), KPI framing (`kpi_goal`). | Flight-level context; join to creatives and daily stats. |
| **`creatives.csv`** | One row per **creative**: format, size, language, copy, visual features (colors, motion, clutter scores), **`asset_file`** path to a synthetic image. | Creative intelligence features; join to daily facts on `creative_id` / `campaign_id`. |
| **`creative_daily_country_os_stats.csv`** | **Main fact table**: one row per **date × creative × country × OS** with impressions, clicks, conversions, spend, revenue, rollups like impressions in last 7d, days since launch. | Time series, geo/OS breakdowns, fatigue curves, efficiency KPIs (CTR, CVR, CPA, ROAS). |
| **`creative_summary.csv`** | One row per **creative**: lifetime totals, early vs late KPIs, decay features, synthetic **`creative_status`** and **`fatigue_day`** (where applicable). | Quick modeling labels and creative-level dashboards without aggregating daily from scratch. |
| **`campaign_summary.csv`** | One row per **campaign**: lifetime rollups plus campaign metadata. | Campaign-level reporting and portfolio views. |
| **`data_dictionary.csv`** | Machine-readable glossary: `(file_name, column_name, data_type, description)`. | Single source of truth for column meanings in tools and LLM prompts. |

**Optional:** **`assets/`** — If present, holds PNGs referenced by `creatives.csv`. The web stack seeds **tables** that mirror these CSVs; it does not need the PNGs to serve KPI APIs.

---

## Joins (minimum graph)

```
advertisers.advertiser_id
  → campaigns.advertiser_id
      → creatives.campaign_id
          → creative_daily_country_os_stats (creative_id, campaign_id)
creative_summary.creative_id → creatives.creative_id
```

---

## Sizes (order of magnitude)

See **`data/README.md`** for canonical row counts and **known quirks** (uniform portfolio sizes, `fatigue_day` only for fatigued rows, synthetic-only disclaimer).

---

## Related docs

- **Dataset detail and quirks:** [data/README.md](data/README.md)
- **Full column reference and vocabulary:** [../README.md](../README.md)
- **Web stack (Postgres + API + UI):** [../web/README.md](../web/README.md)
