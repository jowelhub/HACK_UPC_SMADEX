/** Compact schema description for the SQL agent (Postgres public). */
export const COMPACT_DB_SCHEMA = `
Postgres: public tables for delivery/entity CSVs (advertisers, campaigns, creatives, creative_daily_country_os_stats). data_dictionary.csv is not loaded; use the file in the repo for column glosses.

TABLE advertisers (advertiser_id PK, advertiser_name, vertical, hq_region)

TABLE campaigns (
  campaign_id PK, advertiser_id FK→advertisers, advertiser_name, app_name, vertical, objective, primary_theme,
  target_age_segment, target_os, countries (pipe-separated: US|ES), start_date, end_date,
  daily_budget_usd, kpi_goal (CPA),
  total_spend_usd, total_impressions, total_clicks, total_conversions, total_revenue_usd,
  overall_ctr, overall_cvr, overall_roas
)

TABLE creatives (
  creative_id PK, campaign_id FK→campaigns, advertiser_name, app_name, vertical, format, width, height, language, creative_launch_date,
  theme, hook_type, cta_text, headline, subhead, dominant_color, emotional_tone,
  duration_sec, text_density, copy_length_chars, readability_score, brand_visibility_score, clutter_score, novelty_score, motion_score,
  faces_count, product_count, has_price, has_discount_badge, has_gameplay, has_ugc_style, asset_file,
  creative_status (top_performer|stable|fatigued|underperformer), fatigue_day (int, fatigued only), perf_score (0–1),
  total_days_active, total_spend_usd, total_impressions, total_clicks, total_conversions, total_revenue_usd,
  overall_ctr, overall_cvr, overall_ipm, overall_roas,
  first_7d_ctr, last_7d_ctr, ctr_decay_pct, first_7d_cvr, last_7d_cvr, cvr_decay_pct, peak_rolling_ctr_5,
  peak_day_impressions, first_7d_impressions, first_7d_clicks, first_7d_conversions, last_7d_impressions, last_7d_clicks, last_7d_conversions
)

TABLE creative_daily_country_os_stats (PK: date, creative_id, country, os):
  campaign_id, creative_id, date, country, os, days_since_launch,
  impressions_last_7d, spend_usd, impressions, viewable_impressions, clicks, conversions, revenue_usd, video_completions

KPIs: CTR=clicks/impressions, CVR=conversions/clicks, IPM=1000*conversions/impressions, ROAS=revenue/spend, CPA=spend/conversions.
Read-only: single SELECT or WITH...SELECT, no DML. Join on campaign_id / creative_id.
`.trim()
