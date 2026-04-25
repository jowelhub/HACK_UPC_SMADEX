/** Injected into the getDatabaseSchema tool (Postgres, matches web/db/schema.sql + joins). */
export const COMPACT_DB_SCHEMA = `
Postgres: advertisers → campaigns → creatives → creative_daily_country_os_stats

TABLE advertisers (advertiser_id PK, advertiser_name, vertical, hq_region)

TABLE campaigns (
  campaign_id PK, advertiser_id FK→advertisers, app_name, vertical, objective, primary_theme,
  target_age_segment, target_os, countries (pipe-separated: US|ES), start_date, end_date,
  daily_budget_usd, kpi_goal (CPA)
)

TABLE creatives (
  creative_id PK, campaign_id FK→campaigns, format, width, height, language, creative_launch_date,
  theme, hook_type, cta_text, headline, subhead, dominant_color, emotional_tone,
  duration_sec, text_density, readability_score, brand_visibility_score, clutter_score, novelty_score, motion_score,
  faces_count, product_count, has_price, has_discount_badge, has_gameplay, has_ugc_style, asset_file
)

TABLE creative_daily_country_os_stats (PK: date, creative_id, country, os):
  campaign_id, creative_id, date, country, os, days_since_launch,
  impressions_last_7d, spend_usd, impressions, viewable_impressions, clicks, conversions, revenue_usd, video_completions

KPIs: CTR=clicks/impressions, CVR=conversions/clicks, IPM=1000*conversions/impressions, ROAS=revenue/spend, CPA=spend/conversions.
Read-only: single SELECT or WITH...SELECT, no DML. Join on campaign_id / creative_id.
`.trim();
//# sourceMappingURL=schemaText.js.map