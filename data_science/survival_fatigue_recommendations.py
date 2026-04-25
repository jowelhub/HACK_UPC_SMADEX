"""
Per-creative contrast vs nearest **stable** neighbor (heuristic “what differed?”).

Uses the same features as ``static_plus_first_week`` in ``survival_fatigue_rsf_shap.py``,
fits the RSF on **all** rows, then for each **fatigued** creative finds the **stable**
creative whose transformed feature vector is closest in Euclidean distance (after
``StandardScaler`` on the encoded matrix).

This is **not** a proof of what would have prevented fatigue (no causal counterfactual);
it is **descriptive**: “who stayed stable looked most like you on these inputs, and where
you differed most.” Pair with global SHAP plots from the main script for general drivers.

Output: ``outputs/survival_fatigue_rsf/static_plus_first_week/per_creative_stable_contrast.csv``
and PNG plots in the same folder (distance distribution, distance vs time-to-fatigue,
risk vs distance if scores file exists, peer reuse counts).
"""

from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sksurv.util import Surv

import survival_fatigue_rsf_shap as sf


OUT_DIR = sf.OUT_DIR / "static_plus_first_week"
OUT_CSV = OUT_DIR / "per_creative_stable_contrast.csv"
SCORES_CSV = OUT_DIR / "fatigue_scores_all_creatives.csv"


def _top_diffs(
    row_f: pd.Series,
    row_s: pd.Series,
    cols: list[str],
    k: int = 6,
) -> str:
    parts = []
    for c in cols:
        a, b = row_f.get(c), row_s.get(c)
        if pd.isna(a) and pd.isna(b):
            continue
        if isinstance(a, (int, float, np.floating)) and isinstance(b, (int, float, np.floating)):
            if abs(float(a) - float(b)) < 1e-9:
                continue
            parts.append((c, abs(float(a) - float(b)), f"{c}: you={a:.4g} vs stable_peer={b:.4g}"))
        else:
            if str(a) == str(b):
                continue
            parts.append((c, 1.0, f"{c}: you={a!s} vs stable_peer={b!s}"))
    parts.sort(key=lambda x: -x[1])
    return " | ".join(p[2] for p in parts[:k])


def plot_recommendations(df: pd.DataFrame, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    fig, ax = plt.subplots(figsize=(7, 4.5))
    ax.hist(df["feature_space_distance"], bins=20, color="steelblue", edgecolor="white")
    ax.set_xlabel("Distance to nearest stable peer (scaled feature space)")
    ax.set_ylabel("Fatigued creatives (count)")
    ax.set_title("How far fatigued rows are from closest stable match")
    fig.tight_layout()
    fig.savefig(out_dir / "plot_distance_histogram.png", dpi=150)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(7, 4.5))
    ax.scatter(
        df["feature_space_distance"],
        df["observed_time_to_fatigue_days"],
        alpha=0.45,
        c="darkslateblue",
        s=22,
    )
    ax.set_xlabel("Distance to nearest stable peer")
    ax.set_ylabel("Observed time to fatigue (days)")
    ax.set_title("Peer distance vs when fatigue occurred")
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(out_dir / "plot_distance_vs_time_to_fatigue.png", dpi=150)
    plt.close(fig)

    peer = df["nearest_stable_creative_id"].value_counts().head(15)
    fig, ax = plt.subplots(figsize=(8, 5))
    peer.iloc[::-1].plot(kind="barh", ax=ax, color="teal")
    ax.set_xlabel("Times matched as nearest stable peer")
    ax.set_ylabel("Stable creative_id")
    ax.set_title("Stable creatives most often used as closest peer")
    fig.tight_layout()
    fig.savefig(out_dir / "plot_top_stable_peers_reuse.png", dpi=150)
    plt.close(fig)

    if SCORES_CSV.exists():
        sc = pd.read_csv(SCORES_CSV)
        sc = sc[sc["model_variant"] == "static_plus_first_week"][
            ["creative_id", "risk_score", "p_fatigue_by_day_30"]
        ].rename(columns={"creative_id": "fatigued_creative_id"})
        m = df.merge(sc, on="fatigued_creative_id", how="left")
        fig, axes = plt.subplots(1, 2, figsize=(10, 4.2))
        axes[0].scatter(m["feature_space_distance"], m["risk_score"], alpha=0.4, c="coral", s=20)
        axes[0].set_xlabel("Distance to nearest stable peer")
        axes[0].set_ylabel("RSF risk score")
        axes[0].set_title("Risk vs peer distance")
        axes[0].grid(True, alpha=0.3)
        axes[1].scatter(m["feature_space_distance"], m["p_fatigue_by_day_30"], alpha=0.4, c="seagreen", s=20)
        axes[1].set_xlabel("Distance to nearest stable peer")
        axes[1].set_ylabel("P(fatigue by day 30)")
        axes[1].set_title("Model P(T≤30) vs peer distance")
        axes[1].grid(True, alpha=0.3)
        fig.suptitle("Fatigued creatives — link to survival model outputs")
        fig.tight_layout()
        fig.savefig(out_dir / "plot_distance_vs_risk_and_prob30.png", dpi=150)
        plt.close(fig)


def main() -> None:
    merged = pd.read_csv(sf.MERGED_PATH)
    daily = pd.read_csv(
        sf.DAILY_PATH,
        usecols=["creative_id", "days_since_launch", *sf.DAILY_NUMERIC],
    )
    surv = sf.build_survival_table(merged, daily)
    early = sf.build_early_daily_features(daily, merged, use_first_week=True)
    X, feature_cols = sf.build_feature_matrix(surv, early, "static_plus_first_week")
    cat_cols = [c for c in feature_cols if X[c].dtype == object or str(X[c].dtype) == "string"]
    num_cols = [c for c in feature_cols if c not in cat_cols]
    y = Surv.from_arrays(event=surv["event"].values, time=surv["duration"].values)

    pipe: Pipeline = sf.make_pipeline(cat_cols, num_cols)
    pipe.fit(X, y)

    Xt = sf.transform_X(pipe, X).astype(float)
    Z = StandardScaler().fit_transform(Xt.values)
    ids = surv["creative_id"].values
    is_fat = surv["event"].values
    stable_idx = np.where(~is_fat)[0]
    fat_idx = np.where(is_fat)[0]
    Zs = Z[stable_idx]

    rows = []
    for fi in fat_idx:
        d = np.linalg.norm(Zs - Z[fi], axis=1)
        j = int(np.argmin(d))
        si = int(stable_idx[j])
        cid_f, cid_s = int(ids[fi]), int(ids[si])
        dist = float(d[j])
        summary = _top_diffs(X.iloc[fi], X.iloc[si], feature_cols)
        rows.append(
            {
                "fatigued_creative_id": cid_f,
                "nearest_stable_creative_id": cid_s,
                "feature_space_distance": dist,
                "top_feature_contrasts": summary,
                "observed_time_to_fatigue_days": float(surv.iloc[fi]["duration"]),
            }
        )

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    out_df = pd.DataFrame(rows)
    out_df.to_csv(OUT_CSV, index=False)
    print(f"Wrote {OUT_CSV} ({len(rows)} fatigued creatives)")

    plot_recommendations(out_df, OUT_DIR)
    print(f"Wrote plots under: {OUT_DIR}")

    print(
        "Interpretation: nearest_stable_creative_id is the closest stable peer in "
        "(scaled) model inputs — not causal advice. Use with SHAP summaries in the same folder."
    )


if __name__ == "__main__":
    main()
