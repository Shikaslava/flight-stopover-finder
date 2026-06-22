"""Pluggable route ranking.

Same idea as filters: a ranker is one function that returns a sort key for a route
(LOWER = better, so routes sort ascending). config.json names the active ranker.

v1 ships only `by_price`. Later rankers (soft-penalty scoring, LLM-taste blend) just add
a function + a registry line — the engine never changes.

Rankers use duck typing (they read `route.total_price` etc.), so this module imports
nothing from the engine and there's no circular dependency.
"""

from __future__ import annotations


def by_price(route) -> float:
    """Cheaper total A->C->B ranks higher."""
    return route.total_price


RANKERS = {
    "by_price": by_price,
}


def rank_routes(routes: list, ranker_name: str) -> list:
    """Return routes sorted best-first using the named ranker."""
    if ranker_name not in RANKERS:
        raise ValueError(
            f"Unknown ranker '{ranker_name}'. Valid rankers: {sorted(RANKERS)}"
        )
    return sorted(routes, key=RANKERS[ranker_name])
