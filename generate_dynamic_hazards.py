import pandas as pd
import numpy as np
import json
import warnings
from lifelines import CoxTimeVaryingFitter
warnings.filterwarnings('ignore')

DATA_DIR = "data_science/data/"

def generate_dynamic_hazards():
    print("Loading data...")
    daily_raw = pd.read_csv(f"{DATA_DIR}creative_daily_country_os_stats.csv", parse_dates=["date"])
    crs_summary = pd.read_csv(f"{DATA_DIR}creative_summary.csv")
    campaigns = pd.read_csv(f"{DATA_DIR}campaigns.csv")[['campaign_id', 'kpi_goal']]

    print("Aggregating daily stats...")
    agg_cols = {
        'spend_usd': 'sum', 'impressions': 'sum', 'clicks': 'sum', 'conversions': 'sum',
        'impressions_last_7d': 'max', 'days_since_launch': 'max',
    }
    daily = daily_raw.groupby(['creative_id', 'campaign_id', 'date'], as_index=False).agg(agg_cols).sort_values(['creative_id', 'days_since_launch']).reset_index(drop=True)

    print("Computing derived metrics...")
    daily['ctr'] = daily['clicks'] / daily['impressions'].clip(lower=1)
    daily['cvr'] = daily['conversions'] / daily['clicks'].clip(lower=1)

    daily['log_impressions_last7d'] = np.log1p(daily['impressions_last_7d'])
    daily['ctr_peak_so_far'] = daily.groupby('creative_id')['ctr'].transform(lambda x: x.expanding().max())
    daily['cvr_peak_so_far'] = daily.groupby('creative_id')['cvr'].transform(lambda x: x.expanding().max())
    daily['ctr_vs_peak'] = (daily['ctr'] / daily['ctr_peak_so_far'].clip(lower=1e-9)).clip(0, 1)
    daily['cvr_vs_peak'] = (daily['cvr'] / daily['cvr_peak_so_far'].clip(lower=1e-9)).clip(0, 1)
    daily['spend_velocity_7d'] = daily.groupby('creative_id')['spend_usd'].transform(lambda x: x.rolling(7, min_periods=1).mean())

    def rolling_slope(series, window=7):
        slopes = [np.nan] * len(series)
        arr = series.values
        for i in range(len(arr)):
            start = max(0, i - window + 1)
            chunk = arr[start:i+1]
            if len(chunk) >= 2:
                x = np.arange(len(chunk), dtype=float)
                slopes[i] = float(np.polyfit(x, chunk, 1)[0])
            else:
                slopes[i] = 0.0
        return slopes

    daily['ctr_7d_slope'] = daily.groupby('creative_id')['ctr'].transform(rolling_slope)
    tv_cols = ['log_impressions_last7d', 'ctr_vs_peak', 'cvr_vs_peak', 'spend_velocity_7d', 'ctr_7d_slope']
    # ffill has been removed in pandas 2.1, use ffill() method
    daily[tv_cols] = daily[tv_cols].ffill().fillna(0)

    label_cols = ['creative_id', 'creative_status', 'fatigue_day', 'total_days_active', 'format', 'vertical']
    daily = daily.merge(crs_summary[label_cols], on='creative_id', how='left')
    daily = daily.merge(campaigns, on='campaign_id', how='left')

    daily['is_fatigued'] = (daily['creative_status'] == 'fatigued').astype(int)
    daily['start'] = daily['days_since_launch']
    daily['stop']  = daily['days_since_launch'] + 1
    daily['event_on_stop'] = ((daily['is_fatigued'] == 1) & (daily['stop'] == daily['fatigue_day'])).astype(int)
    daily['observed_duration'] = np.where(daily['is_fatigued'] == 1, daily['fatigue_day'], daily['total_days_active'])

    daily_valid = daily[daily['stop'] <= daily['observed_duration']].copy()
    print(f"Data ready. Total intervals: {len(daily_valid)}")

    print("Encoding features for model...")
    df_model_base = pd.get_dummies(daily_valid, columns=['format', 'vertical'], drop_first=True, dtype=float)
    format_dummies = [c for c in df_model_base.columns if c.startswith('format_')]
    vertical_dummies = [c for c in df_model_base.columns if c.startswith('vertical_')]
    model_cols = ['creative_id', 'start', 'stop', 'event_on_stop'] + tv_cols + format_dummies + vertical_dummies

    # Fit Cox model per KPI and store them
    models_by_kpi = {}
    for kpi in daily_valid['kpi_goal'].dropna().unique():
        print(f"Training CoxTimeVaryingFitter for KPI: {kpi}...")
        cids = daily_valid[daily_valid['kpi_goal'] == kpi]['creative_id'].unique()
        tv_df = df_model_base[df_model_base['creative_id'].isin(cids)][model_cols].copy().fillna(0)
        
        ctvf = CoxTimeVaryingFitter(penalizer=0.01)
        ctvf.fit(tv_df, id_col='creative_id', start_col='start', stop_col='stop', event_col='event_on_stop')
        
        summary = ctvf.summary[['coef', 'exp(coef)', 'p']].copy()
        summary.columns = ['coef', 'HR', 'p']
        summary = summary.sort_values('HR', ascending=False)
        models_by_kpi[kpi] = (ctvf, summary, tv_df)

    # Calculate dynamic hazards for each creative
    print("Generating dynamic hazards JSON...")
    
    # Load existing creative health scores
    health_scores_df = pd.read_csv(f"{DATA_DIR}creative_health_scores.csv")
    
    hazards_map = {}
    
    cids = df_model_base['creative_id'].unique()
    for i, cid in enumerate(cids):
        if i % 100 == 0:
            print(f"Processing creative {i}/{len(cids)}...")
            
        creative_kpi = daily_valid[daily_valid['creative_id'] == cid]['kpi_goal'].iloc[0]
        if pd.isna(creative_kpi) or creative_kpi not in models_by_kpi:
            continue
            
        ctvf, summary, tv_df = models_by_kpi[creative_kpi]
        subset = tv_df[tv_df['creative_id'] == cid]
        
        daily_data = []
        max_day = int(subset['stop'].max())
        
        # Calculate hazards for the trajectory
        features = subset.drop(columns=['creative_id', 'start', 'stop', 'event_on_stop'])
        hazards = np.exp(np.dot(features.values, ctvf.params_.values))
        
        # Top 3 drivers for this KPI overall
        top_drivers_df = summary[summary['HR'] > 1.05].head(3)
        top_drivers = [{"feature": idx, "hr": float(row['HR'])} for idx, row in top_drivers_df.iterrows()]
        
        for idx, (_, row) in enumerate(subset.iterrows()):
            day = int(row['stop'] - 1)
            hazard = float(hazards[idx])
            recommendation = "Scale" if hazard < 1.0 else ("Hold" if hazard < 2.0 else "Pause")
            
            day_features = {k: float(row[k]) for k in tv_cols}
            
            daily_data.append({
                "day": day,
                "hazard_score": hazard,
                "recommendation": recommendation,
                "features": day_features
            })
            
        hazards_map[cid] = json.dumps({
            "max_days": max_day,
            "top_drivers": top_drivers,
            "daily_data": daily_data
        })

    # Add the column to health_scores
    health_scores_df['daily_hazards_json'] = health_scores_df['creative_id'].map(hazards_map)
    health_scores_df.to_csv(f"{DATA_DIR}creative_health_scores.csv", index=False)
    print("Done! creative_health_scores.csv updated with daily_hazards_json.")

if __name__ == "__main__":
    generate_dynamic_hazards()
