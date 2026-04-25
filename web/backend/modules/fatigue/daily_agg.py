"""Roll up enriched daily rows to one row per creative per calendar date (used by ML training)."""

from __future__ import annotations

import pandas as pd


def aggregate_daily_by_creative_date(df: pd.DataFrame) -> pd.DataFrame:
    return (
        df.groupby(["creative_id", "campaign_id", "date"], as_index=False)
        .agg(
            spend_usd=("spend_usd", "sum"),
            impressions=("impressions", "sum"),
            clicks=("clicks", "sum"),
            conversions=("conversions", "sum"),
            revenue_usd=("revenue_usd", "sum"),
            days_since_launch=("days_since_launch", "max"),
        )
        .sort_values(["creative_id", "date"])
    )
