# Detour API (FastAPI backend)

Wraps the existing `flights/` engine over HTTP so the Next.js frontend (the **Detour**
design) can call it. No business logic lives here — it reuses `flights.engine`,
`flights.render`, and `flights.candidates`. API keys stay server-side (loaded from `.env`);
the browser only talks to this server.

## Run it

From the **project root** (so `.cache/` and `config.json` resolve):

```bash
.venv/bin/uvicorn api.main:app --reload --port 8000
```

- Interactive test UI (try requests in the browser): http://localhost:8000/docs
- Health check: `GET http://localhost:8000/health` → `{"status":"ok"}`

## Endpoints (the contract to build the frontend against)

### `POST /search`
Request:
```json
{
  "origin": "TBS",
  "destination": "LIS",
  "depart_date": "2026-09-12",
  "arrive_by": "2026-09-25",          // optional
  "min_nights": 3,                     // optional, defaults from config.json
  "candidates": ["IST", "ATH", "VIE"], // IATA codes to test as stopovers
  "filters": { "nonstop_only": false, "depart_after_7": false, "no_overnight": false }
}
```
Response (the `result_to_dict` shape — see `flights/render.py`):
```json
{
  "origin": "TBS", "destination": "LIS", "depart_date": "2026-09-12", "currency": "USD",
  "baseline": { "price": 404, "departure_time": "...", "arrival_time": "...",
                "stops": 1, "total_duration_min": 1470, "layovers_min": [...],
                "carriers": [...], "overnight": false },
  "routes": [
    { "city": "VIE", "total_price": 358, "savings": 46, "savings_pct": 11.4,
      "stay_nights": 3, "leg1": { ...flight... }, "leg2": { ...flight... } }
  ],
  "skipped": [ { "city": "ATH", "reason": "not cheaper than direct" } ]
}
```
A `leg`/`baseline` flight object has: `origin, destination, price, currency,
departure_time, arrival_time` (ISO naive local), `stops, total_duration_min, layovers_min,
carriers, overnight, booking_token`.

### `POST /suggest-cities`  (the AI taste-advisor)
Request: `{ "origin": "TBS", "destination": "LIS", "message": "food, walkable, sea", "count": 5 }`
Response: `{ "cities": [ { "code": "IST", "name": "Istanbul", "reason": "..." } ] }`

## Notes for the frontend (Next.js)

- Set `NEXT_PUBLIC_API_URL=http://localhost:8000` and `fetch` these endpoints.
- **Display formatting is the frontend's job.** The backend returns raw datetimes/numbers;
  the page formats "Sat Sep 12", "14:20 → 16:30", "8h20", "$190" etc. City **name /
  country / photo** come from a static map on the frontend (lift the `airports` and
  `photos` objects straight out of `Detour.dc.html`), keyed by IATA code.
- **Tabs + filters are client-side.** The backend returns all routes; the design's
  Recommended/Best-savings sort (`recScore`) and the filter toggles re-sort/re-filter the
  returned list. (The filter toggles are *also* sent to `/search` so the engine drops
  unacceptable flights server-side — both layers cooperate.)
- Filter toggles map to the engine's filter registry: `nonstop_only → max_stops:0`,
  `depart_after_7 → earliest_departure:07:00`, `no_overnight → no_overnight`.
- CORS already allows `http://localhost:3000` (Next.js dev). If you host elsewhere, add the
  origin in `api/main.py`.

## ⚠️ Two known items

1. **FreeLLMAPI key is currently invalid** — `/suggest-cities` returns a clean `502`
   ("LLM advisor unavailable: 401 …"). The key in `.env` (`FREELLMAPI_KEY`) was rejected by
   the router; get a fresh one from the keys page (`http://10.10.0.13:13032/keys`) and
   update `.env`. `/search` is unaffected.
2. **SerpApi free tier (~250/mo, ~25 used).** Every *new* route/date `/search` makes live
   calls; repeated ones are served from `.cache/`. Keep the page private or gated so
   strangers don't burn the quota.
