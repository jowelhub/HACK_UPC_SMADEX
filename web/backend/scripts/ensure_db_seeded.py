"""Ensure PostgreSQL schema exists and CSV data is loaded when the fact table is empty.

Used by Docker entrypoint before uvicorn. Idempotent: safe on every container start.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, text


def _schema_path() -> Path:
    env = os.environ.get("SCHEMA_SQL_PATH", "").strip()
    if env:
        return Path(env).resolve()
    # Docker image: schema at /app/db/schema.sql (WORKDIR = backend root)
    backend_root = Path(__file__).resolve().parents[1]
    bundled = backend_root / "db" / "schema.sql"
    if bundled.is_file():
        return bundled
    # Monorepo checkout: web/db/schema.sql
    return Path(__file__).resolve().parents[2] / "db" / "schema.sql"


def _import_dir() -> Path:
    return Path(os.environ.get("IMPORT_DATA_DIR", "/import")).resolve()


def _apply_schema(engine, schema_file: Path) -> None:
    sql = schema_file.read_text(encoding="utf-8")
    with engine.begin() as conn:
        for stmt in sql.split(";"):
            s = stmt.strip()
            if s:
                conn.execute(text(s))


def _table_exists(conn, name: str) -> bool:
    q = text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_name = :n)"
    )
    return bool(conn.execute(q, {"n": name}).scalar_one())


def _daily_count(conn) -> int:
    return int(conn.execute(text("SELECT COUNT(*) FROM creative_daily_country_os_stats")).scalar_one())


def _truncate_all(engine) -> None:
    stmt = text(
        "TRUNCATE TABLE creative_daily_country_os_stats, creative_summary, creatives, "
        "campaigns, advertisers RESTART IDENTITY CASCADE"
    )
    with engine.begin() as conn:
        conn.execute(stmt)


def _load_csv_tables(engine, data_dir: Path) -> None:
    load_order = [
        ("advertisers", "advertisers.csv"),
        ("campaigns", "campaigns.csv"),
        ("creatives", "creatives.csv"),
        ("creative_daily_country_os_stats", "creative_daily_country_os_stats.csv"),
        ("creative_summary", "creative_summary.csv"),
    ]
    for table, fname in load_order:
        path = data_dir / fname
        if not path.is_file():
            raise FileNotFoundError(f"Missing seed file: {path}")
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

    with engine.connect() as conn:
        need_schema = not _table_exists(conn, "advertisers") or not _table_exists(
            conn, "creative_daily_country_os_stats"
        )
    if need_schema:
        print("[ensure_db_seeded] applying schema", flush=True)
        _apply_schema(engine, schema_file)

    with engine.connect() as conn:
        n = _daily_count(conn)

    if n > 0:
        print(f"[ensure_db_seeded] creative_daily_country_os_stats has {n} rows; skip import", flush=True)
        return

    print("[ensure_db_seeded] fact table empty; truncating (if any) and importing CSVs", flush=True)
    _truncate_all(engine)
    _load_csv_tables(engine, data_dir)

    with engine.connect() as conn:
        n2 = _daily_count(conn)
    print(f"[ensure_db_seeded] done; creative_daily_country_os_stats rows = {n2}", flush=True)


if __name__ == "__main__":
    run()
