"""Pluggable ranking: cheapest-first ordering and the unknown-ranker error."""

from types import SimpleNamespace

import pytest

from flights.ranking import rank_routes


def _route(city, total):
    # rank_routes only reads `.total_price` (duck-typed), so a stub is enough.
    return SimpleNamespace(city=city, total_price=total)


def test_by_price_orders_cheapest_first():
    routes = [_route("A", 400), _route("B", 200), _route("C", 350)]
    ranked = rank_routes(routes, "by_price")
    assert [r.city for r in ranked] == ["B", "C", "A"]


def test_unknown_ranker_raises_with_valid_names():
    with pytest.raises(ValueError) as exc:
        rank_routes([], "bogus_ranker")
    msg = str(exc.value)
    assert "bogus_ranker" in msg and "by_price" in msg
