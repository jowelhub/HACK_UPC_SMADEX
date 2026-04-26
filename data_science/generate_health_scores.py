import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sksurv.ensemble import RandomSurvivalForest
from sksurv.util import Surv
from sklearn.preprocessing import OrdinalEncoder
import scipy.stats as stats
import sys
import json
import shap
from sklearn.ensemble import RandomForestRegressor

sys.modules['bottleneck'] = None
sys.modules['numexpr'] = None

surv = pd.read_csv("data/creative_merged.csv")
surv["event"] = (surv["creative_status"] == "fatigued").astype(bool)
surv["duration"] = np.where(surv["event"], surv["fatigue_day"], surv["total_days_active"]).astype(float)

STATIC_CAT = [
    "vertical", "format", "language", "theme", "hook_type",
    "cta_text", "headline", "subhead", "dominant_color", "emotional_tone",
]
STATIC_NUM = [
    "width", "height",
    "duration_sec", "text_density", "copy_length_chars", "readability_score",
    "brand_visibility_score", "clutter_score", "novelty_score", "motion_score",
    "faces_count", "product_count",
]
STATIC_BIN = ["has_price", "has_discount_badge", "has_gameplay", "has_ugc_style"]

STATIC_CAT = [c for c in STATIC_CAT if c in surv.columns]
STATIC_NUM = [c for c in STATIC_NUM if c in surv.columns]
STATIC_BIN = [c for c in STATIC_BIN if c in surv.columns]

feat_cols = STATIC_CAT + STATIC_NUM + STATIC_BIN
Xraw = surv[feat_cols].copy()
for c in STATIC_NUM:
    Xraw[c] = pd.to_numeric(Xraw[c], errors="coerce")
for c in STATIC_BIN:
    Xraw[c] = pd.to_numeric(Xraw[c], errors="coerce").fillna(0)

y = Surv.from_arrays(event=surv["event"].values, time=surv["duration"].values)

idx_train, idx_test = train_test_split(
    np.arange(len(surv)), test_size=0.20, stratify=surv["event"], random_state=42
)

enc = OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)
enc.fit(Xraw.iloc[idx_train][STATIC_CAT].astype(str))
X_cat = pd.DataFrame(enc.transform(Xraw[STATIC_CAT].astype(str)), columns=STATIC_CAT, index=surv.index)
num_med = Xraw.iloc[idx_train][STATIC_NUM].median()
X_num = Xraw[STATIC_NUM].fillna(num_med)
X_bin = Xraw[STATIC_BIN]

X = pd.concat([X_cat, X_num, X_bin], axis=1)
X_train = X.iloc[idx_train]
y_train = y[idx_train]

rsf = RandomSurvivalForest(
    n_estimators=300,
    min_samples_split=10,
    min_samples_leaf=15,
    max_features="sqrt",
    n_jobs=-1,
    random_state=42,
)
rsf.fit(X_train.values, y_train)

train_risk_scores = rsf.predict(X_train.values)
all_risk_scores = rsf.predict(X.values)

health_scores = []
for risk_score in all_risk_scores:
    risk_percentile = stats.percentileofscore(train_risk_scores, risk_score)
    health_score = 100.0 - risk_percentile
    health_scores.append(int(health_score))

surrogate = RandomForestRegressor(
    n_estimators=300, max_features="sqrt", n_jobs=-1, random_state=42
)
surrogate.fit(X_train.values, train_risk_scores)
explainer = shap.TreeExplainer(surrogate)
shap_values = explainer.shap_values(X.values)

survs = rsf.predict_survival_function(X.values)
TIME_GRID = np.arange(0, 75, 1).astype(float)
surv_probs = [fn(TIME_GRID) for fn in survs]

shap_json_list = []
for i in range(len(X)):
    sv = shap_values[i]
    factors = []
    for j, val in enumerate(sv):
        feature_name = feat_cols[j]
        raw_val = Xraw.iloc[i, j]
        factors.append({"feature": feature_name, "shap_value": float(val), "value": str(raw_val)})
    
    # Sort by absolute magnitude to get the most impactful ones
    factors.sort(key=lambda x: abs(x["shap_value"]), reverse=True)
    # Take top 10 most impactful features
    top_factors = factors[:10]
    
    surv_curve = [{"day": int(d), "prob": float(p)} for d, p in zip(TIME_GRID, surv_probs[i])]
    
    shap_data = {
        "factors": top_factors,
        "survival_curve": surv_curve
    }
    shap_json_list.append(json.dumps(shap_data))

out_df = pd.DataFrame({
    'creative_id': surv['creative_id'],
    'health_score': health_scores,
    'shap_json': shap_json_list
})
out_df.to_csv("data/creative_health_scores.csv", index=False)
