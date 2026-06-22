"""Pluggable filters: each predicate, AND-composition, and the unknown-name error."""

from datetime import datetime

import pytest

from flights.filters import apply_filters, passes_all


def test_max_stops(flight):
    assert passes_all(flight(stops=0), [{"name": "max_stops", "params": {"max": 0}}])
    assert not passes_all(flight(stops=1), [{"name": "max_stops", "params": {"max": 0}}])
    assert passes_all(flight(stops=1), [{"name": "max_stops", "params": {"max": 1}}])


def test_earliest_departure(flight):
    spec = [{"name": "earliest_departure", "params": {"not_before": "07:00"}}]
    assert not passes_all(flight(departure_time=datetime(2026, 9, 12, 6, 40)), spec)
    assert passes_all(flight(departure_time=datetime(2026, 9, 12, 8, 0)), spec)


def test_latest_departure(flight):
    spec = [{"name": "latest_departure", "params": {"not_after": "18:00"}}]
    assert passes_all(flight(departure_time=datetime(2026, 9, 12, 10, 0)), spec)
    assert not passes_all(flight(departure_time=datetime(2026, 9, 12, 20, 0)), spec)


def test_no_overnight(flight):
    spec = [{"name": "no_overnight", "params": {}}]
    assert passes_all(flight(overnight=False), spec)
    assert not passes_all(flight(overnight=True), spec)


def test_max_layover_hours(flight):
    spec = [{"name": "max_layover_hours", "params": {"hours": 3}}]
    assert passes_all(flight(layovers_min=[120]), spec)        # 2h ok
    assert not passes_all(flight(layovers_min=[60, 240]), spec)  # 4h too long


def test_max_total_hours(flight):
    spec = [{"name": "max_total_hours", "params": {"hours": 12}}]
    assert passes_all(flight(total_duration_min=600), spec)      # 10h ok
    assert not passes_all(flight(total_duration_min=800), spec)  # 13h20 too long


def test_passes_all_is_and_composition(flight):
    specs = [
        {"name": "max_stops", "params": {"max": 1}},
        {"name": "no_overnight", "params": {}},
    ]
    assert passes_all(flight(stops=1, overnight=False), specs)
    assert not passes_all(flight(stops=1, overnight=True), specs)   # fails 2nd
    assert not passes_all(flight(stops=2, overnight=False), specs)  # fails 1st


def test_empty_filters_keep_everything(flight):
    flights = [flight(stops=0), flight(stops=2, overnight=True)]
    assert apply_filters(flights, []) == flights


def test_unknown_filter_raises_with_valid_names(flight):
    with pytest.raises(ValueError) as exc:
        passes_all(flight(), [{"name": "bogus", "params": {}}])
    msg = str(exc.value)
    assert "bogus" in msg and "max_stops" in msg  # error lists valid names
