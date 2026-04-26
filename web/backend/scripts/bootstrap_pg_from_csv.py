#!/usr/bin/env python3
"""Load CSVs from IMPORT_DATA_DIR into PostgreSQL (DATABASE_URL).

Applies web/db/schema.sql, then either full seed (when fact table is empty) or
backfill of empty dimension tables. Table names match CSV stems (merged CSVs use
logical table names campaigns / creatives).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from sqlalchemy import create_engine

from scripts.seed_common import (
    SEED_TABLE_ORDER,
    apply_schema,
    backfill_missing_tables,
    daily_count,
    drop_legacy_data_dictionary,
    load_one_table,
)


def _monorepo_root() -> Path:
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
    apply_schema(engine, schema_path)

    if drop_legacy_data_dictionary(engine):
        print("Dropped legacy table data_dictionary (not seeded)")

    with engine.connect() as conn:
        n = daily_count(conn)

    if n > 0:
        print(f"creative_daily_country_os_stats already has {n} rows; skip full load.")
        for table in backfill_missing_tables(engine, data_dir):
            print(f"Backfilling empty table {table}")
        return 0

    for table, fname in SEED_TABLE_ORDER:
        try:
            rows = load_one_table(engine, data_dir, table, fname)
        except FileNotFoundError as e:
            print(str(e), file=sys.stderr)
            return 1
        print(f"Loaded {rows} rows into {table}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
