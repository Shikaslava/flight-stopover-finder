"""Renderers: turn a SearchResult into (a) a terminal table and (b) a JSON file.

Per the build plan, the engine returns structured data and never prints. All presentation
lives here, so adding future output channels (email, web) means adding a renderer, not
touching the engine.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from .data import Flight
from .engine import SearchResult, StopoverRoute


# --- helpers ------------------------------------------------------------------

def _hm(total_min: int) -> str:
    """500 -> '8h20'."""
    return f"{total_min // 60}h{total_min % 60:02d}"


def _leg_summary(f: Flight) -> str:
    stops = "nonstop" if f.stops == 0 else f"{f.stops} stop"
    return (f"{f.origin}→{f.destination} {f.departure_time:%b %d %H:%M} "
            f"· {stops} · {_hm(f.total_duration_min)}")


# --- terminal table -----------------------------------------------------------

def render_table(result: SearchResult) -> str:
    lines: list[str] = []

    if result.baseline is None:
        lines.append(f"Baseline {result.origin}→{result.destination} on "
                     f"{result.depart_date}: no acceptable direct flight found.")
    else:
        b = result.baseline
        lines.append(f"Baseline: {result.origin}→{result.destination} direct   "
                     f"{b.price_display}   {_leg_summary(b)}")

    lines.append("")
    if result.routes:
        lines.append("Cheaper via a stopover (ranked):")
        for r in result.routes:
            lines.append(
                f"  via {r.city}   {r.total_price:.0f} {r.currency}   "
                f"save {r.savings:.0f} ({r.savings_pct:.0f}%)   stay {r.stay_nights} nts"
            )
            lines.append(f"        {_leg_summary(r.leg1)}   [{r.leg1.price:.0f}]")
            lines.append(f"        {_leg_summary(r.leg2)}   [{r.leg2.price:.0f}]")
    else:
        lines.append("No stopover beat the direct route.")

    if result.skipped:
        lines.append("")
        lines.append("Skipped:")
        for city, reason in result.skipped:
            lines.append(f"  {city}: {reason}")

    return "\n".join(lines)


# --- JSON output --------------------------------------------------------------

def _flight_to_dict(f: Flight) -> dict:
    return {
        "origin": f.origin,
        "destination": f.destination,
        "price": f.price,
        "currency": f.currency,
        "departure_time": f.departure_time.isoformat(),
        "arrival_time": f.arrival_time.isoformat(),
        "stops": f.stops,
        "total_duration_min": f.total_duration_min,
        "layovers_min": f.layovers_min,
        "carriers": f.carriers,
        "overnight": f.overnight,
        "booking_token": f.booking_token,
    }


def _route_to_dict(r: StopoverRoute) -> dict:
    return {
        "city": r.city,
        "total_price": r.total_price,
        "savings": r.savings,
        "savings_pct": round(r.savings_pct, 1),
        "stay_nights": r.stay_nights,
        "leg1": _flight_to_dict(r.leg1),
        "leg2": _flight_to_dict(r.leg2),
    }


def result_to_dict(result: SearchResult) -> dict:
    return {
        "origin": result.origin,
        "destination": result.destination,
        "depart_date": result.depart_date,
        "currency": result.currency,
        "baseline": _flight_to_dict(result.baseline) if result.baseline else None,
        "routes": [_route_to_dict(r) for r in result.routes],
        "skipped": [{"city": c, "reason": why} for c, why in result.skipped],
    }


def write_json(result: SearchResult, results_dir: str = "results") -> Path:
    """Write the result as results/<timestamp>.json and return the path."""
    Path(results_dir).mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = Path(results_dir) / f"{result.origin}-{result.destination}-{stamp}.json"
    path.write_text(json.dumps(result_to_dict(result), indent=2))
    return path


if __name__ == "__main__":
    import json as _json

    from dotenv import load_dotenv

    from .engine import find_stopovers

    load_dotenv()
    cfg = _json.load(open("config.json"))
    res = find_stopovers(
        "TBS", "LIS", "2026-09-12", cfg["candidates"],
        min_nights=cfg["min_nights_in_C"], currency=cfg["currency"],
        filters=cfg["filters"], ranker=cfg["ranker"],
    )
    print(render_table(res))
    out = write_json(res)
    print(f"\nSaved results to {out}")
