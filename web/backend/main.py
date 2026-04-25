"""Smadex hackathon API: performance metrics and creative assets."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from modules.performance.service import PerformanceService
from modules.agent.sql_readonly import run_readonly_query
from shared.store import get_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    store = get_store()
    app.state.store = store
    app.state.performance = PerformanceService(store)
    yield


def _cors_origins() -> list[str]:
    base = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ]
    extra = os.environ.get("SMADEX_CORS_ORIGINS", "")
    if extra.strip():
        base.extend([o.strip() for o in extra.split(",") if o.strip()])
    return list(dict.fromkeys(base))


app = FastAPI(title="Smadex Creative Intelligence API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PerformanceQueryBody(BaseModel):
    filters: dict[str, Any] = Field(default_factory=dict)
    timeseries_grain: str | None = None
    breakdown: str | None = None
    leaderboard: dict[str, Any] | None = None
    include_entity_rankings: bool = False


class FilterOptionsBody(BaseModel):
    filters: dict[str, Any] = Field(default_factory=dict)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/performance/query")
def performance_query(body: PerformanceQueryBody, request: Request) -> dict[str, Any]:
    svc: PerformanceService = request.app.state.performance
    return svc.query(body.model_dump())


@app.post("/api/performance/filter-options")
def performance_filter_options(body: FilterOptionsBody, request: Request) -> dict[str, Any]:
    svc: PerformanceService = request.app.state.performance
    return {"options": svc.filter_options(body.filters)}


@app.get("/api/performance/hierarchy")
def performance_hierarchy(request: Request) -> dict[str, Any]:
    svc: PerformanceService = request.app.state.performance
    return svc.hierarchy()


@app.get("/api/creatives/{creative_id}/asset")
def creative_asset_file(creative_id: int, request: Request) -> FileResponse:
    store = request.app.state.store
    row = store.creatives[store.creatives["creative_id"] == creative_id]
    if len(row) == 0:
        raise HTTPException(status_code=404, detail="Creative not found")
    rel = row.iloc[0].get("asset_file")
    if rel is None or (isinstance(rel, float) and pd.isna(rel)) or not str(rel).strip():
        raise HTTPException(status_code=404, detail="No asset path")
    base = os.environ.get("IMPORT_DATA_DIR", "").strip()
    if not base:
        raise HTTPException(status_code=503, detail="IMPORT_DATA_DIR not configured")
    path = Path(base) / str(rel).lstrip("/")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Asset file not found on server")
    return FileResponse(str(path), media_type="image/png")


class AgentSqlBody(BaseModel):
    sql: str = Field(min_length=1, max_length=200_000)


def _check_agent_sql_token(request: Request) -> None:
    expected = os.environ.get("AGENT_SQL_TOKEN", "").strip()
    if not expected:
        return
    got = request.headers.get("X-Agent-Token", "").strip()
    if got != expected:
        raise HTTPException(status_code=403, detail="Invalid or missing X-Agent-Token for agent SQL.")


@app.post("/api/agent/sql")
def agent_readonly_sql(body: AgentSqlBody, request: Request) -> dict[str, Any]:
    """
    Read-only SQL for the analytics agent (executed in Postgres with row limits).
    Optional shared secret: set AGENT_SQL_TOKEN and pass X-Agent-Token from the agent service.
    """
    _check_agent_sql_token(request)
    store = request.app.state.store
    max_rows = 3000
    try:
        return run_readonly_query(store.engine, body.sql, max_rows=max_rows)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail="SQL execution failed") from e
