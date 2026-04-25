#!/usr/bin/env python3
"""Load CSVs from IMPORT_DATA_DIR into PostgreSQL (DATABASE_URL).

Applies web/db/schema.sql, then either full seed (when fact table is empty) or
backfill of empty summary/dictionary tables. Table names match CSV stems.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, text

SEED_TABLE_ORDER: tuple[tuple[str, str], ...] = (
    ("advertisers", "advertisers.csv"),
    ("campaigns", "campaigns.csv"),
    ("creatives", "creatives.csv"),
    ("campaign_summary", "campaign_summary.csv"),
    ("creative_summary", "creative_summary.csv"),
    ("advertiser_campaign_rankings", "advertiser_campaign_rankings.csv"),
    ("creative_daily_country_os_stats", "creative_daily_country_os_stats.csv"),
)

BACKFILL_TABLE_ORDER: tuple[tuple[str, str], ...] = (
    ("campaign_summary", "campaign_summary.csv"),
    ("creative_summary", "creative_summary.csv"),
    ("advertiser_campaign_rankings", "advertiser_campaign_rankings.csv"),
)


def _table_exists(conn, name: str) -> bool:
    q = text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_name = :n)"
    )
    return bool(conn.execute(q, {"n": name}).scalar_one())


def _monorepo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _web_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _load_table(engine, data_dir: Path, table: str, fname: str) -> int:
    path = data_dir / fname
    if not path.is_file():
        print(f"Missing seed file: {path}", file=sys.stderr)
        raise FileNotFoundError(path)
    df = pd.read_csv(path)
    if "date" in df.columns and table == "creative_daily_country_os_stats":
        df["date"] = pd.to_datetime(df["date"])
    if table in ("campaigns", "campaign_summary"):
        df["start_date"] = pd.to_datetime(df["start_date"])
        df["end_date"] = pd.to_datetime(df["end_date"])
    if table == "creative_summary":
        df["creative_launch_date"] = pd.to_datetime(df["creative_launch_date"])
        df["fatigue_day"] = df["fatigue_day"].astype("Int64")
    elif "creative_launch_date" in df.columns:
        df["creative_launch_date"] = pd.to_datetime(df["creative_launch_date"])
    rows = len(df)
    df.to_sql(table, engine, if_exists="append", index=False, method="multi", chunksize=5000)
    print(f"Loaded {rows} rows into {table}")
    return rows


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Set DATABASE_URL, e.g. postgresql+psycopg2://user:pass@localhost:5432/smadex", file=sys.stderr)
        return 1

    default_data = _monorepo_root() / "data_science" / "data"
    data_dir = Path(os.environ.get("IMPORT_DATA_DIR", default_data)).resolve()
    if not data_dir.is_dir():
        print(f"Data directory not found: {data_dir}", file=sys.stderr)
        return 1

    schema_path = _web_root() / "db" / "schema.sql"
    if not schema_path.is_file():
        print(f"Schema not found: {schema_path}", file=sys.stderr)
        return 1

    engine = create_engine(url, pool_pre_ping=True)
    schema_sql = schema_path.read_text(encoding="utf-8")

    with engine.begin() as conn:
        for stmt in schema_sql.split(";"):
            s = stmt.strip()
            if s:
                conn.execute(text(s))

    with engine.begin() as conn:
        if _table_exists(conn, "data_dictionary"):
            conn.execute(text("DROP TABLE IF EXISTS data_dictionary CASCADE"))
            print("Dropped legacy table data_dictionary (not seeded)")

    with engine.connect() as conn:
        n = int(conn.execute(text("SELECT COUNT(*) FROM creative_daily_country_os_stats")).scalar_one())

    if n > 0:
        print(f"creative_daily_country_os_stats already has {n} rows; skip full load.")
        for table, fname in BACKFILL_TABLE_ORDER:
            with engine.connect() as conn:
                if not _table_exists(conn, table):
                    continue
                cnt = int(conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one())
            if cnt == 0:
                print(f"Backfilling empty table {table}")
                _load_table(engine, data_dir, table, fname)
        return 0

    for table, fname in SEED_TABLE_ORDER:
        _load_table(engine, data_dir, table, fname)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
