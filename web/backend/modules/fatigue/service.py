"""Fatigue: per-creative daily aggregation, rolling CPA vs baseline (days 7–21), degradation curve."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from shared.store import DataStore

EPS = 0.5
RATE_EPS = 1e-9
DEG_THRESHOLD = 1.4
CONSEC_DAYS = 3


def _aggregate_daily(df: pd.DataFrame) -> pd.DataFrame:
    g = (
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
    return g


def _compute_creative_curve(daily_c: pd.DataFrame) -> pd.DataFrame:
    daily_c = daily_c.sort_values("date").reset_index(drop=True)
    daily_c["rolling_spend_7"] = daily_c["spend_usd"].rolling(7, min_periods=4).sum()
    daily_c["rolling_conv_7"] = daily_c["conversions"].rolling(7, min_periods=4).sum()
    daily_c["rolling_clicks_7"] = daily_c["clicks"].rolling(7, min_periods=4).sum()
    daily_c["rolling_imps_7"] = daily_c["impressions"].rolling(7, min_periods=4).sum()
    daily_c["rolling_cpa"] = daily_c["rolling_spend_7"] / np.maximum(daily_c["rolling_conv_7"], EPS)
    daily_c["rolling_ctr"] = daily_c["rolling_clicks_7"] / np.maximum(daily_c["rolling_imps_7"], 1.0)
    daily_c["rolling_cvr"] = daily_c["rolling_conv_7"] / np.maximum(daily_c["rolling_clicks_7"], EPS)

    mask_base = (daily_c["days_since_launch"] >= 7) & (daily_c["days_since_launch"] <= 21)
    baseline_cpa_rows = daily_c.loc[mask_base, "rolling_cpa"]
    baseline_ctr_rows = daily_c.loc[mask_base, "rolling_ctr"]
    baseline_cvr_rows = daily_c.loc[mask_base, "rolling_cvr"]
    baseline_cpa = float(baseline_cpa_rows.median()) if len(baseline_cpa_rows) else float("nan")
    baseline_ctr = float(baseline_ctr_rows.median()) if len(baseline_ctr_rows) else float("nan")
    baseline_cvr = float(baseline_cvr_rows.median()) if len(baseline_cvr_rows) else float("nan")
    if not np.isfinite(baseline_cpa) or baseline_cpa <= 0:
        baseline_cpa = float(daily_c["rolling_cpa"].median()) or 1.0
    if not np.isfinite(baseline_ctr) or baseline_ctr <= 0:
        baseline_ctr = float(daily_c["rolling_ctr"].median()) or RATE_EPS
    if not np.isfinite(baseline_cvr) or baseline_cvr <= 0:
        baseline_cvr = float(daily_c["rolling_cvr"].median()) or RATE_EPS

    daily_c["baseline_cpa"] = baseline_cpa
    daily_c["baseline_ctr"] = baseline_ctr
    daily_c["baseline_cvr"] = baseline_cvr
    daily_c["degradation_cpa"] = daily_c["rolling_cpa"] / baseline_cpa
    daily_c["degradation_ctr"] = baseline_ctr / np.maximum(daily_c["rolling_ctr"], RATE_EPS)
    daily_c["degradation_cvr"] = baseline_cvr / np.maximum(daily_c["rolling_cvr"], RATE_EPS)
    daily_c["degradation"] = (
        daily_c[["degradation_cpa", "degradation_ctr", "degradation_cvr"]]
        .max(axis=1)
        .clip(lower=0, upper=3.0)
    )
    daily_c["health"] = (1.0 - np.clip(daily_c["degradation"] - 1.0, 0.0, 1.0)).astype(float)

    fatiguing = (daily_c["degradation"] > DEG_THRESHOLD).astype(int)
    streak = fatiguing.groupby((fatiguing != fatiguing.shift()).cumsum()).cumsum()
    daily_c["fatigue_streak"] = streak * fatiguing
    daily_c["is_fatiguing_day"] = daily_c["fatigue_streak"] >= CONSEC_DAYS

    return daily_c


class FatigueService:
    """Signals from `creative_daily` facts only (aggregated + rolling). No `creative_summary` join."""

    def __init__(self, store: DataStore) -> None:
        self._daily = store.daily_enriched[
            ["date", "campaign_id", "creative_id", "spend_usd", "impressions", "clicks", "conversions", "revenue_usd", "days_since_launch"]
        ].copy()
        self._curves: dict[int, pd.DataFrame] = {}
        self._latest: pd.DataFrame | None = None
        self._rebuild()

    def _rebuild(self) -> None:
        agg = _aggregate_daily(self._daily)
        latest_rows = []
        curves: dict[int, pd.DataFrame] = {}
        for cid, chunk in agg.groupby("creative_id"):
            curve = _compute_creative_curve(chunk)
            curves[int(cid)] = curve
            last = curve.iloc[-1]
            latest_rows.append(
                {
                    "creative_id": int(cid),
                    "campaign_id": int(last["campaign_id"]),
                    "baseline_cpa_usd": float(last["baseline_cpa"]),
                    "current_rolling_cpa_usd": float(last["rolling_cpa"]) if pd.notna(last["rolling_cpa"]) else None,
                    "degradation": float(last["degradation"]) if pd.notna(last["degradation"]) else None,
                    "degradation_cpa": float(last["degradation_cpa"]) if pd.notna(last["degradation_cpa"]) else None,
                    "degradation_ctr": float(last["degradation_ctr"]) if pd.notna(last["degradation_ctr"]) else None,
                    "degradation_cvr": float(last["degradation_cvr"]) if pd.notna(last["degradation_cvr"]) else None,
                    "health_score": float(last["health"]) if pd.notna(last["health"]) else None,
                    "is_fatiguing_now": bool(last["is_fatiguing_day"]),
                    "last_date": last["date"].strftime("%Y-%m-%d") if hasattr(last["date"], "strftime") else str(last["date"]),
                    "max_days_since_launch": int(curve["days_since_launch"].max()),
                }
            )
        self._latest = pd.DataFrame(latest_rows)
        self._curves = curves

    def summary(self, filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        assert self._latest is not None
        out = self._latest
        if filters:
            if filters.get("campaign_ids"):
                out = out[out["campaign_id"].isin(filters["campaign_ids"])]
            if filters.get("creative_ids"):
                out = out[out["creative_id"].isin(filters["creative_ids"])]
            if filters.get("health_max") is not None:
                out = out[out["health_score"] <= float(filters["health_max"])]
        return out.sort_values("health_score", ascending=True).to_dict(orient="records")

    def list_creative_ids(self) -> list[int]:
        """Distinct creatives present in daily facts (same grain as curves / ML)."""
        return sorted(int(x) for x in self._daily["creative_id"].unique())

    def curve(self, creative_id: int) -> list[dict[str, Any]]:
        if creative_id not in self._curves:
            return []
        c = self._curves[creative_id]
        return [
            {
                "date": r["date"].strftime("%Y-%m-%d") if hasattr(r["date"], "strftime") else str(r["date"]),
                "days_since_launch": int(r["days_since_launch"]),
                "rolling_cpa_usd": float(r["rolling_cpa"]) if pd.notna(r["rolling_cpa"]) else None,
                "baseline_cpa_usd": float(r["baseline_cpa"]),
                "degradation": float(r["degradation"]) if pd.notna(r["degradation"]) else None,
                "degradation_cpa": float(r["degradation_cpa"]) if pd.notna(r["degradation_cpa"]) else None,
                "degradation_ctr": float(r["degradation_ctr"]) if pd.notna(r["degradation_ctr"]) else None,
                "degradation_cvr": float(r["degradation_cvr"]) if pd.notna(r["degradation_cvr"]) else None,
                "health": float(r["health"]) if pd.notna(r["health"]) else None,
                "rolling_ctr": float(r["rolling_ctr"]) if pd.notna(r["rolling_ctr"]) else None,
            }
            for _, r in c.iterrows()
        ]

    def health_map(self) -> dict[int, float]:
        assert self._latest is not None
        return {int(r.creative_id): float(r.health_score) for r in self._latest.itertuples() if pd.notna(r.health_score)}
