"""Creative-level actions: scale / watch / rotate / replace / pause - not bid recsys."""

from __future__ import annotations

from typing import Any

import pandas as pd

from modules.fatigue.service import FatigueService
from shared.store import DataStore

SIM_CAT = ["format", "theme", "hook_type", "dominant_color", "emotional_tone"]


def _similarity(row_a: pd.Series, row_b: pd.Series) -> float:
    cat_hits = sum(1 for c in SIM_CAT if row_a.get(c) == row_b.get(c) and pd.notna(row_a.get(c)))
    cat_score = cat_hits / max(len(SIM_CAT), 1)
    hg = abs(float(row_a.get("has_gameplay", 0) or 0) - float(row_b.get("has_gameplay", 0) or 0))
    ms = abs(float(row_a.get("motion_score", 0) or 0) - float(row_b.get("motion_score", 0) or 0))
    num_score = (1.0 - hg) * 0.5 + (1.0 - min(ms, 1.0)) * 0.5
    return 0.65 * cat_score + 0.35 * num_score


class RecommendationService:
    def __init__(self, store: DataStore, fatigue: FatigueService) -> None:
        self._cs = store.creative_summary.copy()
        self._fatigue = fatigue
        health = fatigue.health_map()
        self._cs["health_score"] = self._cs["creative_id"].map(health)
        self._cs["overall_cpa_usd"] = self._cs.apply(
            lambda r: (r["total_spend_usd"] / r["total_conversions"])
            if r["total_conversions"] and r["total_conversions"] > 0
            else None,
            axis=1,
        )

    def list_recommendations(self, filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        df = self._cs
        if filters and filters.get("campaign_ids"):
            df = df[df["campaign_id"].isin(filters["campaign_ids"])]
        if filters and filters.get("advertiser_name"):
            df = df[df["advertiser_name"].isin(filters["advertiser_name"])]

        results: list[dict[str, Any]] = []
        for camp_id, camp_df in df.groupby("campaign_id"):
            camp_df = camp_df.copy()
            for _, row in camp_df.iterrows():
                rec = self._recommend_one(row, camp_df)
                results.append(rec)

        results.sort(key=lambda x: (-x["urgency"], x.get("health_score") or 0.0))
        return results

    def _recommend_one(self, row: pd.Series, camp_df: pd.DataFrame) -> dict[str, Any]:
        cid = int(row["creative_id"])
        health = float(row["health_score"]) if pd.notna(row["health_score"]) else 0.5
        roas = float(row["overall_roas"]) if pd.notna(row["overall_roas"]) else 0.0
        status = str(row.get("creative_status", ""))
        ctr_first = float(row["first_7d_ctr"]) if pd.notna(row.get("first_7d_ctr")) else None
        ctr_last = float(row["last_7d_ctr"]) if pd.notna(row.get("last_7d_ctr")) else None
        under_from_start = status == "underperformer" or (
            ctr_first is not None and ctr_last is not None and ctr_last < ctr_first * 0.5 and ctr_last < 0.001
        )

        action = "watch"
        reason = "Performance is within a normal band; keep monitoring."
        confidence = 0.55
        urgency = 1
        rotate_to: int | None = None

        if under_from_start:
            action = "pause"
            reason = "Weak from early life - likely not fatigue; reduce spend until new concepts ship."
            confidence = 0.72
            urgency = 4
        elif health > 0.8 and roas >= 1.0:
            action = "scale"
            reason = "Strong health and ROAS >= 1 - candidate to increase budget if inventory allows."
            confidence = 0.68
            urgency = 0
        elif 0.5 < health <= 0.8:
            action = "watch"
            reason = "Early decay vs baseline possible; watch CPA/CTR over the next week."
            confidence = 0.6
            urgency = 2
        elif health <= 0.5:
            others = camp_df[camp_df["creative_id"] != cid]
            healthy = others[others["health_score"].fillna(0) > 0.8]
            best_alt: tuple[float, int | None] = (0.0, None)
            for _, alt in healthy.iterrows():
                sim = _similarity(row, alt)
                perf = float(alt.get("perf_score", 0) or 0)
                score = sim * 0.55 + perf * 0.45
                if score > best_alt[0]:
                    best_alt = (score, int(alt["creative_id"]))
            if best_alt[1] is not None:
                action = "rotate"
                rotate_to = best_alt[1]
                reason = (
                    f"Health low; rotate toward creative {rotate_to} - similar style and stronger health score."
                )
                confidence = min(0.85, 0.5 + best_alt[0])
                urgency = 5
            else:
                action = "replace"
                reason = "No healthy similar creative in this campaign - brief new assets or new angles."
                confidence = 0.7
                urgency = 5

        return {
            "creative_id": cid,
            "campaign_id": int(row["campaign_id"]),
            "advertiser_name": row.get("advertiser_name"),
            "app_name": row.get("app_name"),
            "format": row.get("format"),
            "theme": row.get("theme"),
            "creative_status": status,
            "health_score": health,
            "overall_roas": roas,
            "action": action,
            "reason": reason,
            "confidence": round(confidence, 3),
            "urgency": urgency,
            "rotate_to_creative_id": rotate_to,
        }
