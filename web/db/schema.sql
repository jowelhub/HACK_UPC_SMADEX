-- Smadex synthetic dataset schema (PostgreSQL 16+)
-- Applied by the API container on first boot if tables are missing.
-- Seeded from CSV under IMPORT_DATA_DIR (Docker: /import -> repo data_science/data).
--
-- Entity tables match merged delivery CSVs: campaigns_merged.csv, creative_merged.csv,
-- advertisers.csv, creative_daily_country_os_stats.csv. No separate summary or ranking tables.

CREATE TABLE IF NOT EXISTS advertisers (
    advertiser_id INTEGER PRIMARY KEY,
    advertiser_name TEXT NOT NULL,
    vertical TEXT,
    hq_region TEXT
);

-- One row per campaign: metadata + lifetime KPIs (campaigns_merged.csv).
CREATE TABLE IF NOT EXISTS campaigns (
    campaign_id INTEGER PRIMARY KEY,
    advertiser_id INTEGER NOT NULL REFERENCES advertisers (advertiser_id),
    advertiser_name TEXT,
    app_name TEXT,
    vertical TEXT,
    objective TEXT,
    primary_theme TEXT,
    target_age_segment TEXT,
    target_os TEXT,
    countries TEXT,
    start_date DATE,
    end_date DATE,
    daily_budget_usd DOUBLE PRECISION,
    kpi_goal TEXT,
    total_spend_usd DOUBLE PRECISION NOT NULL,
    total_impressions BIGINT NOT NULL,
    total_clicks BIGINT NOT NULL,
    total_conversions BIGINT NOT NULL,
    total_revenue_usd DOUBLE PRECISION NOT NULL,
    overall_ctr DOUBLE PRECISION,
    overall_cvr DOUBLE PRECISION,
    overall_roas DOUBLE PRECISION
);

-- One row per creative: asset metadata + lifetime KPIs and labels (creative_merged.csv).
CREATE TABLE IF NOT EXISTS creatives (
    creative_id INTEGER PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns (campaign_id),
    advertiser_name TEXT,
    app_name TEXT,
    vertical TEXT,
    format TEXT,
    width INTEGER,
    height INTEGER,
    language TEXT,
    creative_launch_date DATE,
    theme TEXT,
    hook_type TEXT,
    cta_text TEXT,
    headline TEXT,
    subhead TEXT,
    dominant_color TEXT,
    emotional_tone TEXT,
    duration_sec INTEGER,
    text_density DOUBLE PRECISION,
    copy_length_chars INTEGER,
    readability_score DOUBLE PRECISION,
    brand_visibility_score DOUBLE PRECISION,
    clutter_score DOUBLE PRECISION,
    novelty_score DOUBLE PRECISION,
    motion_score DOUBLE PRECISION,
    faces_count INTEGER,
    product_count INTEGER,
    has_price INTEGER,
    has_discount_badge INTEGER,
    has_gameplay INTEGER,
    has_ugc_style INTEGER,
    asset_file TEXT,
    creative_status TEXT NOT NULL,
    fatigue_day INTEGER,
    total_days_active INTEGER NOT NULL,
    total_spend_usd DOUBLE PRECISION NOT NULL,
    total_impressions BIGINT NOT NULL,
    total_clicks BIGINT NOT NULL,
    total_conversions BIGINT NOT NULL,
    total_revenue_usd DOUBLE PRECISION NOT NULL,
    overall_ctr DOUBLE PRECISION,
    overall_cvr DOUBLE PRECISION,
    overall_ipm DOUBLE PRECISION,
    overall_roas DOUBLE PRECISION,
    first_7d_ctr DOUBLE PRECISION,
    last_7d_ctr DOUBLE PRECISION,
    ctr_decay_pct DOUBLE PRECISION,
    first_7d_cvr DOUBLE PRECISION,
    last_7d_cvr DOUBLE PRECISION,
    cvr_decay_pct DOUBLE PRECISION,
    peak_rolling_ctr_5 DOUBLE PRECISION,
    peak_day_impressions BIGINT,
    first_7d_impressions BIGINT,
    first_7d_clicks BIGINT,
    first_7d_conversions BIGINT,
    last_7d_impressions BIGINT,
    last_7d_clicks BIGINT,
    last_7d_conversions BIGINT,
    perf_score DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS creative_daily_country_os_stats (
    "date" DATE NOT NULL,
    campaign_id INTEGER NOT NULL REFERENCES campaigns (campaign_id),
    creative_id INTEGER NOT NULL REFERENCES creatives (creative_id),
    country TEXT NOT NULL,
    os TEXT NOT NULL,
    days_since_launch INTEGER NOT NULL,
    impressions_last_7d BIGINT,
    spend_usd DOUBLE PRECISION,
    impressions BIGINT,
    viewable_impressions BIGINT,
    clicks BIGINT,
    conversions BIGINT,
    revenue_usd DOUBLE PRECISION,
    video_completions BIGINT,
    PRIMARY KEY ("date", creative_id, country, os)
);

CREATE INDEX IF NOT EXISTS idx_daily_creative_date ON creative_daily_country_os_stats (creative_id, "date");
CREATE INDEX IF NOT EXISTS idx_daily_campaign ON creative_daily_country_os_stats (campaign_id);
CREATE INDEX IF NOT EXISTS idx_daily_country_os ON creative_daily_country_os_stats (country, os);

CREATE INDEX IF NOT EXISTS idx_creatives_campaign ON creatives (campaign_id);
CREATE INDEX IF NOT EXISTS idx_creatives_status ON creatives (creative_status);

CREATE INDEX IF NOT EXISTS idx_campaigns_advertiser ON campaigns (advertiser_id);

CREATE TABLE IF NOT EXISTS creative_health_scores (
    creative_id INTEGER PRIMARY KEY REFERENCES creatives (creative_id),
    health_score INTEGER NOT NULL,
    shap_json JSONB
);
