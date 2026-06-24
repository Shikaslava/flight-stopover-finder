"""FastAPI backend for the Detour web app — wraps the existing flights engine over HTTP.

Run from the project root (so the .cache/ and config.json paths resolve):
    .venv/bin/uvicorn api.main:app --reload --port 8000
Interactive test UI: http://localhost:8000/docs

This file contains NO business logic — it reuses flights.engine / flights.render /
flights.candidates. API keys stay server-side (loaded from .env); the browser only ever
talks to this server, never to SerpApi/FreeLLMAPI directly.
"""

from __future__ import annotations

import json
from pathlib import Path

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from flights.candidates import _llm_candidates
from flights.engine import find_stopovers
from flights.render import result_to_dict

# Load SERPAPI_KEY / FREELLMAPI_* from the project's .env (does not override real env vars).
load_dotenv()

# Defaults (currency, ranker, min_nights, llm_model) come from config.json.
CONFIG = json.loads((Path(__file__).resolve().parent.parent / "config.json").read_text())

app = FastAPI(title="Detour API", version="1.0")

# The Next.js dev server runs on :3000 and must be allowed to call this API from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- request models -----------------------------------------------------------

class Filters(BaseModel):
    nonstop_only: bool = False
    depart_after_7: bool = False
    no_overnight: bool = False


class SearchRequest(BaseModel):
    origin: str
    destination: str
    depart_date: str                 # "YYYY-MM-DD"
    arrive_by: str | None = None     # "YYYY-MM-DD"
    min_nights: int | None = None    # defaults to config
    candidates: list[str] = []       # IATA codes to test as stopovers
    filters: Filters = Filters()


class SuggestRequest(BaseModel):
    origin: str
    destination: str
    message: str                     # the traveler's taste, e.g. "food, walkable, sea"
    count: int = 5


# --- helpers ------------------------------------------------------------------

def _build_filters(f: Filters) -> list[dict]:
    """Map the UI's filter toggles onto the engine's filter registry (flights/filters.py)."""
    active: list[dict] = []
    if f.nonstop_only:
        active.append({"name": "max_stops", "params": {"max": 0}})
    if f.depart_after_7:
        active.append({"name": "earliest_departure", "params": {"not_before": "07:00"}})
    if f.no_overnight:
        active.append({"name": "no_overnight", "params": {}})
    return active


# --- endpoints ----------------------------------------------------------------

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/search")
def search(req: SearchRequest) -> dict:
    """Price A->B and each A->C->B candidate; return baseline + ranked routes + skipped."""
    candidates = [c.strip().upper() for c in req.candidates if c.strip()]
    if not candidates:
        raise HTTPException(status_code=400, detail="Provide at least one candidate city.")

    min_nights = req.min_nights if req.min_nights is not None else CONFIG.get("min_nights_in_C", 3)
    try:
        result = find_stopovers(
            req.origin.upper(), req.destination.upper(), req.depart_date, candidates,
            min_nights=min_nights,
            currency=CONFIG.get("currency", "USD"),
            arrive_by=req.arrive_by,
            filters=_build_filters(req.filters),
            ranker=CONFIG.get("ranker", "by_price"),
        )
    except (RuntimeError, ValueError, requests.RequestException) as e:
        # e.g. missing/invalid key, SerpApi/network error, unknown filter.
        raise HTTPException(status_code=502, detail=str(e))

    return result_to_dict(result)


@app.post("/suggest-cities")
def suggest_cities(req: SuggestRequest) -> dict:
    """LLM taste-advisor: propose candidate stopover cities between origin and destination."""
    try:
        cities = _llm_candidates(
            req.origin.upper(), req.destination.upper(), req.message, req.count,
            CONFIG.get("llm_model", "gemini-2.5-flash"),
        )
    except (RuntimeError, ValueError, requests.RequestException) as e:
        # e.g. invalid/expired FreeLLMAPI key, LLM router down — clean 502, not a 500.
        raise HTTPException(status_code=502, detail=f"LLM advisor unavailable: {e}")

    return {"cities": cities}
