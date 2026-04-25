"""
Per-kpi_goal LightGBM models: predict goal metric at T+h (h in {1,3,5,7}) from rolling
history + static creative features + horizon. Health score and a small rule engine on top.

Data:
  - data/creative_daily_country_os_stats.csv  (time series; aggregated to creative-day)
  - data/creative_merged.csv                  (static creative fields; excludes summary KPI cols)
  - data/campaigns_merged.csv                 (kpi_goal per campaign)

Plots + metrics are written to outputs/kpi_horizon_lightgbm/.
"""

from __future__ import annotations

from pathlib import Path

import lightgbm as lgb
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupShuffleSplit

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
OUT_DIR = ROOT / "outputs" / "kpi_horizon_lightgbm"

DAILY_PATH = DATA / "creative_daily_country_os_stats.csv"
CREATIVE_STATIC_PATH = DATA / "creative_merged.csv"
CAMPAIGNS_PATH = DATA / "campaigns_merged.csv"

HORIZONS = (1, 3, 5, 7)

KPI_TO_METRIC_COL = {
    "CTR": "ctr",
    "CPA": "cpa",
    "ROAS": "roas",
    "IPM": "ipm",
}

# Static / categorical features merged from creative_merged (no lifetime labels)
STATIC_NUMERIC = [
    "motion_score",
    "text_density",
    "duration_sec",
    "width",
    "height",
    "has_gameplay",
    "has_ugc_style",
    "has_price",
    "has_discount_badge",
    "faces_count",
    "product_count",
]
STATIC_CATEGORICAL = [
    "format",
    "vertical",
    "hook_type",
    "theme",
    "emotional_tone",
    "dominant_color",
    "language",
]


def _rolling_slope(series: pd.Series, window: int, min_periods: int = 3) -> pd.Series:
    def slope_fn(arr: np.ndarray) -> float:
        arr = arr[~np.isnan(arr)]
        if len(arr) < min_periods:
            return np.nan
        x = np.arange(len(arr), dtype=float)
        return float(np.polyfit(x, arr, 1)[0])

    return series.rolling(window, min_periods=min_periods).apply(slope_fn, raw=True)


def load_campaign_kpi() -> pd.DataFrame:
    # Only kpi_goal from campaign — vertical/format etc. come from creative static rows.
    return pd.read_csv(CAMPAIGNS_PATH, usecols=["campaign_id", "kpi_goal"])


def load_creative_static() -> pd.DataFrame:
    """Drop merged summary / label columns; keep attributes usable as features."""
    df = pd.read_csv(CREATIVE_STATIC_PATH)
    drop_prefixes = ("total_", "overall_", "first_7d_", "last_7d_", "peak_")
    drop_exact = {
        "creative_status",
        "fatigue_day",
        "perf_score",
        "ctr_decay_pct",
        "cvr_decay_pct",
        "advertiser_name",
        "app_name",
        "cta_text",
        "headline",
        "subhead",
        "asset_file",
        "creative_launch_date",
    }
    to_drop = [col for col in df.columns if col in drop_exact]
    to_drop += [col for col in df.columns if any(col.startswith(p) for p in drop_prefixes)]
    df = df.drop(columns=[c for c in to_drop if c in df.columns], errors="ignore")
    keep = ["creative_id", "campaign_id"] + [c for c in STATIC_NUMERIC + STATIC_CATEGORICAL if c in df.columns]
    return df[keep].copy()


def aggregate_creative_daily() -> pd.DataFrame:
    raw = pd.read_csv(DAILY_PATH, parse_dates=["date"])
    num_cols = [
        "impressions_last_7d",
        "spend_usd",
        "impressions",
        "viewable_impressions",
        "clicks",
        "conversions",
        "revenue_usd",
        "video_completions",
    ]
    gcols = ["creative_id", "campaign_id", "date", "days_since_launch"]
    agg = raw.groupby(gcols, as_index=False)[num_cols].sum()
    agg = agg.sort_values(["creative_id", "date"])
    # Derived rates at creative-day level
    imp = agg["impressions"].replace(0, np.nan)
    conv = agg["conversions"].replace(0, np.nan)
    spend = agg["spend_usd"].replace(0, np.nan)
    agg["ctr"] = agg["clicks"] / imp
    agg["cpa"] = agg["spend_usd"] / conv
    agg["roas"] = agg["revenue_usd"] / spend
    agg["ipm"] = agg["conversions"] / imp * 1000.0
    return agg


def add_goal_metric_column(df: pd.DataFrame, kpi_col: str = "kpi_goal") -> pd.DataFrame:
    out = df.copy()
    for kpi, mcol in KPI_TO_METRIC_COL.items():
        mask = out[kpi_col] == kpi
        out.loc[mask, "goal_metric"] = out.loc[mask, mcol]
    return out


def build_panel_with_features(daily: pd.DataFrame, campaigns: pd.DataFrame, static: pd.DataFrame) -> pd.DataFrame:
    d = daily.merge(campaigns, on="campaign_id", how="left")
    d = d.merge(static, on=["creative_id", "campaign_id"], how="left")
    d = add_goal_metric_column(d)
    d = d.sort_values(["creative_id", "date"])

    parts: list[pd.DataFrame] = []
    for cid, grp in d.groupby("creative_id", sort=False):
        g = grp.copy()
        g["goal_metric_peak"] = g["goal_metric"].cummax()
        g["metric_vs_peak"] = g["goal_metric"] / g["goal_metric_peak"].replace(0, np.nan)

        g["metric_mean_7d"] = g["goal_metric"].rolling(7, min_periods=4).mean()
        g["metric_mean_3d"] = g["goal_metric"].rolling(3, min_periods=2).mean()
        g["metric_slope_7d"] = _rolling_slope(g["goal_metric"], 7)
        g["metric_slope_3d"] = _rolling_slope(g["goal_metric"], 3)

        g["ctr_slope_7d"] = _rolling_slope(g["ctr"], 7)
        g["impressions_7d"] = g["impressions"].rolling(7, min_periods=4).sum()
        g["spend_7d"] = g["spend_usd"].rolling(7, min_periods=4).sum()

        g["metric_last"] = g["goal_metric"]
        g["days_since_launch"] = g["days_since_launch"].astype(float)

        idx = g.reset_index(drop=True)
        n = len(idx)
        goal = idx["kpi_goal"].iloc[0]
        if goal not in KPI_TO_METRIC_COL:
            continue
        mseries = idx["goal_metric"].values
        for h in HORIZONS:
            y = pd.Series([np.nan] * n)
            for i in range(n - h):
                y.iloc[i] = mseries[i + h]
            block = idx.iloc[: n - h].copy()
            block["horizon"] = float(h)
            block["y_future_metric"] = y.iloc[: n - h].values
            parts.append(block)

    out = pd.concat(parts, ignore_index=True)
    # Require enough history for rolling features
    feat_ok = out["metric_mean_7d"].notna() & out["metric_slope_7d"].notna()
    out = out.loc[feat_ok].copy()
    out = out.replace([np.inf, -np.inf], np.nan).dropna(subset=["y_future_metric", "goal_metric"])
    return out


def health_score(kpi_goal: str, metric_now: float, pred_t_plus_7: float) -> float:
    """Continuous health; CPA direction inverted."""
    if not np.isfinite(metric_now) or not np.isfinite(pred_t_plus_7) or metric_now == 0:
        return np.nan
    if kpi_goal == "CPA":
        return float(metric_now / pred_t_plus_7)
    return float(pred_t_plus_7 / metric_now)


def check_target(metric: float, kpi_goal: str, target: float | None) -> bool:
    if target is None or not np.isfinite(metric):
        return True
    if kpi_goal == "CPA":
        return float(metric) <= float(target)
    return float(metric) >= float(target)


def recommend(
    creative_id: int,
    health: float,
    predicted_trajectory: dict[int, float],
    campaign_creatives: list[dict],
    kpi_goal: str,
    kpi_target: float | None,
    current_metric: float,
) -> tuple[str, str]:
    """
    Rule engine: SCALE / WATCH / ROTATE / PIVOT / PAUSE + reason.
    campaign_creatives: list of {id, health_score, current_metric} for creatives in same campaign.
    """
    meets = check_target(current_metric, kpi_goal, kpi_target)
    others = [c for c in campaign_creatives if c["id"] != creative_id]
    has_healthy_alt = any((c.get("health_score") or 0) > 0.7 for c in others)

    traj = [predicted_trajectory.get(h) for h in sorted(predicted_trajectory) if np.isfinite(predicted_trajectory.get(h, np.nan))]
    under_from_start = (
        len(traj) >= 2
        and all(np.isfinite(t) for t in traj)
        and kpi_goal != "CPA"
        and traj[-1] < 0.5 * traj[0]
        and current_metric < (kpi_target * 0.5 if kpi_target else np.nanmedian(traj))
    )
    if kpi_goal == "CPA" and len(traj) >= 2 and kpi_target:
        under_from_start = traj[-1] > 1.5 * traj[0] and current_metric > 1.5 * kpi_target

    if under_from_start and (health is not None and health < 0.4):
        return "PAUSE", "Weak trajectory from early days vs target — likely not fatigue alone."

    if health is not None and health > 0.8 and meets:
        return "SCALE", "Top performer with stable predicted trajectory vs current metric."

    if health is not None and 0.5 < health <= 0.8:
        return "WATCH", "Mild decay vs peak prediction; monitor over the next few days."

    if health is not None and health <= 0.5 and has_healthy_alt:
        best = max(others, key=lambda c: c.get("health_score") or 0)
        return "ROTATE", f"Shift spend toward healthier creative {best['id']} (health≈{best.get('health_score', 0):.2f})."

    if health is not None and health <= 0.5 and not has_healthy_alt:
        return "PIVOT", "Campaign-wide softness — test new hooks/themes in this vertical."

    return "WATCH", "Default watch — insufficient edge-case signal."


def _prepare_matrix(df: pd.DataFrame, cat_cols: list[str]):
    X = df.copy()
    for c in cat_cols:
        if c in X.columns:
            X[c] = X[c].astype("category")
    return X


def train_per_goal(panel: pd.DataFrame) -> dict[str, dict]:
    feature_cols = (
        [
            "metric_last",
            "metric_mean_7d",
            "metric_mean_3d",
            "metric_slope_7d",
            "metric_slope_3d",
            "metric_vs_peak",
            "ctr_slope_7d",
            "impressions_7d",
            "spend_7d",
            "days_since_launch",
            "horizon",
        ]
        + [c for c in STATIC_NUMERIC if c in panel.columns]
        + [c for c in STATIC_CATEGORICAL if c in panel.columns]
    )
    cat_cols = [c for c in STATIC_CATEGORICAL if c in panel.columns]
    results: dict[str, dict] = {}

    for goal in KPI_TO_METRIC_COL:
        sub = panel.loc[panel["kpi_goal"] == goal].copy()
        if len(sub) < 500:
            continue
        X = _prepare_matrix(sub[feature_cols], cat_cols)
        y = sub["y_future_metric"].astype(float).values
        groups = sub["creative_id"].values

        gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
        train_idx, test_idx = next(gss.split(X, y, groups))
        X_tr, X_te = X.iloc[train_idx], X.iloc[test_idx]
        y_tr, y_te = y[train_idx], y[test_idx]

        train_set = lgb.Dataset(X_tr, label=y_tr, categorical_feature=cat_cols, free_raw_data=False)
        valid_set = lgb.Dataset(X_te, label=y_te, reference=train_set, categorical_feature=cat_cols, free_raw_data=False)

        params = {
            "objective": "regression",
            "metric": "mae",
            "verbosity": -1,
            "learning_rate": 0.05,
            "num_leaves": 63,
            "min_data_in_leaf": 80,
            "feature_fraction": 0.85,
            "bagging_fraction": 0.8,
            "bagging_freq": 1,
            "seed": 42,
        }
        model = lgb.train(
            params,
            train_set,
            num_boost_round=400,
            valid_sets=[valid_set],
            callbacks=[lgb.early_stopping(40, verbose=False)],
        )
        pred = model.predict(X_te, num_iteration=model.best_iteration)
        mae = mean_absolute_error(y_te, pred)
        r2 = r2_score(y_te, pred) if len(np.unique(y_te)) > 1 else float("nan")
        results[goal] = {
            "model": model,
            "mae": mae,
            "r2": r2,
            "feature_cols": feature_cols,
            "cat_cols": cat_cols,
            "test_idx": sub.iloc[test_idx].index,
            "X_test": X_te,
            "y_test": y_te,
            "y_pred": pred,
        }
    return results


def plot_goal_distribution(campaigns: pd.DataFrame, out_dir: Path) -> None:
    """Campaign-level vs creative-level (via campaign join) counts."""
    order = ["ROAS", "CPA", "IPM", "CTR"]
    cr = pd.read_csv(CREATIVE_STATIC_PATH, usecols=["creative_id", "campaign_id"])
    creative_goal = cr.merge(campaigns, on="campaign_id", how="left")
    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    campaigns["kpi_goal"].value_counts().reindex(order).plot(kind="bar", ax=axes[0], color="steelblue")
    axes[0].set_title("Campaigns by kpi_goal (n=180)")
    axes[0].set_ylabel("Count")
    creative_goal["kpi_goal"].value_counts().reindex(order).plot(kind="bar", ax=axes[1], color="coral")
    axes[1].set_title("Creatives by kpi_goal (inherit campaign)")
    axes[1].set_ylabel("Count")
    fig.suptitle("kpi_goal is not all CPA — optimize the right metric per row")
    fig.tight_layout()
    fig.savefig(out_dir / "plot_kpi_goal_counts.png", dpi=150)
    plt.close(fig)


def plot_model_mae(results: dict[str, dict], out_dir: Path) -> None:
    goals = list(results.keys())
    maes = [results[g]["mae"] for g in goals]
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.bar(goals, maes, color="darkseagreen")
    ax.set_ylabel("MAE (holdout)")
    ax.set_title("LightGBM per kpi_goal — out-of-sample MAE")
    fig.tight_layout()
    fig.savefig(out_dir / "plot_mae_by_goal.png", dpi=150)
    plt.close(fig)


def plot_pred_vs_actual(results: dict[str, dict], out_dir: Path) -> None:
    fig, axes = plt.subplots(2, 2, figsize=(9, 8))
    axes = axes.ravel()
    for ax, (goal, res) in zip(axes, results.items()):
        y = res["y_test"]
        p = res["y_pred"]
        lim = np.nanpercentile(np.hstack([y, p]), [2, 98])
        m = (y >= lim[0]) & (y <= lim[1]) & (p >= lim[0]) & (p <= lim[1])
        ax.scatter(y[m], p[m], s=4, alpha=0.35)
        ax.plot(lim, lim, "r--", lw=1)
        ax.set_title(f"{goal} (test slice)")
        ax.set_xlabel("Actual")
        ax.set_ylabel("Predicted")
    fig.suptitle("Predicted vs actual future goal metric (clipped 2–98%)")
    fig.tight_layout()
    fig.savefig(out_dir / "plot_pred_vs_actual.png", dpi=150)
    plt.close(fig)


def plot_importance(results: dict[str, dict], out_dir: Path) -> None:
    for goal, res in results.items():
        model = res["model"]
        imp = pd.Series(model.feature_importance(importance_type="gain"), index=res["feature_cols"])
        imp = imp.sort_values(ascending=True).tail(18)
        fig, ax = plt.subplots(figsize=(7, 5))
        imp.plot(kind="barh", ax=ax, color="slategray")
        ax.set_title(f"Feature gain — {goal}")
        fig.tight_layout()
        fig.savefig(out_dir / f"plot_importance_{goal}.png", dpi=150)
        plt.close(fig)


def plot_health_distribution(panel: pd.DataFrame, results: dict[str, dict], out_dir: Path) -> None:
    """Health at horizon 7 using each goal's trained model on a sample of rows."""
    rows = []
    sample = panel.loc[panel["horizon"] == 7].sample(min(8000, len(panel.loc[panel["horizon"] == 7])), random_state=0)
    for goal, res in results.items():
        model = res["model"]
        sub = sample.loc[sample["kpi_goal"] == goal]
        if sub.empty:
            continue
        X = _prepare_matrix(sub[res["feature_cols"]], res["cat_cols"])
        pred = model.predict(X, num_iteration=model.best_iteration)
        now = sub["metric_last"].values
        for i in range(len(sub)):
            rows.append(
                {
                    "kpi_goal": goal,
                    "health": health_score(goal, float(now[i]), float(pred[i])),
                }
            )
    if not rows:
        return
    hdf = pd.DataFrame(rows)
    fig, ax = plt.subplots(figsize=(7, 4))
    for g, grp in hdf.groupby("kpi_goal"):
        ax.hist(grp["health"].dropna(), bins=40, alpha=0.45, label=g, density=True)
    ax.set_xlabel("Health score (pred@+7 vs current; CPA inverted)")
    ax.set_ylabel("Density")
    ax.legend()
    ax.set_title("Health score distribution (sampled creative-days, h=7)")
    fig.tight_layout()
    fig.savefig(out_dir / "plot_health_histogram.png", dpi=150)
    plt.close(fig)


def try_shap_summary(results: dict[str, dict], out_dir: Path) -> None:
    try:
        import shap
    except ImportError:
        return
    for goal, res in results.items():
        model = res["model"]
        X_te = res["X_test"]
        if len(X_te) > 3000:
            X_te = X_te.sample(3000, random_state=1)
        explainer = shap.TreeExplainer(model)
        sv = explainer.shap_values(X_te)
        fig = plt.figure()
        shap.summary_plot(sv, X_te, show=False, max_display=14)
        fig.tight_layout()
        fig.savefig(out_dir / f"plot_shap_summary_{goal}.png", dpi=150, bbox_inches="tight")
        plt.close(fig)


def write_metrics_csv(results: dict[str, dict], out_dir: Path) -> None:
    rows = [{"kpi_goal": g, "mae_holdout": res["mae"], "r2_holdout": res["r2"]} for g, res in results.items()]
    pd.DataFrame(rows).to_csv(out_dir / "metrics_by_goal.csv", index=False)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    campaigns = load_campaign_kpi()
    static = load_creative_static()
    daily = aggregate_creative_daily()

    plot_goal_distribution(campaigns, OUT_DIR)

    panel = build_panel_with_features(daily, campaigns, static)
    panel.sample(min(25_000, len(panel)), random_state=42).to_csv(
        OUT_DIR / "training_panel_sample.csv", index=False
    )

    results = train_per_goal(panel)
    write_metrics_csv(results, OUT_DIR)

    plot_model_mae(results, OUT_DIR)
    plot_pred_vs_actual(results, OUT_DIR)
    plot_importance(results, OUT_DIR)
    plot_health_distribution(panel, results, OUT_DIR)
    try_shap_summary(results, OUT_DIR)

    # Example rule-engine call on one campaign-day slice
    demo_cid = int(panel["creative_id"].iloc[0])
    demo_camp = int(panel.loc[panel["creative_id"] == demo_cid, "campaign_id"].iloc[0])
    demo_goal = panel.loc[panel["creative_id"] == demo_cid, "kpi_goal"].iloc[0]
    last_row = panel.loc[(panel["creative_id"] == demo_cid) & (panel["horizon"] == 7)].iloc[-1]
    res = results.get(demo_goal)
    if res is not None:
        X1 = _prepare_matrix(pd.DataFrame([last_row[res["feature_cols"]]]), res["cat_cols"])
        pred7 = float(res["model"].predict(X1, num_iteration=res["model"].best_iteration)[0])
        hval = health_score(demo_goal, float(last_row["metric_last"]), pred7)
        peers = panel.loc[(panel["campaign_id"] == demo_camp) & (panel["horizon"] == 7)].groupby("creative_id").tail(1)
        peer_list = []
        for _, r in peers.iterrows():
            g = r["kpi_goal"]
            if g not in results:
                continue
            rr = results[g]
            Xp = _prepare_matrix(pd.DataFrame([r[rr["feature_cols"]]]), rr["cat_cols"])
            pr = float(rr["model"].predict(Xp, num_iteration=rr["model"].best_iteration)[0])
            peer_list.append(
                {
                    "id": int(r["creative_id"]),
                    "health_score": health_score(g, float(r["metric_last"]), pr),
                    "current_metric": float(r["metric_last"]),
                }
            )
        action, reason = recommend(
            demo_cid,
            hval,
            {7: pred7},
            peer_list,
            demo_goal,
            None,
            float(last_row["metric_last"]),
        )
        with open(OUT_DIR / "demo_rule_engine.txt", "w") as f:
            f.write(f"creative_id={demo_cid} campaign_id={demo_camp} kpi_goal={demo_goal}\n")
            f.write(f"health@h7={hval:.4f} pred_metric@T+7={pred7:.6g} current={float(last_row['metric_last']):.6g}\n")
            f.write(f"action={action}\n{reason}\n")

    print(f"Wrote outputs to {OUT_DIR}")


if __name__ == "__main__":
    main()
