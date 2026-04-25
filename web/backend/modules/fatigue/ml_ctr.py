"""CTR forecasting from daily stats: sliding-window features, GroupKFold CV, Optuna (ask/tell), LightGBM."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from typing import Any, Iterator

import lightgbm as lgb
import numpy as np
import optuna
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold, GroupShuffleSplit

from modules.fatigue.service import _aggregate_daily
from shared.store import DataStore

optuna.logging.set_verbosity(optuna.logging.WARNING)

STATIC_NUMERIC = [
    "motion_score",
    "text_density",
    "readability_score",
    "brand_visibility_score",
    "clutter_score",
    "novelty_score",
    "duration_sec",
    "faces_count",
    "product_count",
    "has_price",
    "has_discount_badge",
    "has_gameplay",
    "has_ugc_style",
    "width",
    "height",
]
STATIC_CAT = ["format", "vertical", "hook_type", "theme", "dominant_color", "emotional_tone", "language"]
WINDOW = 7


def _slope(y: np.ndarray) -> float:
    y = np.asarray(y, dtype=float)
    n = len(y)
    if n < 2 or not np.all(np.isfinite(y)):
        return 0.0
    x = np.arange(n, dtype=float)
    x_mean, y_mean = x.mean(), y.mean()
    denom = ((x - x_mean) ** 2).sum()
    if denom <= 1e-12:
        return 0.0
    return float(((x - x_mean) * (y - y_mean)).sum() / denom)


def _smoothed_ctr(clicks: float, imps: float) -> float:
    return float((clicks + 0.5) / (max(imps, 1.0) + 1.0))


def build_training_frame(store: DataStore) -> pd.DataFrame:
    """One row per (creative_id, day_index): predict CTR on that day from prior WINDOW days."""
    d = store.daily_enriched[
        [
            "date",
            "campaign_id",
            "creative_id",
            "spend_usd",
            "impressions",
            "clicks",
            "conversions",
            "revenue_usd",
            "days_since_launch",
        ]
        + [c for c in STATIC_NUMERIC + STATIC_CAT if c in store.daily_enriched.columns]
    ].copy()
    agg = _aggregate_daily(d)
    cr = store.creatives.copy()
    for c in STATIC_NUMERIC + STATIC_CAT:
        if c not in cr.columns and c in STATIC_NUMERIC:
            cr[c] = 0.0
        elif c not in cr.columns and c in STATIC_CAT:
            cr[c] = "unknown"
    cr_small = cr[["creative_id", "campaign_id"] + [c for c in STATIC_NUMERIC + STATIC_CAT if c in cr.columns]]
    agg = agg.merge(cr_small, on=["creative_id", "campaign_id"], how="left")

    rows: list[dict[str, Any]] = []
    for cid, g in agg.groupby("creative_id", sort=False):
        g = g.sort_values("date").reset_index(drop=True)
        n = len(g)
        if n <= WINDOW:
            continue
        clicks = g["clicks"].to_numpy(dtype=float)
        imps = g["impressions"].to_numpy(dtype=float)
        spend = g["spend_usd"].to_numpy(dtype=float)
        conv = g["conversions"].to_numpy(dtype=float)
        days = g["days_since_launch"].to_numpy(dtype=int)

        static: dict[str, Any] = {}
        row0 = g.iloc[0]
        for c in STATIC_NUMERIC:
            v = row0.get(c, 0)
            static[c] = float(v) if pd.notna(v) else 0.0
        for c in STATIC_CAT:
            v = row0.get(c, "unknown")
            static[c] = str(v) if pd.notna(v) else "unknown"

        for t in range(WINDOW, n):
            w_clicks = clicks[t - WINDOW : t]
            w_imps = imps[t - WINDOW : t]
            w_spend = spend[t - WINDOW : t]
            w_conv = conv[t - WINDOW : t]
            ctr_hist = np.array([_smoothed_ctr(w_clicks[i], w_imps[i]) for i in range(WINDOW)], dtype=float)
            cvr_hist = np.where(
                w_clicks > 0.5,
                np.clip(w_conv / np.maximum(w_clicks, 1e-6), 0, 1),
                0.0,
            )
            target_ctr = _smoothed_ctr(clicks[t], imps[t])

            rows.append(
                {
                    "creative_id": int(cid),
                    "campaign_id": int(g.iloc[t]["campaign_id"]),
                    "days_since_launch": int(days[t]),
                    "target_ctr": target_ctr,
                    "ctr_mean_7": float(ctr_hist.mean()),
                    "ctr_std_7": float(ctr_hist.std()) if WINDOW > 1 else 0.0,
                    "ctr_last": float(ctr_hist[-1]),
                    "ctr_slope_7": _slope(ctr_hist),
                    "cvr_mean_7": float(np.mean(cvr_hist)),
                    "cvr_slope_7": _slope(cvr_hist),
                    "imps_sum_7": float(w_imps.sum()),
                    "clicks_sum_7": float(w_clicks.sum()),
                    "spend_sum_7": float(w_spend.sum()),
                    "conv_sum_7": float(w_conv.sum()),
                    **static,
                }
            )

    return pd.DataFrame(rows)


def _feature_matrix(
    df: pd.DataFrame,
    cat_cols: list[str],
    column_order: list[str] | None = None,
) -> tuple[pd.DataFrame, list[str]]:
    """Numeric + one-hot cats. If column_order is set, reindex to match training columns."""
    drop = {"creative_id", "campaign_id", "target_ctr", *cat_cols}
    num = [c for c in df.columns if c not in drop]
    X_num = df[num].fillna(0).astype(np.float32)
    dums = pd.get_dummies(df[cat_cols].astype(str), columns=cat_cols, prefix=cat_cols, dummy_na=False)
    X = pd.concat([X_num.reset_index(drop=True), dums.reset_index(drop=True)], axis=1).fillna(0.0)
    if column_order is not None:
        X = X.reindex(columns=column_order, fill_value=0.0)
    cols = column_order if column_order is not None else X.columns.tolist()
    return X.astype(np.float32), cols


def _lgbm_model(params: dict[str, Any], rng: int) -> lgb.LGBMRegressor:
    return lgb.LGBMRegressor(
        n_estimators=int(params["n_estimators"]),
        num_leaves=int(params["num_leaves"]),
        max_depth=int(params["max_depth"]),
        learning_rate=float(params["learning_rate"]),
        subsample=float(params["subsample"]),
        colsample_bytree=float(params["colsample_bytree"]),
        min_child_samples=int(params["min_child_samples"]),
        reg_lambda=float(params["reg_lambda"]),
        random_state=rng,
        n_jobs=-1,
        verbose=-1,
    )


def _cv_rmse(
    X: pd.DataFrame,
    y: np.ndarray,
    groups: np.ndarray,
    params: dict[str, Any],
    n_splits: int,
    rng: int,
) -> tuple[float, list[dict[str, Any]]]:
    fold_rows: list[dict[str, Any]] = []
    rmses: list[float] = []

    if n_splits < 2:
        gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=rng)
        tr, va = next(gss.split(X, y, groups))
        model = _lgbm_model(params, rng)
        model.fit(X.iloc[tr], y[tr])
        pred = model.predict(X.iloc[va])
        rmse = float(math.sqrt(mean_squared_error(y[va], pred)))
        rmses.append(rmse)
        fold_rows.append(
            {
                "fold": 1,
                "rmse": rmse,
                "mae": float(mean_absolute_error(y[va], pred)),
                "n_val_rows": int(len(va)),
            }
        )
        return float(np.mean(rmses)), fold_rows

    n_groups = len(np.unique(groups))
    k = max(2, min(n_splits, n_groups))
    gkf = GroupKFold(n_splits=k)
    for fold_idx, (tr, va) in enumerate(gkf.split(X, y, groups)):
        model = _lgbm_model(params, rng + fold_idx)
        model.fit(X.iloc[tr], y[tr])
        pred = model.predict(X.iloc[va])
        rmse = float(math.sqrt(mean_squared_error(y[va], pred)))
        rmses.append(rmse)
        fold_rows.append(
            {
                "fold": fold_idx + 1,
                "rmse": rmse,
                "mae": float(mean_absolute_error(y[va], pred)),
                "n_val_rows": int(len(va)),
            }
        )
    return float(np.mean(rmses)), fold_rows


@dataclass
class FatigueMLArtifacts:
    model: lgb.LGBMRegressor
    feature_columns: list[str]
    static_cat_cols: list[str]
    test_metrics: dict[str, float] = field(default_factory=dict)
    best_params: dict[str, Any] = field(default_factory=dict)


def train_ctr_model_stream(
    store: DataStore,
    *,
    test_frac: float = 0.15,
    cv_splits: int = 5,
    n_trials: int = 18,
    random_state: int = 42,
    artifacts_out: list[FatigueMLArtifacts] | None = None,
) -> Iterator[dict[str, Any]]:
    """Yield JSON-serializable events for SSE (type, payload)."""
    cv_splits = max(1, min(int(cv_splits), 10))
    n_trials = max(1, min(int(n_trials), 100))

    yield {"type": "log", "message": "Building training frame from daily stats + creative metadata…"}
    df = build_training_frame(store)
    if len(df) < 500:
        yield {"type": "error", "message": f"Too few rows after feature build ({len(df)}). Check DB seed."}
        return

    rng = np.random.RandomState(random_state)
    creatives = df["creative_id"].unique()
    rng.shuffle(creatives)
    n_test = max(1, int(len(creatives) * test_frac))
    test_ids = set(creatives[:n_test].tolist())
    train_val = df[~df["creative_id"].isin(test_ids)].copy()
    test_df = df[df["creative_id"].isin(test_ids)].copy()

    yield {
        "type": "split",
        "n_rows_total": int(len(df)),
        "n_train_val_rows": int(len(train_val)),
        "n_test_rows": int(len(test_df)),
        "n_creatives_total": int(len(creatives)),
        "n_test_creatives": int(len(test_ids)),
        "cv_splits": int(cv_splits),
        "n_trials": int(n_trials),
    }

    cat_cols = [c for c in STATIC_CAT if c in train_val.columns]
    X_tv, feature_columns = _feature_matrix(train_val, cat_cols, column_order=None)
    y_tv = train_val["target_ctr"].to_numpy(dtype=float)
    groups_tv = train_val["creative_id"].to_numpy()

    n_groups = len(np.unique(groups_tv))
    n_splits_effective = max(1, min(cv_splits, n_groups))
    if n_splits_effective < 2:
        yield {
            "type": "log",
            "message": "Using single holdout by creative (GroupShuffleSplit, 20% val) — CV splits = 1.",
        }
    else:
        yield {
            "type": "log",
            "message": f"Using GroupKFold with n_splits={n_splits_effective} (groups=creative_id).",
        }

    study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=random_state))

    for trial_idx in range(n_trials):
        trial = study.ask()
        params = {
            "n_estimators": trial.suggest_int("n_estimators", 80, 450, log=True),
            "num_leaves": trial.suggest_int("num_leaves", 24, 256, log=True),
            "max_depth": trial.suggest_int("max_depth", 4, 12),
            "learning_rate": trial.suggest_float("learning_rate", 0.02, 0.28, log=True),
            "subsample": trial.suggest_float("subsample", 0.65, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.65, 1.0),
            "min_child_samples": trial.suggest_int("min_child_samples", 8, 120, log=True),
            "reg_lambda": trial.suggest_float("reg_lambda", 0.1, 8.0, log=True),
        }
        mean_rmse, fold_rows = _cv_rmse(X_tv, y_tv, groups_tv, params, n_splits=n_splits_effective, rng=random_state)
        study.tell(trial, mean_rmse)
        yield {
            "type": "optuna_trial",
            "trial": trial_idx + 1,
            "n_trials": n_trials,
            "value": mean_rmse,
            "params": params,
            "best_value": float(study.best_value),
            "folds": fold_rows,
        }

    best = study.best_params
    yield {"type": "log", "message": f"Optuna finished. Best CV RMSE={study.best_value:.6f}"}
    yield {"type": "optuna_best", "best_params": best, "best_cv_rmse": float(study.best_value)}

    yield {"type": "log", "message": "Refitting on full train+val with best params…"}
    final = _lgbm_model(best, random_state)
    final.fit(X_tv, y_tv)

    X_test, _ = _feature_matrix(test_df, cat_cols, column_order=feature_columns)
    y_test = test_df["target_ctr"].to_numpy(dtype=float)
    pred_test = final.predict(X_test)
    test_rmse = float(math.sqrt(mean_squared_error(y_test, pred_test)))
    test_mae = float(mean_absolute_error(y_test, pred_test))
    test_r2 = float(r2_score(y_test, pred_test)) if len(y_test) > 1 else 0.0

    yield {
        "type": "test_metrics",
        "rmse": test_rmse,
        "mae": test_mae,
        "r2": test_r2,
        "n_test_rows": int(len(test_df)),
    }

    artifacts = FatigueMLArtifacts(
        model=final,
        feature_columns=feature_columns,
        static_cat_cols=cat_cols,
        test_metrics={"rmse": test_rmse, "mae": test_mae, "r2": test_r2},
        best_params=dict(best),
    )
    if artifacts_out is not None:
        artifacts_out.clear()
        artifacts_out.append(artifacts)
    yield {"type": "done", "artifacts_ready": True, "n_features": len(feature_columns)}


def predict_ctr_for_creative(store: DataStore, artifacts: FatigueMLArtifacts, creative_id: int) -> list[dict[str, Any]]:
    """Teacher-forcing: each day uses true prior 7-day window; returns actual smoothed CTR + model prediction."""
    df = build_training_frame(store)
    sub = df[df["creative_id"] == creative_id]
    if sub.empty:
        return []

    X, _ = _feature_matrix(sub, artifacts.static_cat_cols, column_order=artifacts.feature_columns)
    pred = artifacts.model.predict(X)
    out = []
    for i, (_, r) in enumerate(sub.iterrows()):
        out.append(
            {
                "days_since_launch": int(r["days_since_launch"]),
                "actual_ctr": float(r["target_ctr"]),
                "predicted_ctr": float(pred[i]),
            }
        )
    return out


def sse_pack(obj: dict[str, Any]) -> str:
    return f"data: {json.dumps(obj, default=str)}\n\n"
