"""Creative-level totals and early/late CTR from daily facts only (no creative_summary table)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from shared.store import DataStore


def build_creative_metrics_from_daily(store: DataStore) -> pd.DataFrame:
    """One row per creative: aggregates + first/last 7 calendar days CTR, merged with `creatives` metadata."""
    d = (
        store.daily_enriched.groupby(["creative_id", "campaign_id", "date"], as_index=False)
        .agg(
            impressions=("impressions", "sum"),
            clicks=("clicks", "sum"),
            conversions=("conversions", "sum"),
            spend_usd=("spend_usd", "sum"),
            revenue_usd=("revenue_usd", "sum"),
        )
        .sort_values(["creative_id", "campaign_id", "date"])
    )

    fl_rows: list[dict[str, float | int]] = []
    for (cid, camp_id), g in d.groupby(["creative_id", "campaign_id"], sort=False):
        g = g.sort_values("date")
        head = g.head(7)
        tail = g.tail(7)
        hi = max(int(head["impressions"].sum()), 1)
        ti = max(int(tail["impressions"].sum()), 1)
        fl_rows.append(
            {
                "creative_id": int(cid),
                "campaign_id": int(camp_id),
                "first_7d_ctr": float(head["clicks"].sum()) / hi,
                "last_7d_ctr": float(tail["clicks"].sum()) / ti,
            }
        )
    fl = pd.DataFrame(fl_rows)

    tot = (
        d.groupby(["creative_id", "campaign_id"], as_index=False)
        .agg(
            total_impressions=("impressions", "sum"),
            total_clicks=("clicks", "sum"),
            total_conversions=("conversions", "sum"),
            total_spend_usd=("spend_usd", "sum"),
            total_revenue_usd=("revenue_usd", "sum"),
        )
    )
    out = tot.merge(fl, on=["creative_id", "campaign_id"], how="left")
    out["overall_ctr"] = out["total_clicks"] / np.maximum(out["total_impressions"], 1)
    out["overall_cvr"] = np.where(
        out["total_clicks"] > 0,
        out["total_conversions"] / out["total_clicks"].astype(float),
        0.0,
    )
    out["overall_roas"] = out["total_revenue_usd"] / np.maximum(out["total_spend_usd"], 1e-9)
    out["perf_score"] = np.clip(out["overall_roas"] / 2.5, 0.0, 1.0)
    mask = out["overall_roas"] <= 0
    out.loc[mask, "perf_score"] = np.clip(out.loc[mask, "overall_ctr"] * 40.0, 0.0, 1.0)

    cr = store.creatives.drop_duplicates(subset=["creative_id"])
    meta_cols = [
        c
        for c in [
            "creative_id",
            "advertiser_name",
            "app_name",
            "vertical",
            "format",
            "theme",
            "hook_type",
            "dominant_color",
            "emotional_tone",
            "has_gameplay",
            "motion_score",
        ]
        if c in cr.columns
    ]
    out = out.merge(cr[meta_cols], on="creative_id", how="left")
    out["creative_status"] = ""
    return out
