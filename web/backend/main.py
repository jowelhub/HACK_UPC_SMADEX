"""Smadex hackathon v1 API: performance, fatigue, recommendations."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from modules.fatigue.ml_ctr import (
    FatigueMLArtifacts,
    compute_ml_health_by_creative,
    predict_ctr_for_creative,
    sse_pack,
    train_ctr_model_stream,
)
from modules.performance.service import PerformanceService
from modules.recommendations.service import RecommendationService
from shared.store import get_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    store = get_store()
    app.state.store = store
    app.state.fatigue_ctr_ml = None
    app.state.fatigue_ml_health = None
    app.state.performance = PerformanceService(store)
    app.state.recommendations = RecommendationService(store)
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


@app.get("/api/fatigue/creative-ids")
def fatigue_creative_ids(request: Request) -> dict[str, Any]:
    store = request.app.state.store
    ids = sorted(int(x) for x in store.daily_enriched["creative_id"].unique())
    return {"creative_ids": ids}


@app.get("/api/fatigue/ml/status")
def fatigue_ml_status(request: Request) -> dict[str, Any]:
    art = getattr(request.app.state, "fatigue_ctr_ml", None)
    if art is None:
        return {"trained": False}
    return {
        "trained": True,
        "best_params": art.best_params,
        "test_metrics": art.test_metrics,
        "n_features": len(art.feature_columns),
    }


@app.get("/api/fatigue/ml/train-stream")
def fatigue_ml_train_stream(
    request: Request,
    n_trials: int = Query(default=14, ge=1, le=100),
    cv_splits: int = Query(default=5, ge=1, le=10),
    test_frac: float = Query(default=0.15, ge=0.05, le=0.4),
) -> StreamingResponse:
    store = request.app.state.store
    artifacts_box: list[FatigueMLArtifacts] = []

    def event_iter():
        try:
            for ev in train_ctr_model_stream(
                store,
                test_frac=test_frac,
                cv_splits=cv_splits,
                n_trials=n_trials,
                artifacts_out=artifacts_box,
            ):
                yield sse_pack(ev)
        finally:
            if artifacts_box:
                art = artifacts_box[0]
                request.app.state.fatigue_ctr_ml = art
                request.app.state.fatigue_ml_health = compute_ml_health_by_creative(store, art)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_iter(), media_type="text/event-stream", headers=headers)


@app.get("/api/fatigue/ml/predict-curve/{creative_id}")
def fatigue_ml_predict_curve(creative_id: int, request: Request) -> dict[str, Any]:
    art = getattr(request.app.state, "fatigue_ctr_ml", None)
    if art is None:
        return {"creative_id": creative_id, "trained": False, "series": []}
    store = request.app.state.store
    series = predict_ctr_for_creative(store, art, creative_id)
    return {"creative_id": creative_id, "trained": True, "series": series}


class RecommendationsBody(BaseModel):
    filters: dict[str, Any] = Field(default_factory=dict)


@app.post("/api/recommendations/list")
def recommendations_list(body: RecommendationsBody, request: Request) -> dict[str, Any]:
    svc: RecommendationService = request.app.state.recommendations
    ml_health = getattr(request.app.state, "fatigue_ml_health", None)
    return {"items": svc.list_recommendations(body.filters, ml_health=ml_health)}
