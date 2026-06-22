"""Data layer: normalize SerpApi JSON into Flight objects (offline, uses a fixture)."""

import json
from datetime import datetime

from flights.data import _option_to_flight
from tests.conftest import FIXTURES


def _load_options():
    data = json.loads((FIXTURES / "serpapi_tbs_lis.json").read_text())
    return data.get("best_flights", []) + data.get("other_flights", [])


def test_options_normalize_with_consistent_invariants():
    options = _load_options()
    assert options, "fixture should contain flight options"
    for opt in options:
        f = _option_to_flight(opt, "TBS", "LIS", "USD")
        segments = opt["flights"]
        # stops = segments - 1; one layover per stop
        assert f.stops == len(segments) - 1
        assert len(f.layovers_min) == f.stops
        assert isinstance(f.departure_time, datetime)
        assert isinstance(f.arrival_time, datetime)
        assert f.arrival_time >= f.departure_time
        assert f.price > 0
        assert f.total_duration_min > 0
        assert f.origin == "TBS" and f.destination == "LIS"


def test_known_values_from_fixture():
    flights = [_option_to_flight(o, "TBS", "LIS", "USD") for o in _load_options()]
    cheapest = min(flights, key=lambda f: f.price)
    # The frozen fixture's cheapest option is the 266 USD, 1-stop, 04:35 departure.
    assert cheapest.price == 266.0
    assert cheapest.stops == 1
    assert cheapest.departure_time.hour == 4 and cheapest.departure_time.minute == 35
    # The overnight flag must plumb through from segment data.
    assert any(f.overnight for f in flights)
