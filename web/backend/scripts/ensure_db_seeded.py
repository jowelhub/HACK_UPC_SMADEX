"""Ensure PostgreSQL schema exists and CSV data is loaded when the fact table is empty.

Used by Docker entrypoint before uvicorn. Idempotent: safe on every container start.

Public tables match CSV basenames under IMPORT_DATA_DIR (see web/db/schema.sql).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from sqlalchemy import create_engine

from scripts.seed_common import (
    SEED_TABLE_ORDER,
    all_seed_tables_exist,
    apply_schema,
    backfill_missing_tables,
    daily_count,
    drop_legacy_data_dictionary,
    drop_seed_tables_for_rebuild,
    legacy_split_schema,
    load_one_table,
    truncate_seed_tables,
)


def _schema_path() -> Path:
    env = os.environ.get("SCHEMA_SQL_PATH", "").strip()
    if env:
        return Path(env).resolve()
    backend_root = Path(__file__).resolve().parents[1]
    bundled = backend_root / "db" / "schema.sql"
    if bundled.is_file():
        return bundled
    return Path(__file__).resolve().parents[2] / "db" / "schema.sql"


def _import_dir() -> Path:
    return Path(os.environ.get("IMPORT_DATA_DIR", "/import")).resolve()


def _load_csv_tables(engine, data_dir: Path) -> None:
    for table, fname in SEED_TABLE_ORDER:
        rows = load_one_table(engine, data_dir, table, fname)
        print(f"[ensure_db_seeded] loaded {rows} rows into {table}", flush=True)


def run() -> None:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        print("DATABASE_URL is required", file=sys.stderr)
        raise SystemExit(1)

    schema_file = _schema_path()
    if not schema_file.is_file():
        print(f"Schema file not found: {schema_file}", file=sys.stderr)
        raise SystemExit(1)

    data_dir = _import_dir()
    if not data_dir.is_dir():
        print(f"IMPORT_DATA_DIR is not a directory: {data_dir}", file=sys.stderr)
        raise SystemExit(1)

    engine = create_engine(url, pool_pre_ping=True)
    if drop_legacy_data_dictionary(engine):
        print("[ensure_db_seeded] dropped legacy table data_dictionary", flush=True)

    force_rebuild_schema = False
    with engine.connect() as conn:
        if legacy_split_schema(conn):
            print("[ensure_db_seeded] legacy split schema detected; rebuilding merged tables", flush=True)
            force_rebuild_schema = True

    if force_rebuild_schema:
        with engine.begin() as conn:
            drop_seed_tables_for_rebuild(conn)
        apply_schema(engine, schema_file)

    with engine.connect() as conn:
        need_schema = not all_seed_tables_exist(conn)

    if need_schema:
        print("[ensure_db_seeded] applying schema", flush=True)
        apply_schema(engine, schema_file)

    with engine.connect() as conn:
        n = daily_count(conn)

    if n > 0 and not force_rebuild_schema:
        print(f"[ensure_db_seeded] creative_daily_country_os_stats has {n} rows; skip full import", flush=True)
        loaded = backfill_missing_tables(engine, data_dir)
        for table in loaded:
            print(f"[ensure_db_seeded] backfilled empty table {table}", flush=True)
        return

    print("[ensure_db_seeded] fact table empty or schema rebuilt; truncating (if any) and importing CSVs", flush=True)
    truncate_seed_tables(engine)
    _load_csv_tables(engine, data_dir)

    with engine.connect() as conn:
        n2 = daily_count(conn)
    print(f"[ensure_db_seeded] done; creative_daily_country_os_stats rows = {n2}", flush=True)


if __name__ == "__main__":
    run()
