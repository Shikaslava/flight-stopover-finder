"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Airport = { code: string; city: string; country: string };

// Shown as default suggestions before the user types (popular hubs, if present in the data).
const POPULAR = ["LHR", "JFK", "CDG", "IST", "DXB", "AMS", "FRA", "SIN", "LAX", "BCN", "FCO", "HND"];

/* A small type-to-search airport picker. Shared by From, To, and the candidate picker so
 * all three behave identically. Filters by IATA code / city / country and shows the top
 * matches; click or Enter selects. */
export function AirportAutocomplete({
  airports,
  value,
  onPick,
  placeholder,
  inputStyle,
  exclude = [],
  clearOnPick = false,
}: {
  airports: Airport[];
  value: string;
  onPick: (a: Airport) => void;
  placeholder?: string;
  inputStyle?: React.CSSProperties;
  exclude?: string[];
  clearOnPick?: boolean;
}) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [touched, setTouched] = useState(false); // has the user typed since focusing?
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value); // latest committed value, for the blur-revert closure

  // Reflect external value changes (e.g. swap, reset) into the field text.
  useEffect(() => { setQuery(value || ""); valueRef.current = value; }, [value]);

  const matches = useMemo(() => {
    const ex = new Set(exclude);
    const pool = airports.filter((a) => !ex.has(a.code));
    const q = query.trim().toLowerCase();

    // Before the user types (just focused / committed value showing), show popular hubs as
    // suggestions instead of filtering by the current value — so options appear on click.
    if (!touched || !q) {
      const byCode = new Map(pool.map((a) => [a.code, a]));
      const popular = POPULAR.map((c) => byCode.get(c)).filter((a): a is Airport => !!a);
      return (popular.length ? popular : pool).slice(0, 8);
    }

    const score = (a: Airport) => {
      const code = a.code.toLowerCase();
      const city = a.city.toLowerCase();
      if (code === q) return 100;
      if (code.startsWith(q)) return 80;
      if (city.startsWith(q)) return 60;
      if (city.includes(q)) return 40;
      if (a.country.toLowerCase().includes(q)) return 20;
      return -1;
    };
    return pool
      .map((a) => [a, score(a)] as const)
      .filter(([, s]) => s >= 0)
      .sort((a, b) => b[1] - a[1])
      .map(([a]) => a)
      .slice(0, 8);
  }, [airports, query, exclude, touched]);

  function choose(a: Airport) {
    onPick(a);
    setQuery(clearOnPick ? "" : a.code);
    setTouched(false);
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        value={query}
        placeholder={placeholder}
        onChange={(e) => { setQuery(e.target.value); setTouched(true); setOpen(true); setHi(0); }}
        onFocus={(e) => { setOpen(true); setTouched(false); setHi(0); e.target.select(); }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => {
            setOpen(false);
            setTouched(false);
            // Drop any typed-but-unselected text: revert to the committed value (or clear).
            setQuery(clearOnPick ? "" : (valueRef.current || ""));
          }, 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") { if (open && matches[hi]) { e.preventDefault(); choose(matches[hi]); } }
          else if (e.key === "Escape") { setOpen(false); }
        }}
        style={inputStyle}
      />
      {open && matches.length > 0 && (
        <div
          onMouseDown={() => { if (blurTimer.current) clearTimeout(blurTimer.current); }}
          style={{ position: "absolute", zIndex: 60, top: "calc(100% + 6px)", left: 0, minWidth: 280, maxHeight: 300, overflowY: "auto", background: "#fff", border: "1px solid rgba(22,34,58,0.14)", borderRadius: 12, boxShadow: "0 16px 40px -12px rgba(22,34,58,0.32)" }}
        >
          {matches.map((a, i) => (
            <div
              key={a.code}
              onMouseDown={(e) => { e.preventDefault(); choose(a); }}
              onMouseEnter={() => setHi(i)}
              style={{ display: "flex", alignItems: "baseline", gap: 9, padding: "9px 13px", cursor: "pointer", background: i === hi ? "#F3FAF8" : "#fff" }}
            >
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13, color: "#16223A", width: 34, flex: "none" }}>{a.code}</span>
              <span style={{ fontSize: 13.5, color: "#16223A", fontWeight: 600 }}>{a.city}</span>
              <span style={{ fontSize: 12, color: "#9AA0AB", marginLeft: "auto", paddingLeft: 10 }}>{a.country}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
