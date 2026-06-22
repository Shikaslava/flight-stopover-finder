"""Pluggable flight-quality filters.

The whole point (per the build plan): we don't know which filters we'll ultimately want,
so filters are NOT hardcoded into the engine. Each filter is one small function in the
FILTERS registry, and config.json decides which are active and with what settings.

To add a filter:
  1. write a function `(flight, params, context) -> bool`  (True = keep / acceptable)
  2. add one line to the FILTERS dict below
  3. (optionally) reference it in config.json's "filters" list
The engine never changes.

Filter signature:
  flight  -- a flights.data.Flight
  params  -- this filter's settings from config, e.g. {"max": 1}
  context -- dict with extra info (e.g. {"leg": "A->C"}); unused by simple filters now,
             but lets future itinerary-level filters work without a signature change.
"""

from __future__ import annotations

from datetime import datetime

from .data import Flight


# --- individual filters -------------------------------------------------------

def max_stops(flight: Flight, params: dict, context: dict | None = None) -> bool:
    """Keep flights with at most params['max'] intermediate stops."""
    return flight.stops <= params["max"]


def earliest_departure(flight: Flight, params: dict, context: dict | None = None) -> bool:
    """Keep flights departing at or after params['not_before'] (local 'HH:MM')."""
    cutoff = datetime.strptime(params["not_before"], "%H:%M").time()
    return flight.departure_time.time() >= cutoff


def latest_departure(flight: Flight, params: dict, context: dict | None = None) -> bool:
    """Keep flights departing at or before params['not_after'] (local 'HH:MM')."""
    cutoff = datetime.strptime(params["not_after"], "%H:%M").time()
    return flight.departure_time.time() <= cutoff


def max_total_hours(flight: Flight, params: dict, context: dict | None = None) -> bool:
    """Keep flights whose door-to-door time is at most params['hours']."""
    return flight.total_duration_min <= params["hours"] * 60


def max_layover_hours(flight: Flight, params: dict, context: dict | None = None) -> bool:
    """Keep flights whose longest single layover is at most params['hours']."""
    longest = max(flight.layovers_min, default=0)
    return longest <= params["hours"] * 60


def no_overnight(flight: Flight, params: dict, context: dict | None = None) -> bool:
    """Drop itineraries that include an overnight flight segment.

    (Added to demonstrate extensibility: one function + one registry line, no engine edit.)
    """
    return not flight.overnight


# --- registry -----------------------------------------------------------------

FILTERS = {
    "max_stops": max_stops,
    "earliest_departure": earliest_departure,
    "latest_departure": latest_departure,
    "max_total_hours": max_total_hours,
    "max_layover_hours": max_layover_hours,
    "no_overnight": no_overnight,
}


# --- engine-facing helpers ----------------------------------------------------

def passes_all(flight: Flight, active_filters: list[dict], context: dict | None = None) -> bool:
    """True if `flight` passes every active filter. The engine calls only this."""
    for spec in active_filters:
        name = spec["name"]
        if name not in FILTERS:
            raise ValueError(
                f"Unknown filter '{name}'. Valid filters: {sorted(FILTERS)}"
            )
        if not FILTERS[name](flight, spec.get("params", {}), context):
            return False
    return True


def apply_filters(
    flights: list[Flight], active_filters: list[dict], context: dict | None = None
) -> list[Flight]:
    """Return only the flights that pass all active filters (order preserved)."""
    return [f for f in flights if passes_all(f, active_filters, context)]


if __name__ == "__main__":
    # Demo on the cached TBS->LIS data (no API call). Shows filtering in action.
    from dotenv import load_dotenv

    from .data import search_flights

    load_dotenv()
    flights = search_flights("TBS", "LIS", "2026-09-12")
    print(f"All flights: {len(flights)}")

    demos = [
        ("no filters", []),
        ("max_stops <= 0 (nonstop only)", [{"name": "max_stops", "params": {"max": 0}}]),
        ("depart >= 07:00", [{"name": "earliest_departure", "params": {"not_before": "07:00"}}]),
    ]
    for label, active in demos:
        kept = apply_filters(flights, active)
        cheapest = min(kept, key=lambda f: f.price, default=None)
        cheap = cheapest.price_display if cheapest else "—"
        print(f"  {label:<34} -> {len(kept):>2} kept, cheapest acceptable: {cheap}")
