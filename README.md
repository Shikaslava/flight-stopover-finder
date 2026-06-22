# Flight Stopover Finder

A personal command-line tool: for a one-way trip from **A** to **B**, it finds a stopover
city **C** where flying **A → C → B** (with a multi-day stay in C) is **cheaper than flying
A → B directly** — and helps you pick C based on cost (and, later, on whether you'd enjoy
visiting it).

This is a learning project. See [`SPEC-v1.md`](./SPEC-v1.md) for the full design and
[the build plan](../../.claude/plans/sparkling-hugging-hartmanis.md) for the steps.

## Status

**v1 complete and working.** Run:
```bash
.venv/bin/python -m flights.cli TBS LIS --depart 2026-09-12 --min-nights 3
```
Finds A→C→B routes cheaper than the direct A→B baseline, applies your filters, ranks by
price, prints a table, and saves JSON to `results/`.

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Copy `.env.example` to `.env` and paste your real keys:
   ```bash
   cp .env.example .env
   # then edit .env and set SERPAPI_KEY
   ```
   (A starter `.env` already exists — just paste your SerpApi key into it.)

## Configuration

Edit `config.json`:
- `candidates` — airport codes of cities C to consider as stopovers.
- `min_nights_in_C` — minimum nights to make a stop worthwhile.
- `filters` — which flight-quality filters to apply (drop unacceptable flights before
  ranking). Empty list `[]` = pure cheapest.
- `ranker` — how to rank surviving routes (`by_price` in v1).

## Data source

Uses [SerpApi's Google Flights API](https://serpapi.com/google-flights-api) (free tier:
~250 searches/month). The data layer is swappable by design.

## Project layout

```
flights/        # the package (modules added step by step)
config.json     # candidate cities, filters, ranker, thresholds
.env            # your API keys (gitignored — never commit)
results/        # per-run JSON output
```
