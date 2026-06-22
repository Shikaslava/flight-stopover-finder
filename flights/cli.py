"""Command-line entry point. Wires config + data + filters + engine + render together.

Usage:
    .venv/bin/python -m flights.cli TBS LIS --depart 2026-09-12 --min-nights 3

It reads config.json for filters, ranker, candidate cities/source, and taste, and reads
API keys from .env. CLI flags override config where it makes sense.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date

from dotenv import load_dotenv

from .candidates import get_candidates
from .engine import find_stopovers
from .render import render_table, write_json


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="flights",
        description="Find A->C->B stopover routes cheaper than flying A->B direct.",
    )
    p.add_argument("origin", help="origin airport code, e.g. TBS")
    p.add_argument("destination", help="destination airport code, e.g. LIS")
    p.add_argument("--depart", required=True, help="departure date, YYYY-MM-DD")
    p.add_argument("--min-nights", type=int, default=None,
                   help="minimum nights to stay in C (default from config)")
    p.add_argument("--arrive-by", default=None,
                   help="latest acceptable arrival date in B, YYYY-MM-DD (optional)")
    p.add_argument("--candidates", default=None,
                   help="comma-separated city codes to use (overrides config; forces static)")
    p.add_argument("--source", choices=["static", "llm"], default=None,
                   help="where candidate cities come from (overrides config)")
    p.add_argument("--currency", default=None, help="display currency (default from config)")
    p.add_argument("--config", default="config.json", help="path to config file")
    p.add_argument("--no-cache", action="store_true",
                   help="ignore cached API responses and fetch fresh")
    return p.parse_args(argv)


def _valid_date(s: str, label: str) -> None:
    try:
        date.fromisoformat(s)
    except ValueError:
        sys.exit(f"Error: --{label} must be YYYY-MM-DD (got '{s}').")


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    args = _parse_args(argv if argv is not None else sys.argv[1:])

    _valid_date(args.depart, "depart")
    if args.arrive_by:
        _valid_date(args.arrive_by, "arrive-by")

    try:
        config = json.load(open(args.config))
    except FileNotFoundError:
        return _fail(f"Config file '{args.config}' not found.")

    # CLI overrides config.
    if args.source:
        config["candidate_source"] = args.source
    if args.candidates:
        config["candidate_source"] = "static"
        config["candidates"] = [c.strip().upper() for c in args.candidates.split(",")]
    currency = args.currency or config.get("currency", "USD")
    min_nights = args.min_nights if args.min_nights is not None else config.get("min_nights_in_C", 3)

    origin, destination = args.origin.upper(), args.destination.upper()

    # 1. Get candidate cities (static list or LLM taste-advisor).
    try:
        candidates = get_candidates(origin, destination, config)
    except Exception as e:  # missing ANTHROPIC_API_KEY, LLM error, bad source, etc.
        return _fail(f"Could not get candidate cities: {e}")
    # Dedupe (preserve order) and drop origin/destination. The LLM occasionally repeats a
    # code; searching it twice would waste API quota.
    candidates = list(dict.fromkeys(candidates))
    candidates = [c for c in candidates if c not in (origin, destination)]
    if not candidates:
        return _fail("No candidate cities to check. Add some to config.json or use --candidates.")

    print(f"Checking stopovers via {len(candidates)} cities: {', '.join(candidates)}\n")

    # 2. Run the search.
    try:
        result = find_stopovers(
            origin, destination, args.depart, candidates,
            min_nights=min_nights, currency=currency, arrive_by=args.arrive_by,
            filters=config.get("filters", []), ranker=config.get("ranker", "by_price"),
            use_cache=not args.no_cache,
        )
    except RuntimeError as e:   # e.g. missing SERPAPI_KEY, SerpApi error
        return _fail(str(e))

    # 3. Show + save.
    print(render_table(result))
    out = write_json(result)
    print(f"\nSaved results to {out}")
    return 0


def _fail(message: str) -> int:
    print(f"Error: {message}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
