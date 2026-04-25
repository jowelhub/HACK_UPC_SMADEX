"""Performance explorer: aggregate metrics from daily fact rows with arbitrary filters."""

from __future__ import annotations

from typing import Any

import pandas as pd

from shared.store import DataStore

NUMERIC_FILTER_COLUMNS = [
    "days_since_launch",
    "daily_budget_usd",
    "width",
    "height",
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
]


def _campaign_display_label(row: pd.Series) -> str:
    app = str(row.get("app_name") or "").strip()
    obj = str(row.get("objective") or "").strip()
    if app and obj:
        return f"{app} ({obj})"
    if app:
        return app
    return f"Campaign {int(row['campaign_id'])}"


def _creative_display_label(row: pd.Series) -> str:
    headline = row.get("headline")
    if headline is not None and str(headline).strip():
        return str(headline).strip().replace("\n", " ")
    parts = [
        str(x).strip()
        for x in [row.get("app_name"), row.get("theme"), row.get("format")]
        if x is not None and str(x).strip()
    ]
    if parts:
        return " | ".join(parts)
    return f"Creative {int(row['creative_id'])}"


def _composite_creative_label(creative_row: pd.Series, campaigns: pd.DataFrame) -> str:
    """Campaign display name + creative headline (for chips and leaderboard)."""
    creative_part = _creative_display_label(creative_row)
    camp_raw = creative_row.get("campaign_id")
    if camp_raw is None or (isinstance(camp_raw, float) and pd.isna(camp_raw)):
        return creative_part
    camp_id = int(camp_raw)
    cmatch = campaigns[campaigns["campaign_id"] == camp_id]
    if len(cmatch) == 0:
        camp_part = f"Campaign {camp_id}"
    else:
        camp_part = _campaign_display_label(cmatch.iloc[0])
    return f"{camp_part} {creative_part}"


def _labeled_advertisers(advertisers: pd.DataFrame, ids: list[int]) -> list[dict[str, Any]]:
    if not ids:
        return []
    sub = advertisers[advertisers["advertiser_id"].isin(ids)].sort_values("advertiser_id")
    return [{"value": int(r["advertiser_id"]), "label": str(r["advertiser_name"])} for _, r in sub.iterrows()]


def _labeled_campaigns(campaigns: pd.DataFrame, ids: list[int]) -> list[dict[str, Any]]:
    if not ids:
        return []
    sub = campaigns[campaigns["campaign_id"].isin(ids)].sort_values("campaign_id")
    return [{"value": int(r["campaign_id"]), "label": _campaign_display_label(r)} for _, r in sub.iterrows()]


def _labeled_creatives(creatives: pd.DataFrame, campaigns: pd.DataFrame, ids: list[int]) -> list[dict[str, Any]]:
    if not ids:
        return []
    sub = creatives[creatives["creative_id"].isin(ids)].sort_values("creative_id")
    return [{"value": int(r["creative_id"]), "label": _composite_creative_label(r, campaigns)} for _, r in sub.iterrows()]


def _safe_div(num: float, den: float) -> float | None:
    if den == 0 or pd.isna(den):
        return None
    v = num / den
    return float(v) if pd.notna(v) else None


def _apply_filters(df: pd.DataFrame, f: dict[str, Any]) -> pd.DataFrame:
    out = df
    if f.get("date_from"):
        out = out[out["date"] >= pd.Timestamp(f["date_from"])]
    if f.get("date_to"):
        out = out[out["date"] <= pd.Timestamp(f["date_to"])]
    for col, key in [
        ("advertiser_id", "advertiser_ids"),
        ("campaign_id", "campaign_ids"),
        ("creative_id", "creative_ids"),
        ("country", "countries"),
        ("os", "os_list"),
        ("vertical", "verticals"),
        ("objective", "objectives"),
        ("format", "formats"),
        ("theme", "themes"),
        ("hook_type", "hook_types"),
        ("language", "languages"),
        ("primary_theme", "primary_themes"),
        ("target_os", "target_os_list"),
        ("target_age_segment", "target_age_segments"),
        ("advertiser_hq_region", "hq_regions"),
        ("dominant_color", "dominant_colors"),
        ("emotional_tone", "emotional_tones"),
    ]:
        vals = f.get(key)
        if vals:
            out = out[out[col].isin(vals)]
    for col in NUMERIC_FILTER_COLUMNS:
        min_key = f"{col}_min"
        max_key = f"{col}_max"
        if min_key in f and f.get(min_key) is not None:
            out = out[out[col] >= float(f[min_key])]
        if max_key in f and f.get(max_key) is not None:
            out = out[out[col] <= float(f[max_key])]
    return out


def _summary_block(sub: pd.DataFrame) -> dict[str, Any]:
    spend = float(sub["spend_usd"].sum())
    imps = int(sub["impressions"].sum())
    vimps = int(sub["viewable_impressions"].sum())
    clicks = int(sub["clicks"].sum())
    conv = int(sub["conversions"].sum())
    rev = float(sub["revenue_usd"].sum())
    vc = int(sub["video_completions"].sum()) if "video_completions" in sub.columns else 0
    distinct_days = int(sub["date"].dt.normalize().nunique()) if len(sub) else 0
    distinct_creatives = int(sub["creative_id"].nunique()) if len(sub) else 0
    distinct_campaigns = int(sub["campaign_id"].nunique()) if len(sub) else 0

    return {
        "total_spend_usd": round(spend, 4),
        "total_impressions": imps,
        "total_viewable_impressions": vimps,
        "total_clicks": clicks,
        "total_conversions": conv,
        "total_revenue_usd": round(rev, 4),
        "total_video_completions": vc,
        "calendar_days_in_window": distinct_days,
        "distinct_creatives": distinct_creatives,
        "distinct_campaigns": distinct_campaigns,
        "overall_ctr": _safe_div(clicks, imps),
        "overall_cvr": _safe_div(conv, clicks),
        "overall_ipm": _safe_div(1000.0 * conv, imps),
        "overall_roas": _safe_div(rev, spend),
        "overall_cpa_usd": _safe_div(spend, conv),
    }


class PerformanceService:
    FILTER_KEYS = [
        "advertiser_ids",
        "campaign_ids",
        "creative_ids",
        "countries",
        "os_list",
        "verticals",
        "objectives",
        "formats",
        "themes",
        "hook_types",
        "languages",
        "primary_themes",
        "target_os_list",
        "target_age_segments",
        "hq_regions",
        "dominant_colors",
        "emotional_tones",
    ]

    def __init__(self, store: DataStore) -> None:
        self._store = store
        self._df = store.daily_enriched

    def filter_options(self, current_filters: dict[str, Any] | None = None) -> dict[str, list[Any]]:
        """Unique values per dimension from the enriched daily table.

        When ``advertiser_ids`` are present, campaign and creative option lists are narrowed.
        When only ``campaign_ids`` are present (no advertisers), creatives are narrowed to those campaigns.
        """
        current_filters = current_filters or {}
        base = self._df
        opts: dict[str, list[Any]] = {
            "advertiser_id": sorted(int(x) for x in base["advertiser_id"].dropna().unique()),
            "campaign_id": sorted(int(x) for x in base["campaign_id"].dropna().unique()),
            "creative_id": sorted(int(x) for x in base["creative_id"].dropna().unique()),
            "country": sorted(str(x) for x in base["country"].dropna().unique()),
            "os": sorted(str(x) for x in base["os"].dropna().unique()),
            "vertical": sorted(str(x) for x in base["vertical"].dropna().unique()),
            "objective": sorted(str(x) for x in base["objective"].dropna().unique()),
            "format": sorted(str(x) for x in base["format"].dropna().unique()),
            "theme": sorted(str(x) for x in base["theme"].dropna().unique()),
            "hook_type": sorted(str(x) for x in base["hook_type"].dropna().unique()),
            "language": sorted(str(x) for x in base["language"].dropna().unique()),
            "primary_theme": sorted(str(x) for x in base["primary_theme"].dropna().unique()),
            "target_os": sorted(str(x) for x in base["target_os"].dropna().unique()),
            "target_age_segment": sorted(str(x) for x in base["target_age_segment"].dropna().unique()),
            "advertiser_hq_region": sorted(str(x) for x in base["advertiser_hq_region"].dropna().unique()),
            "dominant_color": sorted(str(x) for x in base["dominant_color"].dropna().unique()),
            "emotional_tone": sorted(str(x) for x in base["emotional_tone"].dropna().unique()),
        }
        date_min = base["date"].min()
        date_max = base["date"].max()
        opts["date_range"] = {
            "min": date_min.strftime("%Y-%m-%d") if pd.notna(date_min) else None,
            "max": date_max.strftime("%Y-%m-%d") if pd.notna(date_max) else None,
        }
        opts["numeric_ranges"] = {
            col: {
                "min": float(base[col].min()) if pd.notna(base[col].min()) else None,
                "max": float(base[col].max()) if pd.notna(base[col].max()) else None,
            }
            for col in NUMERIC_FILTER_COLUMNS
            if col in base.columns
        }
        narrow_filters = {**current_filters, "date_from": None, "date_to": None}
        if current_filters.get("advertiser_ids"):
            cf = _apply_filters(base, narrow_filters)
            opts["campaign_id"] = sorted(int(x) for x in cf["campaign_id"].dropna().unique())
            opts["creative_id"] = sorted(int(x) for x in cf["creative_id"].dropna().unique())
        if current_filters.get("campaign_ids"):
            cf2 = _apply_filters(base, narrow_filters)
            opts["creative_id"] = sorted(int(x) for x in cf2["creative_id"].dropna().unique())

        adv_ids = opts.get("advertiser_id") or []
        if isinstance(adv_ids, list) and adv_ids:
            opts["advertiser_labeled"] = _labeled_advertisers(self._store.advertisers, [int(x) for x in adv_ids])
        camp_ids = opts.get("campaign_id") or []
        if isinstance(camp_ids, list) and camp_ids:
            opts["campaign_labeled"] = _labeled_campaigns(self._store.campaigns, [int(x) for x in camp_ids])
        cr_ids = opts.get("creative_id") or []
        if isinstance(cr_ids, list) and cr_ids:
            opts["creative_labeled"] = _labeled_creatives(self._store.creatives, self._store.campaigns, [int(x) for x in cr_ids])

        return opts

    def query(self, body: dict[str, Any]) -> dict[str, Any]:
        filters = body.get("filters") or {}
        sub = _apply_filters(self._df, filters)
        summary = _summary_block(sub)

        ts_grain = body.get("timeseries_grain")  # "day" | None
        breakdown = body.get("breakdown")  # "country" | "os" | "format" | "vertical" | None
        leaderboard = body.get("leaderboard")  # { "by": "creative_id", "metric": "overall_ctr", "limit": 20 }

        result: dict[str, Any] = {"summary": summary, "row_count": int(len(sub))}

        if ts_grain == "day" and len(sub):
            sub_ts = sub.copy()
            sub_ts["_day"] = pd.to_datetime(sub_ts["date"]).dt.normalize()
            g = sub_ts.groupby("_day", as_index=False).agg(
                spend_usd=("spend_usd", "sum"),
                impressions=("impressions", "sum"),
                viewable_impressions=("viewable_impressions", "sum"),
                clicks=("clicks", "sum"),
                conversions=("conversions", "sum"),
                revenue_usd=("revenue_usd", "sum"),
                video_completions=("video_completions", "sum"),
            )
            g["ctr"] = g.apply(lambda r: _safe_div(r["clicks"], r["impressions"]), axis=1)
            g["cvr"] = g.apply(lambda r: _safe_div(r["conversions"], r["clicks"]), axis=1)
            g["viewability_rate"] = g.apply(lambda r: _safe_div(r["viewable_impressions"], r["impressions"]), axis=1)
            g["date"] = g["_day"].dt.strftime("%Y-%m-%d")
            g = g.drop(columns=["_day"])
            result["timeseries"] = g.to_dict(orient="records")

        if breakdown and breakdown in sub.columns and len(sub):
            g2 = sub.groupby(breakdown, as_index=False).agg(
                spend_usd=("spend_usd", "sum"),
                impressions=("impressions", "sum"),
                viewable_impressions=("viewable_impressions", "sum"),
                clicks=("clicks", "sum"),
                conversions=("conversions", "sum"),
                revenue_usd=("revenue_usd", "sum"),
                video_completions=("video_completions", "sum"),
            )
            g2["ctr"] = g2.apply(lambda r: _safe_div(r["clicks"], r["impressions"]), axis=1)
            g2["cpa_usd"] = g2.apply(lambda r: _safe_div(r["spend_usd"], r["conversions"]), axis=1)
            g2["viewability_rate"] = g2.apply(lambda r: _safe_div(r["viewable_impressions"], r["impressions"]), axis=1)
            result["breakdown"] = g2.to_dict(orient="records")

        if leaderboard:
            by = leaderboard.get("by", "creative_id")
            metric = leaderboard.get("metric", "cpa")
            limit = int(leaderboard.get("limit", 15))
            if by not in sub.columns:
                by = "creative_id"
            agg = sub.groupby(by, as_index=False).agg(
                spend_usd=("spend_usd", "sum"),
                impressions=("impressions", "sum"),
                viewable_impressions=("viewable_impressions", "sum"),
                clicks=("clicks", "sum"),
                conversions=("conversions", "sum"),
                revenue_usd=("revenue_usd", "sum"),
                video_completions=("video_completions", "sum"),
            )
            agg["ctr"] = agg.apply(lambda r: _safe_div(r["clicks"], r["impressions"]), axis=1)
            agg["cvr"] = agg.apply(lambda r: _safe_div(r["conversions"], r["clicks"]), axis=1)
            agg["cpa_usd"] = agg.apply(lambda r: _safe_div(r["spend_usd"], r["conversions"]), axis=1)
            agg["roas"] = agg.apply(lambda r: _safe_div(r["revenue_usd"], r["spend_usd"]), axis=1)
            agg["ipm"] = agg.apply(lambda r: _safe_div(1000.0 * r["conversions"], r["impressions"]), axis=1)

            ascending = metric in ("cpa", "cpa_usd", "overall_cpa")
            sort_col = "cpa_usd" if metric in ("cpa", "cpa_usd", "overall_cpa") else metric
            if sort_col not in agg.columns:
                sort_col = "ctr"
            agg = agg.sort_values(sort_col, ascending=ascending, na_position="last")
            out_lb = agg.head(limit)
            if by == "creative_id" and len(out_lb):
                cr = self._store.creatives.set_index("creative_id")
                labels: list[str] = []
                for _, r in out_lb.iterrows():
                    cid = int(r["creative_id"])
                    if cid in cr.index:
                        row = cr.loc[cid]
                        crow = row if isinstance(row, pd.Series) else row.iloc[0]
                        labels.append(_composite_creative_label(crow, self._store.campaigns))
                    else:
                        labels.append(str(cid))
                out_lb = out_lb.copy()
                out_lb["creative_label"] = labels
            result["leaderboard"] = out_lb.to_dict(orient="records")

        return result
