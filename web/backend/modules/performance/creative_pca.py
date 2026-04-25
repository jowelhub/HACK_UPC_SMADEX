"""PCA (2D) on merged creative rows for one campaign — numeric features only."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

# Identifiers / high-level text excluded from the design matrix (per product spec).
_DROP_FROM_FEATURES = frozenset(
    {
        "creative_id",
        "campaign_id",
        "advertiser_name",
        "app_name",
        "creative_launch_date",
        "asset_file",
    }
)


def campaign_creative_pca(creatives: pd.DataFrame, campaign_id: int) -> dict[str, Any]:
    """
    Return PC1/PC2 scores per creative for ``campaign_id`` using SVD on standardized
    numeric columns after dropping identifier / name columns above.
    ``creative_status`` is excluded from X (used only for client coloring).
    """
    if "campaign_id" not in creatives.columns or "creative_id" not in creatives.columns:
        return {"explained_variance_ratio": [], "points": []}

    sub = creatives[creatives["campaign_id"] == campaign_id].copy()
    n = len(sub)
    if n < 2:
        return {"explained_variance_ratio": [], "points": []}

    drop_cols = [c for c in _DROP_FROM_FEATURES if c in sub.columns]
    feat = sub.drop(columns=drop_cols, errors="ignore")
    feat = feat.drop(columns=["creative_status"], errors="ignore")

    numeric = feat.select_dtypes(include=[np.number])
    # Drop near-constant columns
    std = numeric.std(axis=0, skipna=True)
    keep = std > 1e-9
    numeric = numeric.loc[:, keep]
    if numeric.shape[1] < 1:
        return {"explained_variance_ratio": [], "points": []}

    X = np.asarray(numeric.values, dtype=float)
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
    mean = X.mean(axis=0)
    st = X.std(axis=0)
    st[st < 1e-9] = 1.0
    Xs = (X - mean) / st

    # Thin SVD: Xs = U @ diag(s) @ Vt — PC scores match sklearn-style up to sign.
    U, s, _Vt = np.linalg.svd(Xs, full_matrices=False)
    k = min(2, int(s.size))
    if k < 1:
        return {"explained_variance_ratio": [], "points": []}

    scores = U[:, :k] * s[:k]
    total_var = float(np.sum(s**2))
    if total_var <= 0:
        evr: list[float] = [0.0] * k
    else:
        evr = [float((s[i] ** 2) / total_var) for i in range(k)]

    points: list[dict[str, Any]] = []
    for i in range(n):
        row = sub.iloc[i]
        cid = int(row["creative_id"])
        st_raw = row.get("creative_status")
        status = str(st_raw).strip().lower() if st_raw is not None and pd.notna(st_raw) else ""
        hl = row.get("headline")
        th = row.get("theme")
        lab = str(hl).strip() if hl is not None and pd.notna(hl) and str(hl).strip() else ""
        if not lab:
            lab = str(th).strip() if th is not None and pd.notna(th) and str(th).strip() else f"Creative {cid}"
        lab = lab.replace("\n", " ")[:72]
        pc1 = float(scores[i, 0])
        pc2 = float(scores[i, 1]) if k >= 2 else 0.0
        points.append(
            {
                "creative_id": cid,
                "pc1": pc1,
                "pc2": pc2,
                "label": lab,
                "creative_status": status or None,
            }
        )

    return {
        "explained_variance_ratio": evr,
        "n_features_used": int(numeric.shape[1]),
        "points": points,
    }
