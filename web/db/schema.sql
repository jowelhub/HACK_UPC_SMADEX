-- Smadex synthetic dataset schema (PostgreSQL 16+)
-- Applied by the API container on first boot if tables are missing.
-- Seeded from CSV under IMPORT_DATA_DIR (Docker: /import -> repo data_science/data).
--
-- One public table per seeded CSV under data_science/data/ (same base name as the file). data_dictionary.csv is not stored here.

CREATE TABLE IF NOT EXISTS advertisers (
    advertiser_id INTEGER PRIMARY KEY,
    advertiser_name TEXT NOT NULL,
    vertical TEXT,
    hq_region TEXT
);

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
    kpi_goal TEXT
);

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
    asset_file TEXT
);

-- One row per creative: rolled-up KPIs, decay features, synthetic creative_status / fatigue_day / perf_score.
CREATE TABLE IF NOT EXISTS creative_summary (
    creative_id INTEGER PRIMARY KEY REFERENCES creatives (creative_id),
    campaign_id INTEGER NOT NULL REFERENCES campaigns (campaign_id),
    advertiser_name TEXT,
    app_name TEXT,
    vertical TEXT,
    format TEXT,
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
    peak_day_impressions BIGINT,
    first_7d_impressions BIGINT,
    first_7d_clicks BIGINT,
    first_7d_conversions BIGINT,
    last_7d_impressions BIGINT,
    last_7d_clicks BIGINT,
    last_7d_conversions BIGINT,
    perf_score DOUBLE PRECISION
);

-- One row per campaign: rolled-up KPIs + campaign metadata (matches campaign_summary.csv).
CREATE TABLE IF NOT EXISTS campaign_summary (
    campaign_id INTEGER PRIMARY KEY REFERENCES campaigns (campaign_id),
    total_spend_usd DOUBLE PRECISION NOT NULL,
    total_impressions BIGINT NOT NULL,
    total_clicks BIGINT NOT NULL,
    total_conversions BIGINT NOT NULL,
    total_revenue_usd DOUBLE PRECISION NOT NULL,
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
    overall_ctr DOUBLE PRECISION,
    overall_cvr DOUBLE PRECISION,
    overall_roas DOUBLE PRECISION
);

-- Precomputed campaign ranking within each advertiser (matches advertiser_campaign_rankings.csv).
CREATE TABLE IF NOT EXISTS advertiser_campaign_rankings (
    campaign_id INTEGER PRIMARY KEY REFERENCES campaigns (campaign_id),
    advertiser_name TEXT NOT NULL,
    rank_within_advertiser INTEGER NOT NULL,
    app_name TEXT,
    vertical TEXT,
    objective TEXT,
    primary_theme TEXT,
    kpi_goal TEXT,
    kpi_value DOUBLE PRECISION,
    overall_roas DOUBLE PRECISION,
    ctr_pct DOUBLE PRECISION,
    cvr_pct DOUBLE PRECISION,
    total_spend_usd DOUBLE PRECISION,
    total_revenue_usd DOUBLE PRECISION,
    n_creatives INTEGER NOT NULL,
    n_healthy INTEGER NOT NULL,
    kpi_score DOUBLE PRECISION,
    roas_score DOUBLE PRECISION,
    health_score DOUBLE PRECISION,
    composite_score DOUBLE PRECISION
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

CREATE INDEX IF NOT EXISTS idx_creative_summary_campaign ON creative_summary (campaign_id);
CREATE INDEX IF NOT EXISTS idx_creative_summary_status ON creative_summary (creative_status);
CREATE INDEX IF NOT EXISTS idx_rankings_advertiser_name ON advertiser_campaign_rankings (advertiser_name);

CREATE INDEX IF NOT EXISTS idx_campaign_summary_advertiser ON campaign_summary (advertiser_id);
