#!/usr/bin/env python3
"""Load CSVs from IMPORT_DATA_DIR into PostgreSQL (DATABASE_URL).

Use for local Postgres without Docker: applies web/db/schema.sql if needed, then
appends rows only when creative_daily_country_os_stats is empty.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, text


def _monorepo_root() -> Path:
    # web/backend/scripts -> repo root
    return Path(__file__).resolve().parents[3]


def _web_root() -> Path:
    return Path(__file__).resolve().parents[2]


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

    with engine.connect() as conn:
        n = conn.execute(text("SELECT COUNT(*) FROM creative_daily_country_os_stats")).scalar_one()
    if int(n) > 0:
        print(f"creative_daily_country_os_stats already has {n} rows; skip load.")
        return 0

    load_order = [
        ("advertisers", "advertisers.csv"),
        ("campaigns", "campaigns.csv"),
        ("creatives", "creatives.csv"),
        ("creative_daily_country_os_stats", "creative_daily_country_os_stats.csv"),
        ("creative_summary", "creative_summary.csv"),
    ]
    for table, fname in load_order:
        path = data_dir / fname
        df = pd.read_csv(path)
        if "date" in df.columns and table == "creative_daily_country_os_stats":
            df["date"] = pd.to_datetime(df["date"])
        if table == "campaigns":
            df["start_date"] = pd.to_datetime(df["start_date"])
            df["end_date"] = pd.to_datetime(df["end_date"])
        if "creative_launch_date" in df.columns:
            df["creative_launch_date"] = pd.to_datetime(df["creative_launch_date"])
        rows = len(df)
        df.to_sql(table, engine, if_exists="append", index=False, method="multi", chunksize=5000)
        print(f"Loaded {rows} rows into {table}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
