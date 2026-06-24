"""Generate web/public/airports.json from the OurAirports public dataset.

Downloads OurAirports' airports.csv + countries.csv, keeps major commercial airports
(large/medium) that have an IATA code, joins the country name, and writes a compact
[{code, city, country}] list the frontend autocomplete uses.

Run once (re-run to refresh):  python web/scripts/generate_airports.py
Uses only the Python stdlib. Downloads public CSVs (not SerpApi — no quota impact).
"""

import csv
import io
import json
import urllib.request
from pathlib import Path

AIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
COUNTRIES_URL = "https://davidmegginson.github.io/ourairports-data/countries.csv"
OUT = Path(__file__).resolve().parent.parent / "public" / "airports.json"

KEEP_TYPES = {"large_airport", "medium_airport"}


def fetch_csv(url: str) -> list[dict]:
    with urllib.request.urlopen(url, timeout=60) as resp:
        text = resp.read().decode("utf-8")
    return list(csv.DictReader(io.StringIO(text)))


def main() -> None:
    countries = {c["code"]: c["name"] for c in fetch_csv(COUNTRIES_URL)}

    rows = fetch_csv(AIRPORTS_URL)
    seen: set[str] = set()
    out: list[dict] = []
    for r in rows:
        code = (r.get("iata_code") or "").strip().upper()
        if not code or len(code) != 3 or code in seen:
            continue
        if r.get("type") not in KEEP_TYPES:
            continue
        city = (r.get("municipality") or "").strip() or (r.get("name") or "").strip()
        if not city:
            continue
        seen.add(code)
        out.append({
            "code": code,
            "city": city,
            "country": countries.get(r.get("iso_country", ""), r.get("iso_country", "")),
        })

    out.sort(key=lambda a: a["city"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False))
    print(f"Wrote {len(out)} airports -> {OUT}")
    for sample in ("LIS", "TBS", "JFK"):
        hit = next((a for a in out if a["code"] == sample), None)
        print(f"  {sample}: {hit}")


if __name__ == "__main__":
    main()
