"""Shared test setup: make the project importable and provide a Flight factory.

These tests run fully offline — no network, no API key. The data layer's one I/O boundary
(`search_flights`) is monkeypatched in test_engine; everything else is pure.
"""

import pathlib
import sys
from datetime import datetime

import pytest

# Make `flights` importable when running pytest from anywhere.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from flights.data import Flight  # noqa: E402

FIXTURES = pathlib.Path(__file__).parent / "fixtures"


def make_flight(**overrides) -> Flight:
    """Build a Flight with sensible defaults; override any field per test."""
    defaults = dict(
        origin="AAA",
        destination="BBB",
        price=100.0,
        currency="USD",
        departure_time=datetime(2026, 9, 12, 9, 0),
        arrival_time=datetime(2026, 9, 12, 12, 0),
        stops=0,
        total_duration_min=180,
        layovers_min=[],
        carriers=["TestAir"],
        overnight=False,
        booking_token=None,
    )
    defaults.update(overrides)
    return Flight(**defaults)


@pytest.fixture
def flight():
    """Factory fixture: call flight(price=..., stops=...) inside a test."""
    return make_flight
