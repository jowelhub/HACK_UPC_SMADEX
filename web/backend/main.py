"""Smadex hackathon v1 API: performance, fatigue, recommendations."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from modules.fatigue.service import FatigueService
from modules.performance.service import PerformanceService
from modules.recommendations.service import RecommendationService
from shared.store import get_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    store = get_store()
    fatigue = FatigueService(store)
    app.state.store = store
    app.state.fatigue = fatigue
    app.state.performance = PerformanceService(store)
    app.state.recommendations = RecommendationService(store, fatigue)
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


class FatigueSummaryBody(BaseModel):
    filters: dict[str, Any] = Field(default_factory=dict)


@app.post("/api/fatigue/summary")
def fatigue_summary(body: FatigueSummaryBody, request: Request) -> dict[str, Any]:
    svc: FatigueService = request.app.state.fatigue
    return {"items": svc.summary(body.filters)}


@app.get("/api/fatigue/curve/{creative_id}")
def fatigue_curve(creative_id: int, request: Request) -> dict[str, Any]:
    svc: FatigueService = request.app.state.fatigue
    return {"creative_id": creative_id, "series": svc.curve(creative_id)}


class RecommendationsBody(BaseModel):
    filters: dict[str, Any] = Field(default_factory=dict)


@app.post("/api/recommendations/list")
def recommendations_list(body: RecommendationsBody, request: Request) -> dict[str, Any]:
    svc: RecommendationService = request.app.state.recommendations
    return {"items": svc.list_recommendations(body.filters)}
