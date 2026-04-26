"""
Build fatigue vs non-fatigue (pause) classification from ``creative_daily_country_os_stats``:
- Aggregate to creative-day: drop country, os, viewable_impressions, video_completions; sum additive metrics.
- Do not use raw ``impressions_last_7d`` from the file (not additive across geos); sum daily impressions, etc.
- Join static attributes from ``creative_merged`` (no IDs, no launch/asset/app/advertiser text, no perf_score,
  no status/summary KPIs).
- first_7d: days_since_launch 0..6; last_7d: 7 most recent day-indices; windows may overlap.
- Label y = 1 if creative_status == "fatigued" else 0. Require >= 7 unique days in daily data.

**Note:** ``last_7d`` is built from the **last** 7 day-indices in the panel (as in
``creative_merged``), so for already-fatigued creatives it is typically in the
post-onset / pause regime. That is aligned with a trailing-week readout, not
only a pre-failure view.

Out-of-fold LightGBM, stratified 5-fold, one row per ``creative_id``.
Writes OOF scores + summary metrics to ``outputs/fatigue_daily_oof/`` and
``data/creative_merged_daily.csv`` (``creative_merged`` static + ``total_``/``overall_``/``peak_``,
with **first/last-7d KPIs rebuilt from** ``creative_daily_country_os_stats``).
"""

from __future__ import annotations

from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, log_loss, roc_auc_score
from sklearn.model_selection import StratifiedKFold

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
DAILY_PATH = DATA / "creative_daily_country_os_stats.csv"
MERGED_PATH = DATA / "creative_merged.csv"
MERGED_DAILY_CSV = DATA / "creative_merged_daily.csv"
OUT_DIR = ROOT / "outputs" / "fatigue_daily_oof"
RANDOM_STATE = 42

# Static columns to keep (aligned with creative_kpi_horizon_lightgbm "usable" set + numeric scores)
MERGED_NUMERIC = [
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
MERGED_CATEG = [
    "format",
    "vertical",
    "language",
    "theme",
    "hook_type",
    "dominant_color",
    "emotional_tone",
]


def _kpi_block(prefix: str, s: dict[str, float]) -> dict[str, float]:
    imp = max(s.get("impressions", 0.0), 0.0)
    clk = s.get("clicks", 0.0)
    conv = s.get("conversions", 0.0)
    spend = max(s.get("spend_usd", 0.0), 0.0)
    rev = s.get("revenue_usd", 0.0)
    impn = max(imp, 1e-9)
    convd = max(conv, 0.0)
    spend_use = max(spend, 1e-9)
    out: dict[str, float] = {
        f"{prefix}impressions": imp,
        f"{prefix}clicks": clk,
        f"{prefix}conversions": conv,
        f"{prefix}spend_usd": spend,
        f"{prefix}revenue_usd": rev,
        f"{prefix}ctr": clk / impn,
        f"{prefix}cvr": conv / impn,
        f"{prefix}roas": rev / spend_use,
        f"{prefix}ipm": conv / impn * 1000.0,
    }
    return out


def aggregate_creative_day(raw: pd.DataFrame) -> pd.DataFrame:
    add_cols = [
        "spend_usd",
        "impressions",
        "clicks",
        "conversions",
        "revenue_usd",
    ]
    g = ["creative_id", "campaign_id", "date", "days_since_launch"]
    a = (
        raw.groupby(g, as_index=False)[add_cols]
        .sum()
        .sort_values(["creative_id", "date"])
    )
    return a


def per_creative_windows(day: pd.DataFrame) -> pd.DataFrame:
    """One row per creative: first-7d and last-7d aggregates from creative-day table."""
    rows: list[dict] = []
    for (cid, cid2), g in day.groupby(["creative_id", "campaign_id"], sort=False):
        g = g.sort_values("days_since_launch")
        dsl = g["days_since_launch"].unique()
        n_u = len(dsl)
        if n_u < 7:
            continue
        g0 = g[g["days_since_launch"] <= 6]
        last7_dsl = np.sort(dsl)[-7:]
        g1 = g[g["days_since_launch"].isin(last7_dsl)]
        s0 = {
            "impressions": float(g0["impressions"].sum()),
            "clicks": float(g0["clicks"].sum()),
            "conversions": float(g0["conversions"].sum()),
            "spend_usd": float(g0["spend_usd"].sum()),
            "revenue_usd": float(g0["revenue_usd"].sum()),
        }
        s1 = {
            "impressions": float(g1["impressions"].sum()),
            "clicks": float(g1["clicks"].sum()),
            "conversions": float(g1["conversions"].sum()),
            "spend_usd": float(g1["spend_usd"].sum()),
            "revenue_usd": float(g1["revenue_usd"].sum()),
        }
        m: dict = {
            "creative_id": int(cid),
            "campaign_id": int(cid2),
            "n_observed_distinct_days": int(n_u),
        }
        m.update(_kpi_block("first_7d_", s0))
        m.update(_kpi_block("last_7d_", s1))
        rows.append(m)
    return pd.DataFrame(rows)


def build_creative_merged_daily(
    merged: pd.DataFrame, feat: pd.DataFrame, *, recompute_decay: bool = True
) -> pd.DataFrame:
    """
    One row per creative: full ``creative_merged`` look-alike, but ``first_7d_*`` and
    ``last_7d_*`` (and related decay) come from daily-aggregated stats, plus
    ``n_observed_distinct_days`` in the daily panel. Inner-join: only creatives with
    the daily 7+ day feature row.
    """
    drop_merged_kpi = [c for c in merged.columns if c.startswith("first_7d_") or c.startswith("last_7d_")]
    for d in (
        "ctr_decay_pct",
        "cvr_decay_pct",
    ):
        if d in merged.columns and d not in drop_merged_kpi:
            drop_merged_kpi.append(d)
    m = merged.drop(columns=drop_merged_kpi, errors="ignore")
    out = m.merge(
        feat,
        on=["creative_id", "campaign_id"],
        how="inner",
        validate="1:1",
    )
    if recompute_decay:
        fctr = out["first_7d_ctr"].replace(0, np.nan)
        fcv = out["first_7d_cvr"].replace(0, np.nan)
        out["ctr_decay_pct"] = (out["last_7d_ctr"] - out["first_7d_ctr"]) / fctr
        out["cvr_decay_pct"] = (out["last_7d_cvr"] - out["first_7d_cvr"]) / fcv
    # Keep same column order as ``creative_merged`` for static + Totals, then daily-derived tail
    head = [c for c in merged.columns if c in out.columns]
    tail = [c for c in out.columns if c not in head]
    n_obs = [c for c in tail if c == "n_observed_distinct_days"]
    f7 = sorted(c for c in tail if c.startswith("first_7d_"))
    l7 = sorted(c for c in tail if c.startswith("last_7d_"))
    dec = [c for c in ("ctr_decay_pct", "cvr_decay_pct") if c in tail]
    rest = [c for c in tail if c not in n_obs + f7 + l7 + dec]
    return out[head + n_obs + f7 + l7 + dec + rest]


def load_static(merged: pd.DataFrame) -> pd.DataFrame:
    drop = {
        "advertiser_name",
        "app_name",
        "creative_launch_date",
        "asset_file",
        "creative_status",
        "fatigue_day",
        "perf_score",
    }
    prefixes = ("total_", "overall_", "first_7d_", "last_7d_", "peak_")
    cols = [c for c in merged.columns if c in drop or any(c.startswith(p) for p in prefixes)]
    for extra in [
        "cta_text",
        "headline",
        "subhead",
    ]:  # high-cardinality; drop like kpi_horizon script
        if extra in merged.columns:
            cols.append(extra)
    to_drop = list({c for c in cols if c in merged.columns})
    base = merged.drop(columns=to_drop, errors="ignore")
    # Keep only our feature columns + id keys
    use = [c for c in MERGED_NUMERIC + MERGED_CATEG if c in base.columns]
    return base[["creative_id", "campaign_id"] + use].copy()


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    raw = pd.read_csv(
        DAILY_PATH,
        parse_dates=["date"],
        usecols=lambda c: c
        in {
            "date",
            "campaign_id",
            "creative_id",
            "days_since_launch",
            "impressions",
            "spend_usd",
            "clicks",
            "conversions",
            "revenue_usd",
        },
    )
    day = aggregate_creative_day(raw)
    feat = per_creative_windows(day)
    m = pd.read_csv(MERGED_PATH)
    merged_daily = build_creative_merged_daily(m, feat, recompute_decay=True)
    merged_daily.to_csv(MERGED_DAILY_CSV, index=False)
    print(f"Wrote {MERGED_DAILY_CSV} ({len(merged_daily)} rows, {len(merged_daily.columns)} cols)")

    y_vec = m["creative_status"].eq("fatigued").astype("int8")
    m = m.assign(fatigued_y=y_vec)
    static = load_static(m)
    mkeys = m[["creative_id", "fatigued_y"]].copy()
    df = feat.merge(static, on=["creative_id", "campaign_id"], how="inner").merge(
        mkeys, on="creative_id", how="left"
    )
    df = df[df["fatigued_y"].notna()]

    # Exclude ids and inspection-only columns (``n_observed_distinct_days`` is in the CSV, not the classifier)
    _drop_from_x = {
        "fatigued_y",
        "creative_id",
        "campaign_id",
        "n_observed_distinct_days",
    }
    feature_cols = [c for c in df.columns if c not in _drop_from_x]
    X = df[feature_cols].copy()
    y = df["fatigued_y"].astype(int)

    cat_cols = [c for c in MERGED_CATEG if c in X.columns]
    for c in cat_cols:
        X[c] = X[c].astype("category")
    for c in X.select_dtypes(include=["object"]).columns:
        if c not in cat_cols:
            X[c] = X[c].astype("category")
    for c in X.select_dtypes(include=["float64", "int64"]).columns:
        if c in cat_cols:
            continue
        if X[c].isna().any():
            X[c] = X[c].fillna(0.0)

    oof = np.zeros(len(X))
    skf = StratifiedKFold(
        n_splits=5, shuffle=True, random_state=RANDOM_STATE
    )
    params: dict = {
        "objective": "binary",
        "metric": "binary_logloss",
        "learning_rate": 0.05,
        "num_leaves": 31,
        "min_child_samples": 20,
        "is_unbalance": True,
        "feature_fraction": 0.9,
        "bagging_fraction": 0.9,
        "bagging_freq": 1,
        "verbosity": -1,
    }
    for tr, te in skf.split(X, y):
        dtr = lgb.Dataset(
            X.iloc[tr], label=y.iloc[tr], categorical_feature="auto"
        )
        dte = lgb.Dataset(
            X.iloc[te], label=y.iloc[te], categorical_feature="auto", reference=dtr
        )
        bst = lgb.train(
            params,
            dtr,
            num_boost_round=200,
            valid_sets=[dte],
            valid_names=["te"],
            callbacks=[lgb.early_stopping(30, verbose=False)],
        )
        oof[te] = bst.predict(
            X.iloc[te],
            num_iteration=getattr(bst, "best_iteration", None) or bst.current_iteration(),  # type: ignore[union-attr]
        )

    oof = np.clip(oof, 1e-6, 1.0 - 1e-6)
    ll = log_loss(y, oof)
    try:
        auc = roc_auc_score(y, oof)
    except Exception:
        auc = float("nan")
    ap = average_precision_score(y, oof)
    print(f"N={len(y)}  positives={int(y.sum())}  (fatigued=1)")
    print(f"OOF log_loss={ll:.4f}  OOF ROC AUC={auc:.4f}  OOF AUPRC={ap:.4f}")
    oof_path = OUT_DIR / "oof_predictions.csv"
    odf = pd.DataFrame(
        {
            "creative_id": df["creative_id"],
            "campaign_id": df["campaign_id"],
            "y_fatigued": y,
            "oof_p_fatigue": oof,
        }
    )
    odf.to_csv(oof_path, index=False)
    print(f"Wrote {oof_path}")
    with open(OUT_DIR / "metrics.txt", "w", encoding="utf-8") as f:
        f.write(f"N {len(y)} positives {int(y.sum())}\n")
        f.write(f"log_loss {ll}\nroc_auc {auc}\nauprc {ap}\n")

    # Refit for feature importance (in-sample; use OOF for generalization)
    d_all = lgb.Dataset(X, label=y, categorical_feature="auto", free_raw_data=False)
    final = lgb.train(params, d_all, num_boost_round=150, callbacks=[])
    imp = pd.DataFrame(
        {
            "feature": feature_cols,
            "importance": final.feature_importance(importance_type="gain"),
        }
    ).sort_values("importance", ascending=False)
    imp.to_csv(OUT_DIR / "feature_importance.csv", index=False)
    print(imp.head(20).to_string(index=False))


if __name__ == "__main__":
    main()
