"""Shared helpers for PostgreSQL schema setup and CSV seeding."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
from sqlalchemy import text

# (table_name, csv_filename) — load order respects FKs
SEED_TABLE_ORDER: tuple[tuple[str, str], ...] = (
    ("advertisers", "advertisers.csv"),
    ("campaigns", "campaigns_merged.csv"),
    ("creatives", "creative_merged.csv"),
    ("creative_daily_country_os_stats", "creative_daily_country_os_stats.csv"),
    ("creative_health_scores", "creative_health_scores.csv"),
)

BACKFILL_TABLE_ORDER: tuple[tuple[str, str], ...] = (
    ("campaigns", "campaigns_merged.csv"),
    ("creatives", "creative_merged.csv"),
    ("creative_health_scores", "creative_health_scores.csv"),
)


def table_exists(conn, name: str) -> bool:
    q = text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_name = :n)"
    )
    return bool(conn.execute(q, {"n": name}).scalar_one())


def column_exists(conn, table: str, column: str) -> bool:
    q = text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = :t AND column_name = :c)"
    )
    return bool(conn.execute(q, {"t": table, "c": column}).scalar_one())


def daily_count(conn) -> int:
    return int(conn.execute(text("SELECT COUNT(*) FROM creative_daily_country_os_stats")).scalar_one())


def drop_legacy_data_dictionary(engine) -> bool:
    """Drop glossary table if present (it is docs-only, never queried by API)."""
    with engine.begin() as conn:
        if not table_exists(conn, "data_dictionary"):
            return False
        conn.execute(text("DROP TABLE IF EXISTS data_dictionary CASCADE"))
    return True


def apply_schema(engine, schema_file: Path) -> None:
    sql = schema_file.read_text(encoding="utf-8")
    with engine.begin() as conn:
        for stmt in sql.split(";"):
            s = stmt.strip()
            if s:
                conn.execute(text(s))


def legacy_split_schema(conn) -> bool:
    """True if DB was created before merged CSV schema (summary/rankings tables)."""
    if table_exists(conn, "advertiser_campaign_rankings"):
        return True
    if table_exists(conn, "campaign_summary"):
        return True
    if table_exists(conn, "creative_summary"):
        return True
    if table_exists(conn, "campaigns") and not column_exists(conn, "campaigns", "total_spend_usd"):
        return True
    if table_exists(conn, "creatives") and not column_exists(conn, "creatives", "creative_status"):
        return True
    return False


def drop_seed_tables_for_rebuild(conn) -> None:
    """Drop legacy + current seeded tables in FK-safe order."""
    for table in (
        "creative_health_scores",
        "creative_daily_country_os_stats",
        "advertiser_campaign_rankings",
        "creative_summary",
        "campaign_summary",
        "creatives",
        "campaigns",
        "advertisers",
    ):
        conn.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))


def truncate_seed_tables(engine) -> None:
    """Clear all seeded tables before a full reload."""
    stmt = text(
        "TRUNCATE TABLE creative_health_scores, creative_daily_country_os_stats, "
        "creatives, campaigns, advertisers RESTART IDENTITY CASCADE"
    )
    with engine.begin() as conn:
        conn.execute(stmt)


def prepare_creatives_df(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["creative_launch_date"] = pd.to_datetime(out["creative_launch_date"])
    out["fatigue_day"] = out["fatigue_day"].astype("Int64")
    return out


def prepare_df_for_table(df: pd.DataFrame, table: str) -> pd.DataFrame:
    if table == "creative_daily_country_os_stats" and "date" in df.columns:
        df = df.copy()
        df["date"] = pd.to_datetime(df["date"])
    if table == "campaigns":
        df = df.copy()
        df["start_date"] = pd.to_datetime(df["start_date"])
        df["end_date"] = pd.to_datetime(df["end_date"])
    if table == "creatives":
        return prepare_creatives_df(df)
    if "creative_launch_date" in df.columns:
        df = df.copy()
        df["creative_launch_date"] = pd.to_datetime(df["creative_launch_date"])
    return df


def load_one_table(engine, data_dir: Path, table: str, fname: str, *, chunksize: int = 5000) -> int:
    path = data_dir / fname
    if not path.is_file():
        raise FileNotFoundError(f"Missing seed file: {path}")
    df = pd.read_csv(path)
    df = prepare_df_for_table(df, table)
    rows = len(df)
    df.to_sql(table, engine, if_exists="append", index=False, method="multi", chunksize=chunksize)
    return rows


def all_seed_tables_exist(conn) -> bool:
    return all(table_exists(conn, table) for table, _ in SEED_TABLE_ORDER)


def backfill_missing_tables(engine, data_dir: Path) -> list[str]:
    """Append CSVs for empty dimension tables when fact table already exists."""
    loaded: list[str] = []
    for table, fname in BACKFILL_TABLE_ORDER:
        with engine.connect() as conn:
            if not table_exists(conn, table):
                continue
            n = int(conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one())
        if n > 0:
            continue
        load_one_table(engine, data_dir, table, fname)
        loaded.append(table)
    return loaded