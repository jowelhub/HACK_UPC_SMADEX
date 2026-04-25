"""Ensure PostgreSQL schema exists and CSV data is loaded when the fact table is empty.

Used by Docker entrypoint before uvicorn. Idempotent: safe on every container start.

Public tables match CSV basenames under IMPORT_DATA_DIR (see web/db/schema.sql).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, text

# (table_name, csv_filename) — same stem as data_science/data/*.csv
SEED_TABLE_ORDER: tuple[tuple[str, str], ...] = (
    ("advertisers", "advertisers.csv"),
    ("campaigns", "campaigns.csv"),
    ("creatives", "creatives.csv"),
    ("campaign_summary", "campaign_summary.csv"),
    ("creative_summary", "creative_summary.csv"),
    ("advertiser_campaign_rankings", "advertiser_campaign_rankings.csv"),
    ("creative_daily_country_os_stats", "creative_daily_country_os_stats.csv"),
)

# Tables appended when the fact table already has rows but these were added later / empty.
BACKFILL_TABLE_ORDER: tuple[tuple[str, str], ...] = (
    ("campaign_summary", "campaign_summary.csv"),
    ("creative_summary", "creative_summary.csv"),
    ("advertiser_campaign_rankings", "advertiser_campaign_rankings.csv"),
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


def _drop_legacy_data_dictionary(engine) -> None:
    """Remove glossary table if present (file remains on disk for notebooks; not loaded into Postgres)."""
    with engine.begin() as conn:
        if _table_exists(conn, "data_dictionary"):
            conn.execute(text("DROP TABLE IF EXISTS data_dictionary CASCADE"))
            print("[ensure_db_seeded] dropped legacy table data_dictionary", flush=True)


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
        "TRUNCATE TABLE creative_daily_country_os_stats, creative_summary, "
        "advertiser_campaign_rankings, campaign_summary, creatives, campaigns, "
        "advertisers RESTART IDENTITY CASCADE"
    )
    with engine.begin() as conn:
        conn.execute(stmt)


def _prepare_creative_summary_df(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["creative_launch_date"] = pd.to_datetime(df["creative_launch_date"])
    df["fatigue_day"] = df["fatigue_day"].astype("Int64")
    return df


def _load_one_table(engine, data_dir: Path, table: str, fname: str) -> int:
    path = data_dir / fname
    if not path.is_file():
        raise FileNotFoundError(f"Missing seed file: {path}")
    df = pd.read_csv(path)
    if "date" in df.columns and table == "creative_daily_country_os_stats":
        df["date"] = pd.to_datetime(df["date"])
    if table in ("campaigns", "campaign_summary"):
        df["start_date"] = pd.to_datetime(df["start_date"])
        df["end_date"] = pd.to_datetime(df["end_date"])
    if table == "creative_summary":
        df = _prepare_creative_summary_df(df)
    elif "creative_launch_date" in df.columns:
        df["creative_launch_date"] = pd.to_datetime(df["creative_launch_date"])
    rows = len(df)
    df.to_sql(table, engine, if_exists="append", index=False, method="multi", chunksize=5000)
    print(f"[ensure_db_seeded] loaded {rows} rows into {table}", flush=True)
    return rows


def _load_csv_tables(engine, data_dir: Path) -> None:
    for table, fname in SEED_TABLE_ORDER:
        _load_one_table(engine, data_dir, table, fname)


def _backfill_missing_tables(engine, data_dir: Path) -> None:
    """Append CSVs for dimension/summary tables when the fact table was seeded earlier."""
    for table, fname in BACKFILL_TABLE_ORDER:
        with engine.connect() as conn:
            if not _table_exists(conn, table):
                continue
            n = int(conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one())
        if n > 0:
            continue
        print(f"[ensure_db_seeded] backfilling empty table {table}", flush=True)
        _load_one_table(engine, data_dir, table, fname)


def _all_seed_tables_exist(conn) -> bool:
    return all(_table_exists(conn, t) for t, _ in SEED_TABLE_ORDER)


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
    _drop_legacy_data_dictionary(engine)

    with engine.connect() as conn:
        need_schema = not _all_seed_tables_exist(conn)

    if need_schema:
        print("[ensure_db_seeded] applying schema", flush=True)
        _apply_schema(engine, schema_file)

    with engine.connect() as conn:
        n = _daily_count(conn)

    if n > 0:
        print(f"[ensure_db_seeded] creative_daily_country_os_stats has {n} rows; skip full import", flush=True)
        _backfill_missing_tables(engine, data_dir)
        return

    print("[ensure_db_seeded] fact table empty; truncating (if any) and importing CSVs", flush=True)
    _truncate_all(engine)
    _load_csv_tables(engine, data_dir)

    with engine.connect() as conn:
        n2 = _daily_count(conn)
    print(f"[ensure_db_seeded] done; creative_daily_country_os_stats rows = {n2}", flush=True)


if __name__ == "__main__":
    run()
