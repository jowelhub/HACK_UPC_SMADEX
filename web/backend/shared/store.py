"""Load reference tables and enriched daily facts from PostgreSQL (required for the web API)."""

from __future__ import annotations

import os
from functools import lru_cache

import pandas as pd


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise ValueError(
            "DATABASE_URL is required for the web API (e.g. postgresql+psycopg2://user:pass@host:5432/dbname). "
            "For exploratory work on CSV files, use the data_science/ tree, not this service."
        )
    return url


def _build_daily_enriched(
    daily: pd.DataFrame,
    campaigns: pd.DataFrame,
    creatives: pd.DataFrame,
    advertisers: pd.DataFrame,
) -> pd.DataFrame:
    camp_cols = [
        "campaign_id",
        "advertiser_id",
        "advertiser_name",
        "app_name",
        "vertical",
        "objective",
        "primary_theme",
        "target_age_segment",
        "target_os",
        "countries",
        "start_date",
        "end_date",
        "daily_budget_usd",
        "kpi_goal",
    ]
    cr_cols = [
        "creative_id",
        "campaign_id",
        "format",
        "width",
        "height",
        "language",
        "creative_launch_date",
        "theme",
        "hook_type",
        "cta_text",
        "headline",
        "subhead",
        "dominant_color",
        "emotional_tone",
        "duration_sec",
        "text_density",
        "copy_length_chars",
        "readability_score",
        "brand_visibility_score",
        "clutter_score",
        "novelty_score",
        "motion_score",
        "faces_count",
        "product_count",
        "has_price",
        "has_discount_badge",
        "has_gameplay",
        "has_ugc_style",
        "asset_file",
    ]

    d = daily.merge(campaigns[[c for c in camp_cols if c in campaigns.columns]], on="campaign_id", how="left")
    d = d.merge(creatives[[c for c in cr_cols if c in creatives.columns]], on=["creative_id", "campaign_id"], how="left")
    adv_small = advertisers[["advertiser_id", "hq_region"]].rename(columns={"hq_region": "advertiser_hq_region"})
    d = d.merge(adv_small, on="advertiser_id", how="left")
    return d


class DataStore:
    def __init__(self, database_url: str | None = None) -> None:
        from sqlalchemy import create_engine

        db_url = database_url if database_url is not None else get_database_url()
        self.engine = create_engine(db_url, pool_pre_ping=True)
        engine = self.engine

        advertisers = pd.read_sql_table("advertisers", con=engine)
        campaigns = pd.read_sql_table("campaigns", con=engine)
        creatives = pd.read_sql_table("creatives", con=engine)
        daily = pd.read_sql_table("creative_daily_country_os_stats", con=engine)

        daily["date"] = pd.to_datetime(daily["date"])
        campaigns["start_date"] = pd.to_datetime(campaigns["start_date"])
        campaigns["end_date"] = pd.to_datetime(campaigns["end_date"])
        if "creative_launch_date" in creatives.columns:
            creatives["creative_launch_date"] = pd.to_datetime(creatives["creative_launch_date"])

        self.advertisers = advertisers
        self.campaigns = campaigns
        self.creatives = creatives
        self.daily_enriched = _build_daily_enriched(daily, campaigns, creatives, advertisers)


@lru_cache(maxsize=1)
def get_store() -> DataStore:
    return DataStore()
