"""Load CSVs once and expose enriched daily fact table + reference tables."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import pandas as pd


def get_data_dir() -> Path:
    env = os.environ.get("SMADEX_DATA_DIR")
    if env:
        return Path(env).resolve()
    # backend/shared/store.py -> backend -> repo -> data
    return Path(__file__).resolve().parent.parent.parent / "data"


class DataStore:
    def __init__(self, data_dir: Path | None = None) -> None:
        root = data_dir or get_data_dir()
        if not root.is_dir():
            raise FileNotFoundError(f"Data directory not found: {root}")

        advertisers = pd.read_csv(root / "advertisers.csv")
        campaigns = pd.read_csv(root / "campaigns.csv")
        creatives = pd.read_csv(root / "creatives.csv")
        daily = pd.read_csv(root / "creative_daily_country_os_stats.csv")
        creative_summary = pd.read_csv(root / "creative_summary.csv")

        daily["date"] = pd.to_datetime(daily["date"])
        campaigns["start_date"] = pd.to_datetime(campaigns["start_date"])
        campaigns["end_date"] = pd.to_datetime(campaigns["end_date"])

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
        adv_small = advertisers[["advertiser_id", "hq_region"]].rename(
            columns={"hq_region": "advertiser_hq_region"}
        )
        d = d.merge(adv_small, on="advertiser_id", how="left")

        self.advertisers = advertisers
        self.campaigns = campaigns
        self.creatives = creatives
        self.daily_enriched = d
        self.creative_summary = creative_summary


@lru_cache(maxsize=1)
def get_store() -> DataStore:
    return DataStore()
