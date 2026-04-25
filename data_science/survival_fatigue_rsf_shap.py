"""
Time-to-fatigue with Random Survival Forest: **two setups** + scores.

1) **static_only** — Asset / copy fields from ``creative_merged.csv`` only (as if
   prior to launch / before any delivery data). No daily aggregates.

2) **static_plus_first_week** — Same static columns plus sums from
   ``creative_daily_country_os_stats.csv`` for ``days_since_launch`` in
   ``0 .. min(6, fatigue_day-1)`` when fatigued (no post-onset leakage), else
   ``0 .. 6`` (full first calendar week).

Outcome: event = fatigued, time = ``fatigue_day`` or last observed day (censored).

Scores (after refit on all rows for export):
- ``risk_score`` — RSF risk (higher ⇒ fatigue tends to occur sooner).
- ``S_day_{t}`` — modelled P(T > t), still no fatigue by day t.
- ``p_fatigue_by_day_{t}`` — ``1 - S(t)``, probability the **fatigue event** has
  occurred by day ``t`` under this survival model (depends on chosen t).

There is no single "best": static-only answers launch-time risk; first-week adds
early delivery. Neither is causal. ``pip install scikit-survival shap matplotlib``
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap
from sklearn.compose import ColumnTransformer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OrdinalEncoder
from sksurv.ensemble import RandomSurvivalForest
from sksurv.metrics import concordance_index_censored
from sksurv.util import Surv

ROOT = Path(__file__).resolve().parent
DAILY_PATH = ROOT / "data" / "creative_daily_country_os_stats.csv"
MERGED_PATH = ROOT / "data" / "creative_merged.csv"
OUT_DIR = ROOT / "outputs" / "survival_fatigue_rsf"

# Report / export horizons (days since launch) for P(fatigue by day t) = 1 - S(t).
SCORE_HORIZONS = [30, 45, 60]

# For SHAP / curve summaries (same as before).
HORIZONS = [7, 14, 21, 30, 45, 60]

# First week = days_since_launch 0..6 inclusive.
FIRST_WEEK_MAX_DSL = 6

MERGED_STATIC_COLS = [
    "vertical",
    "format",
    "width",
    "height",
    "language",
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
]

DAILY_NUMERIC = [
    "impressions",
    "clicks",
    "conversions",
    "spend_usd",
    "revenue_usd",
    "viewable_impressions",
    "video_completions",
]

RANDOM_STATE = 42

Variant = Literal["static_only", "static_plus_first_week"]


def _dsl_cap_first_week(row: pd.Series) -> int:
    """Inclusive max ``days_since_launch`` for first-week features (pre-fatigue)."""
    if row["creative_status"] == "fatigued" and pd.notna(row["fatigue_day"]):
        fd = int(float(row["fatigue_day"]))
        return max(0, min(FIRST_WEEK_MAX_DSL, fd - 1))
    return FIRST_WEEK_MAX_DSL


def build_early_daily_features(
    daily: pd.DataFrame, merged: pd.DataFrame, *, use_first_week: bool
) -> pd.DataFrame | None:
    if not use_first_week:
        return None
    meta = merged[
        ["creative_id", "creative_status", "fatigue_day"]
    ].drop_duplicates("creative_id")
    meta["dsl_cap"] = meta.apply(_dsl_cap_first_week, axis=1)
    d = daily.merge(meta[["creative_id", "dsl_cap"]], on="creative_id", how="left")
    d = d[d["days_since_launch"] <= d["dsl_cap"]]
    g = d.groupby("creative_id", as_index=False)[DAILY_NUMERIC].sum()
    g = g.rename(columns={c: f"early_{c}" for c in DAILY_NUMERIC})
    imps = g["early_impressions"].replace(0, np.nan)
    g["early_ctr"] = (g["early_clicks"] / imps).fillna(0.0)
    g["early_cvr"] = np.where(g["early_clicks"] > 0, g["early_conversions"] / g["early_clicks"], 0.0)
    return g


def build_survival_table(merged: pd.DataFrame, daily: pd.DataFrame) -> pd.DataFrame:
    last_obs = daily.groupby("creative_id")["days_since_launch"].max().rename("last_observed_dsl")
    m = merged[
        ["creative_id", "creative_status", "fatigue_day"]
        + [c for c in MERGED_STATIC_COLS if c in merged.columns]
    ].drop_duplicates("creative_id")
    m = m.merge(last_obs, on="creative_id", how="left")
    is_fat = m["creative_status"] == "fatigued"
    time_fat = m["fatigue_day"].where(is_fat)
    time_fat = pd.to_numeric(time_fat, errors="coerce")
    time_fat = time_fat.fillna(m.loc[is_fat, "last_observed_dsl"])
    duration = np.where(is_fat, time_fat, m["last_observed_dsl"])
    duration = np.asarray(pd.to_numeric(duration, errors="coerce"), dtype=float)
    duration = np.nan_to_num(duration, nan=1.0)
    duration = np.maximum(duration, 1.0)
    m["duration"] = duration
    m["event"] = is_fat.astype(bool)
    return m


def build_feature_matrix(
    surv: pd.DataFrame,
    early: pd.DataFrame | None,
    variant: Variant,
) -> tuple[pd.DataFrame, list[str]]:
    base = surv.copy()
    if early is not None:
        base = base.merge(early, on="creative_id", how="left")
        for c in early.columns:
            if c != "creative_id" and c in base.columns:
                base[c] = base[c].fillna(0.0)

    static = [c for c in MERGED_STATIC_COLS if c in base.columns]
    if variant == "static_only":
        feature_cols = static
    else:
        extra = [c for c in early.columns if c != "creative_id"] if early is not None else []
        feature_cols = static + extra

    X = base[feature_cols].copy()
    return X, feature_cols


def make_pipeline(cat_cols: list[str], num_cols: list[str]) -> Pipeline:
    pre = ColumnTransformer(
        transformers=[
            ("cat", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1), cat_cols),
            ("num", "passthrough", num_cols),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )
    pre.set_output(transform="pandas")
    rsf = RandomSurvivalForest(
        n_estimators=100,
        min_samples_split=10,
        min_samples_leaf=8,
        max_features="sqrt",
        n_jobs=-1,
        random_state=RANDOM_STATE,
    )
    return Pipeline([("prep", pre), ("rsf", rsf)])


def S_at_horizon(sf_row: np.ndarray, grid_times: np.ndarray, t: float) -> float:
    idx = np.searchsorted(grid_times, t, side="right") - 1
    idx = np.clip(idx, 0, len(sf_row) - 1)
    return float(sf_row[idx])


def transform_X(pipe: Pipeline, X: pd.DataFrame) -> pd.DataFrame:
    pre = pipe.named_steps["prep"]
    names = list(pre.get_feature_names_out())
    return pd.DataFrame(pre.transform(X), columns=names)


def fatigue_probability_table(pipe: Pipeline, X: pd.DataFrame, horizons: list[float]) -> pd.DataFrame:
    Xt = transform_X(pipe, X)
    rsf_f = pipe.named_steps["rsf"]
    risk = rsf_f.predict(Xt)
    sf = rsf_f.predict_survival_function(Xt, return_array=True)
    grid = np.asarray(rsf_f.unique_times_)
    if sf.shape[1] != len(grid):
        grid = np.arange(sf.shape[1], dtype=float)
    out = pd.DataFrame({"risk_score": risk})
    for t in horizons:
        t_int = int(t)
        s_vals = np.array([S_at_horizon(sf[i], grid, t) for i in range(len(Xt))])
        out[f"S_day_{t_int}"] = s_vals
        out[f"p_fatigue_by_day_{t_int}"] = 1.0 - s_vals
    return out


def run_variant(
    variant: Variant,
    surv: pd.DataFrame,
    early: pd.DataFrame | None,
    out_sub: Path,
) -> None:
    out_sub.mkdir(parents=True, exist_ok=True)
    X, feature_cols = build_feature_matrix(surv, early, variant)
    cat_cols = [c for c in feature_cols if X[c].dtype == object or str(X[c].dtype) == "string"]
    num_cols = [c for c in feature_cols if c not in cat_cols]
    y_struct = Surv.from_arrays(event=surv["event"].values, time=surv["duration"].values)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y_struct,
        test_size=0.25,
        random_state=RANDOM_STATE,
        stratify=surv["event"].values,
    )

    pipe = make_pipeline(cat_cols, num_cols)
    pipe.fit(X_train, y_train)

    Xt_test = transform_X(pipe, X_test)
    risk_test = pipe.named_steps["rsf"].predict(Xt_test)
    c_idx, nc, nd, tr, tt = concordance_index_censored(
        y_test["event"],
        y_test["time"],
        risk_test,
    )
    print(f"\n=== {variant} ===")
    print(f"Features ({len(feature_cols)}): {feature_cols[:5]}{'...' if len(feature_cols) > 5 else ''}")
    print(f"Concordance index (test): {c_idx:.4f}  (concordant={nc}, discordant={nd})")

    # SHAP (permutation, small)
    feature_names_out = list(pipe.named_steps["prep"].get_feature_names_out())
    n_feat = len(feature_names_out)
    max_evals = min(80, max(30, 2 * n_feat + 5))
    bg_n = min(80, len(X_train))
    shap_n = min(80, len(X_test))
    X_train_t = transform_X(pipe, X_train)
    X_test_t = transform_X(pipe, X_test)
    bg = shap.maskers.Independent(X_train_t.sample(bg_n, random_state=RANDOM_STATE))
    explainer = shap.Explainer(
        lambda z: pipe.named_steps["rsf"].predict(z.astype(float)),
        bg,
        algorithm="permutation",
        max_evals=max_evals,
    )
    X_shap = X_test_t.iloc[:shap_n]
    shap_vals = explainer(X_shap)

    plt.figure(figsize=(10, 6))
    shap.summary_plot(shap_vals, X_shap, show=False, max_display=20)
    plt.title(f"SHAP — {variant} (risk: higher → fatigue sooner)")
    plt.tight_layout()
    plt.savefig(out_sub / "shap_summary_risk.png", dpi=150, bbox_inches="tight")
    plt.close()

    mean_abs = np.abs(shap_vals.values).mean(axis=0)
    fnames = np.array(shap_vals.feature_names)
    order = np.argsort(mean_abs)[::-1][:20]
    plt.figure(figsize=(8, 6))
    plt.barh(fnames[order][::-1], mean_abs[order][::-1], color="steelblue")
    plt.xlabel("Mean |SHAP|")
    plt.title(f"Mean |SHAP| — {variant}")
    plt.tight_layout()
    plt.savefig(out_sub / "shap_mean_abs_bar.png", dpi=150, bbox_inches="tight")
    plt.close()

    rsf_f = pipe.named_steps["rsf"]
    sf = rsf_f.predict_survival_function(X_test_t, return_array=True)
    grid = np.asarray(rsf_f.unique_times_)
    if sf.shape[1] != len(grid):
        grid = np.arange(sf.shape[1], dtype=float)
    rows = []
    for t in HORIZONS:
        vals = [S_at_horizon(sf[i], grid, t) for i in range(len(X_test_t))]
        rows.append({"horizon_days": t, "mean_S_t": float(np.mean(vals)), "median_S_t": float(np.median(vals))})
    pd.DataFrame(rows).to_csv(out_sub / "survival_probabilities_test.csv", index=False)

    plt.figure(figsize=(8, 5))
    plt.step(grid, sf.mean(axis=0), where="post", label="Mean S(t) | test")
    plt.xlabel("Days since launch (t)")
    plt.ylabel("S(t)")
    plt.title(f"Mean survival — {variant}")
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(out_sub / "mean_survival_curve_test.png", dpi=150)
    plt.close()

    # Refit on all data for export scores (read caveats in module docstring).
    pipe_full = make_pipeline(cat_cols, num_cols)
    pipe_full.fit(X, y_struct)
    scores = fatigue_probability_table(pipe_full, X, SCORE_HORIZONS)
    scores.insert(0, "creative_id", surv["creative_id"].values)
    scores["observed_event_fatigued"] = surv["event"].values
    scores["observed_duration_days"] = surv["duration"].values
    scores.insert(1, "model_variant", variant)
    scores.to_csv(out_sub / "fatigue_scores_all_creatives.csv", index=False)
    print(f"Wrote scores: {out_sub / 'fatigue_scores_all_creatives.csv'}")
    print(
        f"  Columns include risk_score and p_fatigue_by_day_* for days {SCORE_HORIZONS} "
        "(interpret as model P(T ≤ t); pick t for a business horizon)."
    )


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    merged = pd.read_csv(MERGED_PATH)
    daily = pd.read_csv(
        DAILY_PATH,
        usecols=["creative_id", "days_since_launch", *DAILY_NUMERIC],
    )
    surv = build_survival_table(merged, daily)
    early_week = build_early_daily_features(daily, merged, use_first_week=True)

    run_variant("static_only", surv, None, OUT_DIR / "static_only")
    run_variant("static_plus_first_week", surv, early_week, OUT_DIR / "static_plus_first_week")

    print(f"\nAll outputs under: {OUT_DIR}")


if __name__ == "__main__":
    main()
