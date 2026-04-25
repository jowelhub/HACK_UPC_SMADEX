"""Read-only SQL for the Smadex analytics agent. Only SELECT/CTE against Postgres."""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any

import sqlalchemy
from sqlalchemy import text


_BANNED_VERBS = re.compile(
    r"\b(insert|update|delete|drop|alter|truncate|create|replace|merge|copy|"
    r"grant|revoke|call|execute|set\s+role|set\s+session|prepare)\b",
    re.IGNORECASE | re.DOTALL,
)

_SUS = re.compile(
    r"\b(?:into\s+outfile|into\s+dumpfile|copy\s+\(|lo_import|dblink|pg_terminate_backend)\b",
    re.IGNORECASE | re.DOTALL,
)


def _serialize_cell(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (bytes, memoryview)):
        return "<bytes>"
    return v


def validate_readonly_select(sql: str) -> str:
    s = (sql or "").strip()
    if not s:
        raise ValueError("Query is empty.")
    t = s.rstrip()
    if t.endswith(";"):
        t = t[:-1].rstrip()
    if ";" in t:
        raise ValueError("Only one SQL statement is allowed (no multiple ;).")
    s = t
    u = s.lstrip()
    u_low = u.lower()
    if not (u_low.startswith("select") or u_low.startswith("with")):
        raise ValueError("Only SELECT (or WITH … SELECT) queries are allowed.")
    if _BANNED_VERBS.search(s):
        raise ValueError("That SQL operation is not allowed. Use only read-only queries.")
    if _SUS.search(s):
        raise ValueError("That SQL pattern is not allowed.")
    return s


def run_readonly_query(engine: sqlalchemy.engine.Engine, sql: str, *, max_rows: int) -> dict[str, Any]:
    q = validate_readonly_select(sql)
    cap = int(max(1, min(5000, max_rows)))
    with engine.begin() as conn:
        conn.execute(text("SET LOCAL statement_timeout = '20000'"))
        conn.execute(text("SET LOCAL default_transaction_read_only = on"))
        res = conn.execute(text(q))
        col_names: list[str] = list(res.keys())
        # Fetch at most cap+1 to detect over-limit without OOM
        first = res.fetchmany(cap + 1)
    if len(first) > cap:
        raise ValueError(
            f"Result exceeds the max row count ({cap}). Add WHERE/GROUP BY, LIMIT, or a narrower time window."
        )
    rows: list[dict[str, Any]] = []
    for r in first:
        m = r._mapping
        rows.append({k: _serialize_cell(v) for k, v in m.items()})
    return {
        "columns": col_names,
        "row_count": len(rows),
        "rows": rows,
    }
