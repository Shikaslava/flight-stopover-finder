"""Data layer: talk to SerpApi's Google Flights API and return clean flight objects.

This is the ONLY module that knows about SerpApi's JSON shape. Everything else
(filters, engine, ranking) works with our own `Flight` object, so swapping the data
provider later means changing only this file.

Two practical things baked in here, per the build plan:
- **Fetch a LIST, then filter** — we return every option, not just the cheapest, because
  the cheapest might be dropped by a filter later.
- **Response cache** — each raw API reply is saved under .cache/. Repeat searches read
  the file instead of calling the API. This saves our free-tier quota and lets the engine
  be tested offline.

Timezone note: SerpApi returns local clock times without a UTC offset (e.g.
"2026-09-12 04:35"). We parse them as naive *local* datetimes. That's intentional for v1:
a traveler reasons in local time ("I land at 06:30, I leave 3 days later at 09:00"), and
true tz-awareness would require an airport->timezone table we don't need yet.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import requests

SERPAPI_URL = "https://serpapi.com/search.json"
CACHE_DIR = Path(".cache")
_TIME_FMT = "%Y-%m-%d %H:%M"


@dataclass
class Flight:
    """One normalized one-way itinerary (A -> B), possibly with intermediate stops."""

    origin: str
    destination: str
    price: float
    currency: str
    departure_time: datetime          # naive local time at the origin
    arrival_time: datetime            # naive local time at the destination
    stops: int                        # number of intermediate stops (0 = nonstop)
    total_duration_min: int           # door-to-door minutes
    layovers_min: list[int] = field(default_factory=list)
    carriers: list[str] = field(default_factory=list)
    overnight: bool = False
    booking_token: str | None = None

    @property
    def price_display(self) -> str:
        return f"{self.price:.0f} {self.currency}"


def _parse_time(raw: str) -> datetime:
    """Parse SerpApi's 'YYYY-MM-DD HH:MM' local time into a naive datetime."""
    return datetime.strptime(raw, _TIME_FMT)


def _option_to_flight(option: dict, origin: str, destination: str, currency: str) -> Flight:
    """Convert one SerpApi flight option (best_/other_flights item) into a Flight."""
    segments = option.get("flights", [])
    first, last = segments[0], segments[-1]
    carriers = sorted({seg.get("airline", "?") for seg in segments})
    return Flight(
        origin=origin,
        destination=destination,
        price=float(option.get("price", 0)),
        currency=currency,
        departure_time=_parse_time(first["departure_airport"]["time"]),
        arrival_time=_parse_time(last["arrival_airport"]["time"]),
        stops=len(segments) - 1,
        total_duration_min=int(option.get("total_duration", 0)),
        layovers_min=[int(lo.get("duration", 0)) for lo in option.get("layovers", [])],
        carriers=carriers,
        overnight=any(seg.get("overnight") for seg in segments),
        booking_token=option.get("booking_token"),
    )


def _cache_path(origin: str, destination: str, outbound_date: str, currency: str) -> Path:
    return CACHE_DIR / f"{origin}_{destination}_{outbound_date}_{currency}.json"


def _fetch_raw(
    origin: str,
    destination: str,
    outbound_date: str,
    currency: str,
    api_key: str,
    use_cache: bool = True,
) -> dict:
    """Return the raw SerpApi JSON, using the on-disk cache when available."""
    cache_file = _cache_path(origin, destination, outbound_date, currency)
    if use_cache and cache_file.exists():
        return json.loads(cache_file.read_text())

    resp = requests.get(
        SERPAPI_URL,
        params={
            "engine": "google_flights",
            "departure_id": origin,
            "arrival_id": destination,
            "outbound_date": outbound_date,
            "type": "2",            # one-way
            "currency": currency,
            "hl": "en",
            "api_key": api_key,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"SerpApi error for {origin}->{destination} {outbound_date}: "
                           f"{data['error']}")

    CACHE_DIR.mkdir(exist_ok=True)
    cache_file.write_text(json.dumps(data, indent=2))
    return data


def search_flights(
    origin: str,
    destination: str,
    outbound_date: str,
    *,
    currency: str = "USD",
    api_key: str | None = None,
    use_cache: bool = True,
) -> list[Flight]:
    """Search one-way flights and return ALL options as normalized Flight objects.

    `outbound_date` is 'YYYY-MM-DD'. Returns [] if the route/date has no results.
    """
    api_key = api_key or os.getenv("SERPAPI_KEY", "").strip()
    if not api_key:
        raise RuntimeError("No SerpApi key. Set SERPAPI_KEY in .env.")

    data = _fetch_raw(origin, destination, outbound_date, currency, api_key, use_cache)
    options = data.get("best_flights", []) + data.get("other_flights", [])
    return [_option_to_flight(o, origin, destination, currency) for o in options]


if __name__ == "__main__":
    # Quick manual check: .venv/bin/python -m flights.data
    from dotenv import load_dotenv

    load_dotenv()
    flights = search_flights("TBS", "LIS", "2026-09-12")
    print(f"Got {len(flights)} flights for TBS->LIS on 2026-09-12\n")
    for f in sorted(flights, key=lambda x: x.price)[:5]:
        print(f"  {f.price_display:>10}  {f.stops} stop(s)  "
              f"dep {f.departure_time:%H:%M}  {f.total_duration_min} min  "
              f"{'/'.join(f.carriers)}")
