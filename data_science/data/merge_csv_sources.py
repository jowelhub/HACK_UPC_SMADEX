"""
Merge dimension CSVs with their summary counterparts, keeping one copy of
overlapping columns (from the dimension file) and appending summary-only metrics.

Inputs (same directory as this script):
  - campaigns.csv + campaign_summary.csv -> campaigns_merged.csv
  - creatives.csv + creative_summary.csv -> creative_merged.csv

Unchanged by this script:
  - advertisers.csv
  - creative_daily_country_os_stats.csv
  - data_dictionary.csv
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd


DATA_DIR = Path(__file__).resolve().parent


def merge_unique_columns(
    left: pd.DataFrame,
    right: pd.DataFrame,
    on: str,
    how: str = "left",
) -> pd.DataFrame:
    """Merge on ``on``; columns present in both frames are taken from ``left`` only."""
    extra = [c for c in right.columns if c != on and c not in left.columns]
    return left.merge(right[[on, *extra]], on=on, how=how, validate="one_to_one")


def main() -> None:
    campaigns = pd.read_csv(DATA_DIR / "campaigns.csv")
    campaign_summary = pd.read_csv(DATA_DIR / "campaign_summary.csv")
    campaigns_merged = merge_unique_columns(campaigns, campaign_summary, on="campaign_id")
    out_campaigns = DATA_DIR / "campaigns_merged.csv"
    campaigns_merged.to_csv(out_campaigns, index=False)
    print(f"Wrote {out_campaigns.name} ({len(campaigns_merged)} rows, {len(campaigns_merged.columns)} cols)")

    creatives = pd.read_csv(DATA_DIR / "creatives.csv")
    creative_summary = pd.read_csv(DATA_DIR / "creative_summary.csv")
    creative_merged = merge_unique_columns(creatives, creative_summary, on="creative_id")
    out_creatives = DATA_DIR / "creative_merged.csv"
    creative_merged.to_csv(out_creatives, index=False)
    print(f"Wrote {out_creatives.name} ({len(creative_merged)} rows, {len(creative_merged.columns)} cols)")


if __name__ == "__main__":
    main()
