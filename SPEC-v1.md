# Flight Stopover Finder — v1 Spec (Baseline)

_Last updated: 2026-06-21_

---

## 0. One-sentence summary

A personal command-line tool that, for a one-way trip from city **A** to city **B**,
discovers a stopover city **C** where flying **A → C → B** (with a multi-day stay in C)
is **cheaper than flying A → B directly** — and helps me pick C based on cost *and* on
whether I'd actually enjoy visiting it.

---

## 1. Why this project exists (read this first)

**Primary goal: learning by shipping.** I'm a DFT VLSI engineer moving toward
entrepreneurship. This is my first delivered software project and my first time working
with an external API and an LLM integration. The point is to *finish something real* and
learn the full loop: API → logic → LLM → output.

**This is not a bet that I'm first to market.** The core mechanic already exists (see
Prior Art below). I'm rebuilding a *validated* idea on purpose — that de-risks the
learning. The one genuinely-unbuilt angle (LLM taste-based discovery) is my wedge and the
most interesting part to learn.

**Success for v1 is NOT "a business."** Success is: it runs, it finds real cheaper
A→C→B routes, the LLM helps me choose C, and I learned APIs + LLM wiring along the way.

---

## 2. Prior art (what already exists — design references, not enemies)

| Tool | What it does | Gap vs. my idea |
|------|--------------|-----------------|
| **AirWander** | Enter A + B, suggests stopover cities C that save money vs. direct, filter by days/continent/nonstop | Filters are *mechanical* only — no personalized "would I enjoy C" |
| **CleverLayover** | Combines non-partnered airlines to beat direct prices | Transit-focused, not "stay a few days in C" |
| **Kiwi Nomad** | You input the cities; it reshuffles order for cheapest route | **You must already know C** — it does not *discover* C |
| **Amadeus Flight Inspiration** | "Cheapest destinations from A" (A→anywhere) | No fixed final destination B; cached data |

**My differentiator:** discovery of C *toward a fixed B*, curated by **personal taste via
an LLM chat**, not just mechanical filters. Use the tools above to see what's clunky and
do that part better.

---

## 3. Scope

### In scope for v1
- **One direction only:** A → B (never B → A). One-way legs throughout.
- **One-shot CLI:** run a command, get results, done. No saved routes, no monitoring.
- **Stopover discovery is the core:** price A→B baseline, then find A→C→B combos cheaper
  than baseline.
- **Fixed candidate list of cities C** (5–10 cities I provide), NOT "search anywhere."
  Rationale: free APIs query specific city pairs, and a small list keeps API calls and
  complexity manageable.
- **LLM taste layer (core differentiator):** used to *generate / curate the candidate
  city list* from my preferences ("between A and B, suggest cities I'd enjoy"). Sits
  *beside* the price engine, never inside the price math.
- **Flight-quality hard filters:** cheapest is NOT always best (a $100 3am flight can be
  worse than a $120 10am one). v1 applies hard filters that DROP unacceptable itineraries
  before ranking, then ranks survivors by price. Configurable filters:
  - earliest acceptable departure time (e.g. no departures before 07:00)
  - max number of stops per leg (e.g. ≤ 1)
  - max total travel time per leg
  - max layover length
  These fields all come back from Amadeus Flight Offers Search, so filtering is cheap.
- **Output:** ranked table printed to the terminal + a JSON results file saved per run.
  Table also shows the quality fields (stops, duration, departure time) so I can eyeball.

### Out of scope for v1 (explicitly deferred to v2+)
- "Search literally anywhere" for C (Amadeus Flight Inspiration / SerpApi).
- Monitoring / price alerts / "tell me when a deal appears."
- Hosting / running without my laptop on. (Stays local.)
- A web or graphical UI.
- SQLite / a real database. (Flat JSON files until I need to *query* history.)
- Blending a numeric "want-to-visit score" into ranking. (v1 ranks by price; LLM only
  curates the candidate list.)
- **A "Recommended" sort** (like Google Flights' Best). Two future paths, both deferred:
  (a) **Amadeus Flight Choice Prediction API** — feed it the offers, it returns each
  offer's probability of being chosen by travelers (ML proxy for the *average* traveler's
  "best"); one extra free-tier API call. (b) **Soft penalties / LLM-tuned scoring** —
  convert annoyances (3am, long layover) into dollar-equivalents tuned to MY taste, then
  rank by adjusted price. Path (b) is the more distinctive, on-brand version. v1 uses hard
  filters only; soft scoring is the natural next layer and grows out of the LLM advisor.
- Trip-time cost modeling — see Assumption A3.
- Booking. The tool finds routes; I book manually on the airline/aggregator.

---

## 4. Core assumptions (decisions already made)

- **A1 — One-way only.** Comparison is one-way A→B vs. one-way A→C + one-way C→B.
  Apples to apples.
- **A2 — Two separate tickets.** A→C and C→B are independent one-way tickets (like
  AirWander). Flagged: one-ways can price oddly, but it's correct for the stopover idea.
- **A3 — Staying in C costs the same as staying in A.** For v1 we ignore the "extra days
  cost money/time" problem. A cheap route that adds days is treated as pure savings.
  (Revisit in v2.)
- **A4 — Test data is good enough for v1.** Amadeus test environment returns
  cached/approximate prices. Fine for proving logic; switch to production (still has a
  free quota) when accuracy matters.

---

## 5. Inputs & outputs

### Inputs (per run)
- **Origin A** — city/airport code (e.g. `TBS`).
- **Destination B** — city/airport code (e.g. `LIS`).
- **Depart window** — earliest and latest date I can leave A (e.g. `2026-09-10` to
  `2026-09-14`).
- **Arrive-by date** — latest date I must be in B (e.g. `2026-09-25`).
- **Min nights in C** — minimum stay to make a stop worthwhile (e.g. `3`).
- **Candidate cities C** — a list, from config (and/or LLM-generated).

The stay length in C is *derived*: it's whatever fits between the A→C arrival and the
C→B departure inside the date window, subject to Min-nights.

### Output
1. **Terminal table**, ranked by savings:

```
Baseline: TBS -> LIS (one-way)        $480   depart Sep 12

Cheaper via a stopover:
  via IST (Istanbul)  save $190 (40%)  TBS->IST Sep 11 . stay 4 nts . IST->LIS Sep 15  $290
  via ATH (Athens)    save $120 (25%)  TBS->ATH Sep 10 . stay 5 nts . ATH->LIS Sep 15  $360
  via VIE (Vienna)    save $60  (12%)  TBS->VIE Sep 12 . stay 2 nts . VIE->LIS Sep 14  $420
```

2. **JSON results file** (`results/<timestamp>.json`) with the same data, machine-readable,
   so future versions (email, web, history) can just read it.

---

## 6. The algorithm (v1)

```
Filtering rule (applied to EVERY leg before it's considered):
  drop any flight that violates the hard filters
  (departs too early, too many stops, too long, layover too long).
  "Cheapest" always means cheapest AMONG flights that pass the filters.

1. Get baseline = cheapest *acceptable* one-way A -> B within the depart window.
2. For each candidate city C:
     a. Find cheapest acceptable one-way A -> C departing inside the depart window.
     b. Find cheapest acceptable one-way C -> B that:
          - departs at least (Min-nights) after arriving in C, and
          - arrives in B on or before the Arrive-by date.
     c. route_price(C) = price(A->C) + price(C->B)
     d. If route_price(C) < baseline: keep it, record savings & stay length.
3. Rank kept routes by savings (descending). Print table + write JSON.
```

**Cost note:** each candidate C = ~2 API searches. A list of 8 cities ≈ ~17 calls per run
(incl. baseline). Keep the list small to stay inside the free quota.

---

## 7. Architecture (as built)

The code is organized so each concern is swappable without touching the others. Modules
live under `flights/`:

- **`data.py` — data layer.** The only module that knows SerpApi's JSON. Fetches a *list*
  of flights for a route+date, normalizes each into a `Flight` object, and caches every
  raw reply under `.cache/` (re-runs are free + offline-testable). *Swappable* — replacing
  SerpApi with another provider means changing only this file.
- **`filters.py` — pluggable filters.** A `FILTERS` registry maps names → predicate
  functions; `config.json` picks which are active. `passes_all()` applies them generically.
  **Adding a filter = one function + one registry line; the engine never changes.** Ships
  with `max_stops`, `earliest_departure`, `latest_departure`, `max_total_hours`,
  `max_layover_hours`, `no_overnight`.
- **`ranking.py` — pluggable ranking.** Same registry pattern. v1 ships `by_price`; future
  scorers (soft penalties, LLM-taste blend) drop in without engine edits.
- **`engine.py` — pure engine.** Baseline + A→C→B combination + savings. Calls the data
  layer, `passes_all()`, and the ranker; returns a structured `SearchResult`. No printing,
  no direct API calls, no LLM.
- **`candidates.py` — candidate source.** `get_candidates()` with `static` (config list)
  and `llm` (Claude taste-advisor — the differentiator) implementations. The LLM only
  *proposes* the city list; it never touches price math.
- **`render.py` — renderers.** Turn a `SearchResult` into the terminal table and the JSON
  file. The engine never prints; new output channels are just new renderers.
- **`cli.py` — entry point.** Parses args, loads config + `.env`, wires it together.

Rule (enforced by the layering): a flaky LLM or API can never corrupt the numbers. Numbers
come from the engine, which is pure and deterministic.

Run it: `.venv/bin/python -m flights.cli TBS LIS --depart 2026-09-12 --min-nights 3`

---

## 8. Tech choices

- **Language:** Python (best flight-API ecosystem, easiest scripting, good for learning).
- **Runs:** locally, on my laptop, on demand. No hosting in v1.
- **Flight data:** **SerpApi Google Flights API** — real Google Flights data with rich
  itinerary detail (times, stops, duration, layovers) that the filters need; single-key
  auth; ~250 free searches/month with free cached re-runs. (Switched from Amadeus, which
  shut down its self-service portal on 2026-07-17 and paused new-user registration.) Kept
  in pocket: **Kiwi/Tequila** (virtual-interlining data, needs partner approval); SerpApi's
  **Google Travel Explore** endpoint for the future "anywhere" candidate source.
- **LLM:** Claude API (Anthropic), `claude-opus-4-8`, with structured outputs, for the
  candidate-city advisor.
- **Storage:** flat **JSON files** — one config file (cities, thresholds, preferences),
  one results file per run. Upgrade to SQLite only when I want to *query* history.

---

## 9. Success criteria (v1 — DONE)

- [x] I can run one command with A, B, a depart date, min-nights, and optional arrive-by.
- [x] It returns a correct cheapest *acceptable* one-way A→B baseline.
- [x] It finds real A→C→B routes cheaper than baseline, with correct stay length and dates
      (verified: TBS→LIS, cheaper via VIE and IST).
- [x] Results print as a ranked table AND save to a JSON file.
- [x] The LLM advisor can propose a candidate-city list from a plain-English taste
      description (built; needs `ANTHROPIC_API_KEY` to run).
- [x] **Extensibility proven:** a brand-new filter (`no_overnight`) takes effect via the
      registry without editing `engine.py`.
- [ ] I understand every part well enough to explain it — the ongoing point of the project.

---

## 10. Build milestones — all complete

1. [x] **Hello-API:** SerpApi signup + key, one successful Google Flights call from Python.
2. [x] **Data layer:** fetch a list of normalized flights + response cache.
3. [x] **Filters:** registry + `passes_all()` + example filters, config-driven.
4. [x] **Baseline + engine:** cheapest acceptable A→B, loop candidates, rank, structured result.
5. [x] **Render + persist:** ranked table + per-run JSON; config file for settings.
6. [x] **Candidate source:** static list + LLM taste-advisor.
7. [x] **Polish:** CLI args, graceful no-result / bad-input handling, friendly errors.

**Deferred to v2** (unchanged): "anywhere" search, soft-penalty / "Recommended" ranking,
monitoring/alerts, hosting, SQLite, depart-window & stay-range search, booking.

---

## 11. Open questions / known v1 simplifications

- **Single depart date, single stay length** (= min-nights). A depart *window* and a
  *range* of stay lengths are a v2 enhancement (just more dates looped in the engine).
- **Naive local times.** SerpApi returns local clock times without UTC offsets; we treat
  them as naive local. Fine for a traveler's "land at 06:30, leave 3 nights later" mental
  model; true tz-awareness deferred.
- City vs. airport codes for multi-airport cities (e.g. London) — not yet handled.
- SerpApi free-tier budget: ~1 + 2×(candidate count) searches per run; trim candidates if
  quota gets tight.

---

## 12. Glossary (first-timer notes to self)

- **API** — a way for my code to ask another company's server for data instead of using
  their website by hand.
- **API key** — a password-like string that identifies me so the provider can authorize
  and count my usage.
- **JSON** — structured text format the API replies in; my code reads it.
- **CLI** — command-line tool: run by typing a command, output is text. No buttons.
- **Response cache** — we save each SerpApi reply under `.cache/`; identical re-runs read
  the file instead of calling the API (saves free-tier quota, enables offline testing).
- **Registry pattern** — a dict mapping a name to a function (filters, rankers). Config
  picks which are active, so new behavior is "add a function + a line", not an engine edit.
- **Structured outputs** — constraining the LLM to return JSON matching a schema, so the
  candidate-city advisor returns a clean, parseable list.
- **Virtual interlining** — combining flights from airlines that don't cooperate into one
  trip (Kiwi's specialty). Relevant if I later swap in Kiwi data.
