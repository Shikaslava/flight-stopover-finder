"""Engine: baseline, cheaper-stopover detection, skip reasons, and date logic.

`search_flights` is monkeypatched with canned data, so these run offline and deterministic.
"""

from datetime import datetime

from flights import engine


def _make_fake(table, raises=()):
    """Fake search_flights: returns canned lists by (origin, dest, day); records calls."""
    calls = []

    def fake(origin, destination, outbound_date, **kwargs):
        calls.append((origin, destination, outbound_date))
        if (origin, destination) in raises:
            raise RuntimeError("simulated API failure")
        return table.get((origin, destination, outbound_date), [])

    fake.calls = calls
    return fake


def test_finds_cheaper_route_and_records_skip_reasons(flight, monkeypatch):
    table = {
        # baseline A->B = 500
        ("AAA", "BBB", "2026-09-12"): [flight(price=500.0, stops=1,
                                              departure_time=datetime(2026, 9, 12, 9, 0),
                                              arrival_time=datetime(2026, 9, 12, 18, 0))],
        # CCC: 100 + 150 = 250  -> cheaper, kept
        ("AAA", "CCC", "2026-09-12"): [flight(origin="AAA", destination="CCC", price=100.0,
                                              departure_time=datetime(2026, 9, 12, 10, 0),
                                              arrival_time=datetime(2026, 9, 12, 14, 0))],
        ("CCC", "BBB", "2026-09-15"): [flight(origin="CCC", destination="BBB", price=150.0,
                                              departure_time=datetime(2026, 9, 15, 9, 0),
                                              arrival_time=datetime(2026, 9, 15, 12, 0))],
        # DDD: 300 + 300 = 600  -> not cheaper, skipped
        ("AAA", "DDD", "2026-09-12"): [flight(origin="AAA", destination="DDD", price=300.0,
                                              arrival_time=datetime(2026, 9, 12, 14, 0))],
        ("DDD", "BBB", "2026-09-15"): [flight(origin="DDD", destination="BBB", price=300.0,
                                              departure_time=datetime(2026, 9, 15, 9, 0))],
        # FFF: no A->C flights at all -> skipped
        ("AAA", "FFF", "2026-09-12"): [],
        # EEE: lookup raises -> skipped, not fatal
    }
    fake = _make_fake(table, raises={("AAA", "EEE")})
    monkeypatch.setattr(engine, "search_flights", fake)

    result = engine.find_stopovers(
        "AAA", "BBB", "2026-09-12", ["CCC", "DDD", "FFF", "EEE"],
        min_nights=3, filters=[],
    )

    assert result.baseline.price == 500.0

    assert len(result.routes) == 1
    route = result.routes[0]
    assert route.city == "CCC"
    assert route.total_price == 250.0
    assert route.savings == 250.0
    assert route.stay_nights == 3

    skipped = dict(result.skipped)
    assert skipped["DDD"] == "not cheaper than direct"
    assert skipped["FFF"] == "no acceptable A->C flight"
    assert skipped["EEE"].startswith("lookup failed")


def test_min_nights_counted_from_arrival_when_overnight(flight, monkeypatch):
    # A->GGG departs 09-12 23:00 but ARRIVES next day 09-13 02:00 (overnight).
    # With min_nights=3, the C->B leg must be searched for 09-16 (arrival + 3),
    # NOT 09-15 (departure + 3) — otherwise the stay is silently short.
    table = {
        ("AAA", "BBB", "2026-09-12"): [flight(price=500.0)],
        ("AAA", "GGG", "2026-09-12"): [flight(origin="AAA", destination="GGG", price=100.0,
                                              departure_time=datetime(2026, 9, 12, 23, 0),
                                              arrival_time=datetime(2026, 9, 13, 2, 0),
                                              overnight=True)],
        ("GGG", "BBB", "2026-09-16"): [flight(origin="GGG", destination="BBB", price=150.0,
                                              departure_time=datetime(2026, 9, 16, 9, 0),
                                              arrival_time=datetime(2026, 9, 16, 12, 0))],
    }
    fake = _make_fake(table)
    monkeypatch.setattr(engine, "search_flights", fake)

    result = engine.find_stopovers(
        "AAA", "BBB", "2026-09-12", ["GGG"], min_nights=3, filters=[],
    )

    # The C->B leg was searched for the arrival-based date.
    assert ("GGG", "BBB", "2026-09-16") in fake.calls
    assert ("GGG", "BBB", "2026-09-15") not in fake.calls
    assert len(result.routes) == 1
    assert result.routes[0].stay_nights == 3
