"""Candidate stopover cities — where the list of cities C comes from.

One interface, two implementations (swappable via config "candidate_source"):
  - "static": the fixed list in config.json (no API, no cost).
  - "llm":    an LLM proposes cities between A and B matching your taste. This is the
              project's differentiator — cost-based discovery of a city you'd ENJOY,
              not just a mechanical stopover.

The LLM only PROPOSES the candidate list; the price engine still ranks purely on cost.
A flaky LLM can never corrupt the numbers (per the architecture rule).

The LLM path uses FreeLLMAPI — an OpenAI-compatible router. It reads FREELLMAPI_URL and
FREELLMAPI_KEY from .env, and the model name from config ("llm_model"). The static path
needs nothing.
"""

from __future__ import annotations

import json
import os

import requests


def _static_candidates(config: dict) -> list[str]:
    return list(config.get("candidates", []))


def _extract_json(text: str) -> str:
    """Pull the JSON object out of a model reply (handles ```json fences / stray prose)."""
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"No JSON object found in LLM reply: {text[:200]!r}")
    return text[start:end + 1]


def _llm_candidates(origin: str, destination: str, taste: str, count: int,
                    model: str) -> list[dict]:
    """Ask the LLM for `count` stopover cities between origin and destination.

    Returns a list of {code, name, reason} dicts (so the CLI can show the 'why').
    """
    base = os.getenv("FREELLMAPI_URL", "").strip().rstrip("/")
    key = os.getenv("FREELLMAPI_KEY", "").strip()
    if not base or not key:
        raise RuntimeError("Set FREELLMAPI_URL and FREELLMAPI_KEY in .env to use the LLM advisor.")

    system = (
        "You are a savvy travel companion who knows global flight geography. "
        "Given a one-way trip A -> B, you suggest intermediate cities C that make a "
        "sensible, roughly en-route stopover AND that the traveler would enjoy exploring "
        "for a few days, tuned to their stated taste. Use real airports with IATA codes. "
        "Reply with ONLY a JSON object of the form "
        '{"cities":[{"code":"XXX","name":"City","reason":"..."}]} and no other text.'
    )
    prompt = (
        f"I'm flying one-way from {origin} to {destination}.\n"
        f"Suggest {count} candidate stopover cities C that are roughly on the way "
        f"(or a reasonable detour) and worth a multi-day stay.\n"
        f"My taste: {taste}\n"
        f"Avoid the origin and destination themselves. Prefer cities with good flight "
        f"connections to both {origin} and {destination}."
    )

    resp = requests.post(
        f"{base}/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.4,
        },
        timeout=60,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    return json.loads(_extract_json(content))["cities"]


def get_candidates(origin: str, destination: str, config: dict) -> list[str]:
    """Return a list of candidate-city IATA codes, per config['candidate_source']."""
    source = config.get("candidate_source", "static")

    if source == "static":
        return _static_candidates(config)

    if source == "llm":
        cities = _llm_candidates(
            origin, destination,
            taste=config.get("taste", "no strong preferences"),
            count=int(config.get("llm_candidate_count", 6)),
            model=config.get("llm_model", "gemini-2.5-flash"),
        )
        return [c["code"].upper() for c in cities]

    raise ValueError(
        f"Unknown candidate_source '{source}'. Valid: 'static', 'llm'."
    )


if __name__ == "__main__":
    # Static path needs no key. LLM path needs ANTHROPIC_API_KEY in .env.
    from dotenv import load_dotenv

    load_dotenv()
    cfg = json.load(open("config.json"))

    print(f"candidate_source = {cfg.get('candidate_source')}")
    print("static candidates:", _static_candidates(cfg))

    if os.getenv("FREELLMAPI_KEY", "").strip():
        print(f"\nLLM suggestions via {cfg.get('llm_model', 'gemini-2.5-flash')} (taste-based):")
        for c in _llm_candidates("TBS", "LIS", cfg.get("taste", ""), 5,
                                 cfg.get("llm_model", "gemini-2.5-flash")):
            print(f"  {c['code']} ({c['name']}): {c['reason']}")
    else:
        print("\n(Set FREELLMAPI_URL + FREELLMAPI_KEY in .env to try the LLM taste-advisor.)")
