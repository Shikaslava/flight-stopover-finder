"""The search engine: find A -> C -> B routes cheaper than direct A -> B.

This module is PURE logic. It does not print and does not call SerpApi directly — it
asks the data layer for flights, applies filters, ranks survivors, and returns a
structured result object. Renderers (render.py) turn that object into output.

v1 date model (deliberately simple, quota-friendly):
- You leave A on a single `depart_date`.
- You stay in C for `min_nights`, so the C->B leg departs `depart_date + min_nights`.
- Optional `arrive_by`: drop any C->B that lands after this date.
Searching a whole depart-window or a range of stay lengths is a future enhancement — it's
just more dates looped here, no architectural change.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from .data import Flight, search_flights
from .filters import apply_filters
from .ranking import rank_routes


@dataclass
class StopoverRoute:
    city: str
    leg1: Flight
    leg2: Flight
    stay_nights: int
    baseline_price: float
    currency: str

    @property
    def total_price(self) -> float:
        return self.leg1.price + self.leg2.price

    @property
    def savings(self) -> float:
        return self.baseline_price - self.total_price

    @property
    def savings_pct(self) -> float:
        return 100 * self.savings / self.baseline_price if self.baseline_price else 0.0


@dataclass
class SearchResult:
    origin: str
    destination: str
    depart_date: str
    currency: str
    baseline: Flight | None                       # cheapest acceptable direct A->B
    routes: list[StopoverRoute] = field(default_factory=list)   # cheaper, ranked
    skipped: list[tuple[str, str]] = field(default_factory=list)  # (city, reason)


def _cheapest_acceptable(
    flights: list[Flight], active_filters: list[dict], context: dict
) -> Flight | None:
    """Filter then return the lowest-price survivor, or None."""
    kept = apply_filters(flights, active_filters, context)
    return min(kept, key=lambda f: f.price, default=None)


def find_stopovers(
    origin: str,
    destination: str,
    depart_date: str,
    candidates: list[str],
    *,
    min_nights: int,
    currency: str = "USD",
    arrive_by: str | None = None,
    filters: list[dict] | None = None,
    ranker: str = "by_price",
    api_key: str | None = None,
    use_cache: bool = True,
) -> SearchResult:
    filters = filters or []
    arrive_by_date = date.fromisoformat(arrive_by) if arrive_by else None

    def search(o, d, day):
        return search_flights(o, d, day, currency=currency,
                              api_key=api_key, use_cache=use_cache)

    # 1. Baseline: cheapest acceptable direct A -> B on the depart date.
    baseline = _cheapest_acceptable(
        search(origin, destination, depart_date), filters, {"leg": "A->B"}
    )

    result = SearchResult(
        origin=origin, destination=destination, depart_date=depart_date,
        currency=currency, baseline=baseline,
    )

    # 2. For each candidate stopover city C, price A->C and C->B.
    #    A lookup error on one city (API/network) must not abort the whole run — record it
    #    as skipped and move on.
    for city in candidates:
        if city in (origin, destination):
            result.skipped.append((city, "same as origin/destination"))
            continue

        try:
            leg1 = _cheapest_acceptable(
                search(origin, city, depart_date), filters, {"leg": "A->C"}
            )
            if leg1 is None:
                result.skipped.append((city, "no acceptable A->C flight"))
                continue

            # Count min_nights from ARRIVAL in C (not departure from A), so an overnight
            # A->C flight doesn't silently shorten the stay below the requested minimum.
            leg2_date = (leg1.arrival_time.date() + timedelta(days=min_nights)).isoformat()
            leg2_flights = search(city, destination, leg2_date)
            if arrive_by_date is not None:
                leg2_flights = [f for f in leg2_flights
                                if f.arrival_time.date() <= arrive_by_date]
            leg2 = _cheapest_acceptable(leg2_flights, filters, {"leg": "C->B"})
            if leg2 is None:
                result.skipped.append((city, "no acceptable C->B flight"))
                continue
        except Exception as e:  # API/network error for THIS city — skip, don't abort
            result.skipped.append((city, f"lookup failed: {e}"))
            continue

        stay_nights = (leg2.departure_time.date() - leg1.arrival_time.date()).days
        route = StopoverRoute(
            city=city, leg1=leg1, leg2=leg2, stay_nights=stay_nights,
            baseline_price=baseline.price if baseline else float("inf"),
            currency=currency,
        )

        # 3. Keep only routes that beat the direct baseline.
        if baseline is not None and route.total_price < baseline.price:
            result.routes.append(route)
        else:
            result.skipped.append((city, "not cheaper than direct"))

    # 4. Rank the surviving routes (best first).
    result.routes = rank_routes(result.routes, ranker)
    return result


if __name__ == "__main__":
    # End-to-end demo using config.json + .env.
    import json

    from dotenv import load_dotenv

    load_dotenv()
    cfg = json.load(open("config.json"))
    res = find_stopovers(
        "TBS", "LIS", "2026-09-12", cfg["candidates"],
        min_nights=cfg["min_nights_in_C"], currency=cfg["currency"],
        filters=cfg["filters"], ranker=cfg["ranker"],
    )

    base = res.baseline.price_display if res.baseline else "—"
    print(f"Baseline {res.origin}->{res.destination} on {res.depart_date}: {base}\n")
    if res.routes:
        print("Cheaper via a stopover:")
        for r in res.routes:
            print(f"  via {r.city}: {r.total_price:.0f} {r.currency} "
                  f"(save {r.savings:.0f}, {r.savings_pct:.0f}%)  "
                  f"stay {r.stay_nights} nts  "
                  f"[{r.leg1.price:.0f} + {r.leg2.price:.0f}]")
    else:
        print("No stopover beat the direct route.")
    if res.skipped:
        print("\nSkipped:")
        for city, reason in res.skipped:
            print(f"  {city}: {reason}")
