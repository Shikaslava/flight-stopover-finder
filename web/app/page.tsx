"use client";

import { useMemo, useState } from "react";

/* ------------------------------------------------------------------ *
 * Detour — flight stopover finder UI (ported from Detour.dc.html).
 * Single client component: state + handlers + inline-styled markup.
 * Talks to the FastAPI backend (see ../api/README.md) for real data,
 * and falls back to the design's mock data when the API is unreachable.
 * ------------------------------------------------------------------ */

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// --- types --------------------------------------------------------------
type Leg = {
  from: string;
  to: string;
  dateLabel: string;
  times: string;
  stops: number;
  durMin: number;
  carrier: string;
  price: number;
  depHour: number;
  overnight: boolean;
};
type Route = {
  city: string;
  code: string;
  country: string;
  stayNights: number;
  total: number;
  savings: number;
  pct: number;
  gradient: string;
  leg1: Leg;
  leg2: Leg;
};
type Baseline = { route: string; dateLabel: string; meta: string; price: number };
type ChatMsg = { role: "ai" | "user"; text: string; showChips?: boolean };
type City = { code: string; name: string };

// --- static reference data (from the design) ----------------------------
const AIRPORTS: City[] = [
  { code: "IST", name: "Istanbul" }, { code: "ATH", name: "Athens" },
  { code: "BEG", name: "Belgrade" }, { code: "VIE", name: "Vienna" },
  { code: "WAW", name: "Warsaw" }, { code: "BUD", name: "Budapest" },
  { code: "FCO", name: "Rome" }, { code: "BCN", name: "Barcelona" },
  { code: "MUC", name: "Munich" }, { code: "AMS", name: "Amsterdam" },
  { code: "DXB", name: "Dubai" }, { code: "CDG", name: "Paris" },
  { code: "ZRH", name: "Zurich" }, { code: "PRG", name: "Prague" },
  { code: "OTP", name: "Bucharest" }, { code: "SOF", name: "Sofia" },
  { code: "MXP", name: "Milan" }, { code: "FRA", name: "Frankfurt" },
  { code: "CPH", name: "Copenhagen" }, { code: "HEL", name: "Helsinki" },
  { code: "DOH", name: "Doha" }, { code: "TLV", name: "Tel Aviv" },
];
const COUNTRY: Record<string, string> = {
  IST: "Türkiye", ATH: "Greece", BEG: "Serbia", VIE: "Austria", WAW: "Poland",
  BUD: "Hungary", FCO: "Italy", BCN: "Spain", MUC: "Germany", AMS: "Netherlands",
  DXB: "UAE", CDG: "France", ZRH: "Switzerland", PRG: "Czechia", OTP: "Romania",
  SOF: "Bulgaria", MXP: "Italy", FRA: "Germany", CPH: "Denmark", HEL: "Finland",
  DOH: "Qatar", TLV: "Israel",
};
const PHOTOS: Record<string, string> = {
  IST: "https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?w=400&q=70",
  ATH: "https://images.unsplash.com/photo-1555993539-1732b0258235?w=400&q=70",
  BEG: "https://images.unsplash.com/photo-1592486058517-36236ba247c8?w=400&q=70",
  VIE: "https://images.unsplash.com/photo-1573599852326-2d4da0bbe613?w=400&q=70",
  WAW: "https://images.unsplash.com/photo-1607427293702-036933bbf746?w=400&q=70",
};
const GRADIENTS = [
  "linear-gradient(135deg,#F4A14B,#E2562B)", "linear-gradient(135deg,#5BC8E8,#2A7FB8)",
  "linear-gradient(135deg,#9AA7C2,#4A5878)", "linear-gradient(135deg,#8FD6A6,#3E9B6E)",
  "linear-gradient(135deg,#E8A0B6,#B14A7A)",
];

const MOCK_ROUTES: Route[] = [
  { city: "Istanbul", code: "IST", country: "Türkiye", stayNights: 4, total: 290, savings: 190, pct: 40, gradient: GRADIENTS[0],
    leg1: { from: "TBS", to: "IST", dateLabel: "Thu Sep 11", times: "14:20 → 16:30", stops: 0, durMin: 130, carrier: "Turkish Airlines", price: 120, depHour: 14, overnight: false },
    leg2: { from: "IST", to: "LIS", dateLabel: "Mon Sep 15", times: "09:05 → 12:10", stops: 0, durMin: 305, carrier: "Turkish Airlines", price: 170, depHour: 9, overnight: false } },
  { city: "Athens", code: "ATH", country: "Greece", stayNights: 5, total: 360, savings: 120, pct: 25, gradient: GRADIENTS[1],
    leg1: { from: "TBS", to: "ATH", dateLabel: "Wed Sep 10", times: "07:40 → 08:55", stops: 1, durMin: 330, carrier: "Aegean", price: 150, depHour: 7, overnight: false },
    leg2: { from: "ATH", to: "LIS", dateLabel: "Mon Sep 15", times: "11:20 → 13:30", stops: 0, durMin: 250, carrier: "Aegean", price: 210, depHour: 11, overnight: false } },
  { city: "Belgrade", code: "BEG", country: "Serbia", stayNights: 3, total: 405, savings: 75, pct: 16, gradient: GRADIENTS[2],
    leg1: { from: "TBS", to: "BEG", dateLabel: "Thu Sep 11", times: "22:40 → 00:55⁺¹", stops: 1, durMin: 395, carrier: "Air Serbia", price: 185, depHour: 22, overnight: true },
    leg2: { from: "BEG", to: "LIS", dateLabel: "Sun Sep 14", times: "10:15 → 13:00", stops: 0, durMin: 225, carrier: "Air Serbia", price: 220, depHour: 10, overnight: false } },
  { city: "Vienna", code: "VIE", country: "Austria", stayNights: 2, total: 420, savings: 60, pct: 12, gradient: GRADIENTS[3],
    leg1: { from: "TBS", to: "VIE", dateLabel: "Sat Sep 12", times: "08:15 → 10:55", stops: 0, durMin: 220, carrier: "Austrian", price: 230, depHour: 8, overnight: false },
    leg2: { from: "VIE", to: "LIS", dateLabel: "Mon Sep 14", times: "16:30 → 19:35", stops: 0, durMin: 245, carrier: "TAP Air Portugal", price: 190, depHour: 16, overnight: false } },
  { city: "Warsaw", code: "WAW", country: "Poland", stayNights: 3, total: 440, savings: 40, pct: 8, gradient: GRADIENTS[4],
    leg1: { from: "TBS", to: "WAW", dateLabel: "Sat Sep 12", times: "10:30 → 12:30", stops: 1, durMin: 360, carrier: "LOT", price: 200, depHour: 10, overnight: false },
    leg2: { from: "WAW", to: "LIS", dateLabel: "Tue Sep 15", times: "13:00 → 16:20", stops: 1, durMin: 440, carrier: "LOT", price: 240, depHour: 13, overnight: false } },
];
const MOCK_BASELINE: Baseline = { route: "TBS → LIS", dateLabel: "arrive by Thu Sep 25", meta: "1 stop · 8h20 · Turkish Airlines", price: 480 };
const MOCK_SKIPPED = [
  { city: "BCN · Barcelona", reason: "cheapest BCN → LIS leg departs before your 3-night minimum could be met" },
  { city: "DXB · Dubai", reason: "TBS → DXB → LIS priced at $530 — not cheaper than the $480 direct baseline" },
  { city: "AMS · Amsterdam", reason: "every TBS → AMS option departs before 07:00 and was dropped by your filter" },
];
const INITIAL_CHAT: ChatMsg[] = [
  { role: "ai", text: "Hi! Tell me what makes a stopover worth it for you, and I'll suggest cities to check between your origin and destination." },
];

// --- formatting helpers -------------------------------------------------
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDur(m: number): string { return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`; }
function fmtDateISO(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${DAYS[d.getDay()]} ${MONS[d.getMonth()]} ${d.getDate()}`;
}
function fmtTimeISO(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function fmtYmd(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return `${DAYS[d.getDay()]} ${MONS[d.getMonth()]} ${d.getDate()}`;
}
function legMeta(l: Leg): string {
  const stops = l.stops === 0 ? "nonstop" : `${l.stops} stop`;
  return `${l.dateLabel} · ${stops} · ${fmtDur(l.durMin)} · ${l.carrier}${l.overnight ? " · overnight" : ""}`;
}
const cityName = (code: string) => AIRPORTS.find((a) => a.code === code)?.name ?? code;

// --- map backend response -> internal Route shape -----------------------
/* eslint-disable @typescript-eslint/no-explicit-any */
function mapApiLeg(l: any): Leg {
  const sameDate = (l.departure_time || "").slice(0, 10) === (l.arrival_time || "").slice(0, 10);
  const times = `${fmtTimeISO(l.departure_time)} → ${fmtTimeISO(l.arrival_time)}${sameDate ? "" : "⁺¹"}`;
  return {
    from: l.origin, to: l.destination,
    dateLabel: fmtDateISO(l.departure_time),
    times,
    stops: l.stops,
    durMin: l.total_duration_min,
    carrier: (l.carriers || []).join(" / "),
    price: l.price,
    depHour: new Date(l.departure_time).getHours() || 0,
    overnight: !!l.overnight,
  };
}
function mapApiRoute(r: any, i: number): Route {
  const code = r.city; // engine returns the candidate IATA code as `city`
  return {
    city: cityName(code), code, country: COUNTRY[code] ?? "",
    stayNights: r.stay_nights, total: Math.round(r.total_price),
    savings: Math.round(r.savings), pct: Math.round(r.savings_pct),
    gradient: GRADIENTS[i % GRADIENTS.length],
    leg1: mapApiLeg(r.leg1), leg2: mapApiLeg(r.leg2),
  };
}
function mapApiBaseline(d: any, arriveBy: string): Baseline | null {
  if (!d.baseline) return null;
  const b = d.baseline;
  const stops = b.stops === 0 ? "nonstop" : `${b.stops} stop`;
  return {
    route: `${d.origin} → ${d.destination}`,
    dateLabel: `arrive by ${fmtYmd(arriveBy)}`,
    meta: `${stops} · ${fmtDur(b.total_duration_min)} · ${(b.carriers || []).join(" / ")}`,
    price: Math.round(b.price),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// === component ==========================================================
export default function Home() {
  const [origin, setOrigin] = useState("TBS");
  const [originCity, setOriginCity] = useState("Tbilisi");
  const [dest, setDest] = useState("LIS");
  const [destCity, setDestCity] = useState("Lisbon");
  const [departDate, setDepartDate] = useState("2026-09-12");
  const [arriveBy, setArriveBy] = useState("2026-09-25");
  const [quickSelected, setQuickSelected] = useState<string[]>(["IST", "ATH", "BEG", "VIE", "WAW"]);

  const [nonstopOnly, setNonstopOnly] = useState(false);
  const [departAfter7, setDepartAfter7] = useState(false);
  const [noOvernight, setNoOvernight] = useState(false);
  const [tab, setTab] = useState<"recommended" | "savings">("recommended");

  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string>("");

  const [baseline, setBaseline] = useState<Baseline | null>(MOCK_BASELINE);
  const [routes, setRoutes] = useState<Route[]>(MOCK_ROUTES);
  const [skipped, setSkipped] = useState(MOCK_SKIPPED);

  const [chat, setChat] = useState<ChatMsg[]>(INITIAL_CHAT);
  const [chatInput, setChatInput] = useState("");
  const [suggested, setSuggested] = useState<City[]>([]);

  const addCity = (code: string) => {
    if (!code || quickSelected.includes(code)) return;
    setQuickSelected([...quickSelected, code]);
  };
  const removeCity = (code: string) => setQuickSelected(quickSelected.filter((c) => c !== code));

  async function onSearch() {
    setLoading(true);
    setNote("");
    try {
      const res = await fetch(`${API}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin, destination: dest, depart_date: departDate,
          arrive_by: arriveBy || null, min_nights: 3,
          candidates: quickSelected,
          filters: { nonstop_only: nonstopOnly, depart_after_7: departAfter7, no_overnight: noOvernight },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `API error ${res.status}`);
      }
      const data = await res.json();
      setBaseline(mapApiBaseline(data, arriveBy));
      setRoutes((data.routes || []).map(mapApiRoute));
      setSkipped((data.skipped || []).map((s: { city: string; reason: string }) => ({ city: s.city, reason: s.reason })));
      if (!data.routes?.length) setNote("No stopover beat the direct route for these inputs.");
    } catch (e) {
      setNote(`Couldn't reach the backend (${String(e)}). Showing sample data — start the API with: uvicorn api.main:app --port 8000`);
    } finally {
      setLoading(false);
    }
  }

  async function sendChat() {
    const txt = chatInput.trim();
    if (!txt) return;
    const next: ChatMsg[] = [...chat, { role: "user", text: txt }];
    setChat(next);
    setChatInput("");
    try {
      const res = await fetch(`${API}/suggest-cities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination: dest, message: txt, count: 5 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `API error ${res.status}`);
      }
      const data = await res.json();
      setSuggested((data.cities || []).map((c: { code: string; name: string }) => ({ code: c.code, name: c.name })));
      setChat([...next, { role: "ai", text: `Here are cities I'd weigh between ${origin} and ${dest} — tap to add:`, showChips: true }]);
    } catch (e) {
      setChat([...next, { role: "ai", text: `AI advisor unavailable right now (${String(e)}). You can still pick cities from the list above.` }]);
    }
  }

  // client-side filter + sort (mirrors the design's logic; works on mock or API data)
  const visibleRoutes = useMemo(() => {
    let rs = routes.filter((r) => {
      const legs = [r.leg1, r.leg2];
      if (nonstopOnly && legs.some((l) => l.stops > 0)) return false;
      if (departAfter7 && legs.some((l) => l.depHour < 7)) return false;
      if (noOvernight && legs.some((l) => l.overnight)) return false;
      return true;
    });
    const recScore = (r: Route) =>
      r.savings + r.stayNights * 5 - (r.leg1.overnight || r.leg2.overnight ? 50 : 0) - (r.leg1.stops + r.leg2.stops) * 15;
    rs = rs.slice().sort((a, b) => (tab === "savings" ? b.savings - a.savings : recScore(b) - recScore(a)));
    return rs;
  }, [routes, nonstopOnly, departAfter7, noOvernight, tab]);

  const n = visibleRoutes.length;
  const airportOptions = AIRPORTS.filter((a) => !quickSelected.includes(a.code));

  // shared style fragments
  const inputCode: React.CSSProperties = { width: 58, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 22, color: "#16223A", border: "none", background: "transparent", outline: "none", letterSpacing: "0.04em" };
  const inputSub: React.CSSProperties = { flex: 1, minWidth: 0, fontWeight: 500, fontSize: 13, color: "#5A6577", border: "none", background: "transparent", outline: "none" };
  const fieldLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9AA0AB" };
  const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, padding: "10px 14px", borderRadius: 15, background: "#FBF7EF" };

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(120% 80% at 85% -10%,#FFE9D9 0%,rgba(255,233,217,0) 55%),radial-gradient(90% 70% at 0% 0%,#E3F3F0 0%,rgba(227,243,240,0) 50%),#FBF7EF" }}>
      {/* NAV */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 40px", backdropFilter: "saturate(1.4) blur(10px)", background: "rgba(251,247,239,0.72)", borderBottom: "1px solid rgba(22,34,58,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: "#FF5436", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(255,84,54,0.35)", transform: "rotate(-8deg)" }}>
            <span style={{ fontSize: 18, transform: "rotate(8deg)" }}>✈</span>
          </div>
          <span style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em", color: "#2E7DF1" }}>Detour</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <a href="#how" style={{ textDecoration: "none", color: "#5A6577", fontWeight: 600, fontSize: 14.5 }}>How it works</a>
          <a href="#results" style={{ textDecoration: "none", color: "#5A6577", fontWeight: 600, fontSize: 14.5 }}>Results</a>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#16223A", color: "#fff", fontWeight: 600, fontSize: 13.5, padding: "9px 16px", borderRadius: 999 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#5BE3A7", boxShadow: "0 0 0 3px rgba(91,227,167,0.25)" }} />
            Live Google Flights
          </span>
        </div>
      </nav>

      {/* HERO */}
      <header style={{ maxWidth: 1120, margin: "0 auto", padding: "64px 40px 8px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 15, marginBottom: 26 }}>
          <span>✈</span>
          <span>Stop somewhere you&apos;ll love — <span style={{ color: "#2E7DF1" }}>and pay less doing it</span></span>
        </div>
        <h1 style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: 60, lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 auto", maxWidth: "14ch" }}>
          Fly <span style={{ color: "#FF5436" }}>A → C → B</span> for less than A → B.
        </h1>
        <p style={{ fontSize: 19, lineHeight: 1.55, color: "#5A6577", maxWidth: "54ch", margin: "22px auto 0" }}>
          A direct flight isn&apos;t always the cheapest way to your destination. <span style={{ color: "#2E7DF1", fontWeight: 600 }}>Detour</span> checks whether flying via another city — and staying a few nights there — costs less than the direct ticket. Surprisingly often, it does.
        </p>

        {/* SEARCH CARD */}
        <div style={{ margin: "42px auto 0", maxWidth: 980, background: "#fff", border: "1px solid rgba(22,34,58,0.08)", borderRadius: 24, boxShadow: "0 24px 60px -24px rgba(22,34,58,0.28),0 4px 14px rgba(22,34,58,0.04)", padding: 14, textAlign: "left" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1fr auto", gap: 10, alignItems: "end" }}>
            <label style={field}>
              <span style={fieldLabel}>From</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <input value={origin} maxLength={3} onChange={(e) => setOrigin(e.target.value.toUpperCase())} style={inputCode} />
                <input value={originCity} onChange={(e) => setOriginCity(e.target.value)} style={inputSub} />
              </div>
            </label>
            <label style={field}>
              <span style={fieldLabel}>To</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <input value={dest} maxLength={3} onChange={(e) => setDest(e.target.value.toUpperCase())} style={inputCode} />
                <input value={destCity} onChange={(e) => setDestCity(e.target.value)} style={inputSub} />
              </div>
            </label>
            <label style={field}>
              <span style={fieldLabel}>Depart</span>
              <input type="date" value={departDate} onChange={(e) => setDepartDate(e.target.value)} style={{ fontWeight: 600, fontSize: 15, color: "#16223A", border: "none", background: "transparent", outline: "none" }} />
            </label>
            <button onClick={onSearch} style={{ height: 64, padding: "0 26px", border: "none", borderRadius: 16, background: "#FF5436", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer", boxShadow: "0 10px 24px -8px rgba(255,84,54,0.6)", display: "flex", alignItems: "center", gap: 9, whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 17 }}>🔍</span> Find stopovers
            </button>
          </div>

          {/* arrive by */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "14px 6px 12px", marginTop: 8, borderTop: "1px dashed rgba(22,34,58,0.1)" }}>
            <span style={{ fontSize: 13, color: "#9AA0AB", fontWeight: 600 }}>Arrive in {destCity} by</span>
            <input type="date" value={arriveBy} onChange={(e) => setArriveBy(e.target.value)} style={{ fontWeight: 600, fontSize: 13.5, color: "#16223A", border: "none", background: "transparent", outline: "none" }} />
          </div>

          {/* quick pick */}
          <div style={{ padding: "14px 6px", borderBottom: "1px dashed rgba(22,34,58,0.1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 11 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Pick cities to check</span>
              <span style={{ fontSize: 12.5, color: "#9AA0AB", fontWeight: 600 }}>Add airports from the list — {quickSelected.length} selected</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <select value="" onChange={(e) => { addCity(e.target.value); }} style={{ appearance: "none", WebkitAppearance: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#16223A", background: "#fff", border: "1px solid rgba(22,34,58,0.16)", borderRadius: 999, padding: "9px 16px", outline: "none" }}>
                <option value="">+ Add an airport…</option>
                {airportOptions.map((a) => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
              </select>
              {quickSelected.map((code) => (
                <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 13, padding: "7px 9px 7px 13px", borderRadius: 999, background: "#16223A", color: "#fff" }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: "#7FE3C0" }}>{code}</span>
                  {cityName(code)}
                  <button onClick={() => removeCity(code)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, border: "none", cursor: "pointer", borderRadius: "50%", background: "rgba(255,255,255,0.16)", color: "#fff", fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
            </div>
          </div>

          {/* or */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 6px" }}>
            <span style={{ height: 1, flex: 1, background: "rgba(22,34,58,0.1)" }} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9AA0AB" }}>or let AI suggest</span>
            <span style={{ height: 1, flex: 1, background: "rgba(22,34,58,0.1)" }} />
          </div>

          {/* AI chat */}
          <div style={{ background: "#F3FAF8", border: "1px solid rgba(14,158,142,0.22)", borderRadius: 18, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 8, background: "#0E9E8E", color: "#fff", fontSize: 14 }}>✨</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#0B7D70" }}>Chat to choose your stopover cities</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 240, overflow: "auto", paddingRight: 2 }}>
              {chat.map((m, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                    <div style={{ maxWidth: "82%", padding: "10px 13px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.5, background: m.role === "user" ? "#0E9E8E" : "#fff", color: m.role === "user" ? "#fff" : "#16223A", border: m.role === "user" ? "none" : "1px solid rgba(14,158,142,0.2)" }}>{m.text}</div>
                  </div>
                  {m.showChips && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingLeft: 2 }}>
                      {suggested.map((c) => (
                        <button key={c.code} onClick={() => addCity(c.code)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", color: "#0B7D70", border: "1px solid rgba(14,158,142,0.3)", fontWeight: 600, fontSize: 12.5, padding: "6px 12px", borderRadius: 999, cursor: "pointer" }}>
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{c.code}</span> {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} placeholder="e.g. I love jazz bars, cheap seafood, and a walkable harbor…" style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: "#16223A", border: "1px solid rgba(14,158,142,0.3)", background: "#fff", borderRadius: 11, padding: "10px 13px", outline: "none", fontWeight: 500 }} />
              <button onClick={sendChat} style={{ border: "none", cursor: "pointer", background: "#0E9E8E", color: "#fff", fontWeight: 700, fontSize: 13.5, padding: "11px 20px", borderRadius: 11, whiteSpace: "nowrap" }}>Send</button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18, fontSize: 13, color: "#9AA0AB", fontWeight: 500 }}>
          Free · ~250 live searches/month · two one-way tickets, compared apples-to-apples
        </div>
      </header>

      {/* HOW IT WORKS */}
      <section id="how" style={{ maxWidth: 1120, margin: "64px auto 0", padding: "0 40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
          {[
            ["01", "Price the direct route", "We find the cheapest acceptable one-way A → B. That's your baseline — the number to beat."],
            ["02", "Test cities on the way", "For each candidate C, we price A → C plus C → B with a multi-night stay that fits your dates."],
            ["03", "Keep the cheaper ones", "Routes that come out under baseline are ranked by savings. Bonus nights in a city you'd enjoy."],
          ].map(([num, title, body]) => (
            <div key={num} style={{ background: "#fff", border: "1px solid rgba(22,34,58,0.07)", borderRadius: 20, padding: 24 }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13, color: "#FF5436", marginBottom: 12 }}>{num}</div>
              <h3 style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: 19, margin: "0 0 8px", letterSpacing: "-0.01em" }}>{title}</h3>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: "#5A6577" }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* RESULTS */}
      <section id="results" style={{ maxWidth: 1120, margin: "56px auto 0", padding: "0 40px 90px", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "#9AA0AB", textTransform: "uppercase", marginBottom: 8 }}>{origin} → {dest} · arrive by {arriveBy}</div>
            <h2 style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: 34, letterSpacing: "-0.025em", margin: 0, lineHeight: 1.05 }}>
              {n === 0 ? "No cheaper stopovers" : `${tab === "savings" ? "Best savings" : "Recommended for you"} · ${n} routes`}
            </h2>
          </div>
          <div style={{ display: "inline-flex", background: "#fff", border: "1px solid rgba(22,34,58,0.09)", borderRadius: 13, padding: 4, gap: 2 }}>
            <button onClick={() => setTab("recommended")} style={{ border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, padding: "8px 18px", borderRadius: 9, background: tab !== "savings" ? "#16223A" : "transparent", color: tab !== "savings" ? "#fff" : "#5A6577" }}>Recommended</button>
            <button onClick={() => setTab("savings")} style={{ border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, padding: "8px 18px", borderRadius: 9, background: tab === "savings" ? "#16223A" : "transparent", color: tab === "savings" ? "#fff" : "#5A6577" }}>Best savings</button>
          </div>
        </div>

        {note && (
          <div style={{ background: "#FFF1ED", border: "1px solid rgba(216,64,31,0.25)", color: "#9A3418", borderRadius: 14, padding: "12px 16px", marginBottom: 14, fontSize: 13.5, fontWeight: 500 }}>{note}</div>
        )}

        {/* baseline strip */}
        {baseline && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap", background: "#16223A", color: "#fff", borderRadius: 18, padding: "18px 24px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,0.1)", fontSize: 18 }}>🎯</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#9FB0C9", letterSpacing: "0.03em" }}>THE PRICE TO BEAT · cheapest direct route</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 16, marginTop: 3 }}>{baseline.route} · {baseline.dateLabel} · {baseline.meta}</div>
              </div>
            </div>
            <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: "-0.02em" }}>${baseline.price}</div>
          </div>
        )}

        {/* filter chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "18px 0 22px" }}>
          {([["Nonstop only", nonstopOnly, () => setNonstopOnly(!nonstopOnly)],
             ["Depart after 7am", departAfter7, () => setDepartAfter7(!departAfter7)],
             ["No overnight legs", noOvernight, () => setNoOvernight(!noOvernight)]] as const).map(([label, on, toggle]) => (
            <button key={label} onClick={toggle} style={{ cursor: "pointer", fontWeight: 600, fontSize: 13, padding: "8px 14px", borderRadius: 999, background: on ? "#16223A" : "#fff", color: on ? "#fff" : "#5A6577", border: `1px solid ${on ? "#16223A" : "rgba(22,34,58,0.14)"}` }}>{label}</button>
          ))}
        </div>

        {/* route cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "relative" }}>
          {visibleRoutes.map((r) => (
            <div key={r.code} style={{ display: "flex", background: "#fff", border: "1px solid rgba(22,34,58,0.08)", borderRadius: 22, overflow: "hidden", boxShadow: "0 2px 6px rgba(22,34,58,0.04)" }}>
              <div style={{ position: "relative", width: 172, flex: "none", background: r.gradient }}>
                {PHOTOS[r.code] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={PHOTOS[r.code]} alt={r.city} loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                )}
                <div style={{ position: "absolute", left: 0, bottom: 0, right: 0, padding: 14, background: "linear-gradient(to top,rgba(8,14,28,0.86),rgba(8,14,28,0))" }}>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.85)", letterSpacing: "0.06em" }}>{r.code}</div>
                  <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: 18, color: "#fff", lineHeight: 1.1 }}>{r.city}</div>
                  <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>{r.country}</div>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0, padding: "18px 22px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: "#5A6577" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#FFF1ED", color: "#D8401F", padding: "4px 10px", borderRadius: 999, fontWeight: 700, fontSize: 11.5 }}>🌙 {r.stayNights} nights in {r.city}</span>
                  <span>via {r.city}</span>
                </div>
                <LegRow leg={r.leg1} />
                <LegRow leg={r.leg2} />
              </div>
              <div style={{ flex: "none", width: 188, background: r.pct >= 30 ? "#EAF7F3" : "#FAFCFB", borderLeft: "1px solid rgba(22,34,58,0.06)", padding: "18px 20px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", textAlign: "right", gap: 4 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#0E9E8E", color: "#fff", fontWeight: 700, fontSize: 13, padding: "5px 11px", borderRadius: 999 }}>↓ {r.pct}% off</div>
                <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: "-0.02em", color: "#0B7D70", marginTop: 6 }}>${r.savings}</div>
                <div style={{ fontSize: 12.5, color: "#9AA0AB", fontWeight: 500 }}>total <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: "#16223A", fontSize: 14 }}>${r.total}</span></div>
                <button style={{ marginTop: 12, border: "none", cursor: "pointer", background: "#16223A", color: "#fff", fontWeight: 700, fontSize: 13, padding: "9px 16px", borderRadius: 11, width: "100%" }}>Book legs →</button>
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(251,247,239,0.6)", backdropFilter: "blur(2px)", borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid rgba(22,34,58,0.08)", boxShadow: "0 12px 30px rgba(22,34,58,0.12)", padding: "14px 22px", borderRadius: 14, fontWeight: 600, color: "#16223A" }}>
                <span style={{ fontSize: 18, display: "inline-block", animation: "floaty 1s ease-in-out infinite" }}>✈</span>
                Pricing {origin} → {dest} via your candidate cities…
              </div>
            </div>
          )}

          {!loading && n === 0 && (
            <div style={{ textAlign: "center", padding: "48px 20px", background: "#fff", border: "1px dashed rgba(22,34,58,0.18)", borderRadius: 22, color: "#5A6577" }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>🧭</div>
              <div style={{ fontWeight: 700, fontSize: 17, color: "#16223A", fontFamily: "'Bricolage Grotesque',sans-serif" }}>No routes survived those filters</div>
              <div style={{ fontSize: 14, marginTop: 6 }}>Loosen a filter above to see more stopover options.</div>
            </div>
          )}
        </div>

        {/* skipped */}
        {skipped.length > 0 && (
          <div style={{ marginTop: 30, background: "#F4EFE4", border: "1px solid rgba(22,34,58,0.07)", borderRadius: 18, padding: "20px 24px" }}>
            <div style={{ fontWeight: 700, fontSize: 14.5, color: "#16223A", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15 }}>🚫</span> {skipped.length} candidate cities didn&apos;t make the cut
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {skipped.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 12, fontSize: 13.5, color: "#5A6577" }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: "#16223A", width: 160, flex: "none" }}>{s.city}</span>
                  <span>{s.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid rgba(22,34,58,0.08)", background: "rgba(251,247,239,0.6)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 9, background: "#FF5436", display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(-8deg)" }}><span style={{ fontSize: 15, transform: "rotate(8deg)" }}>✈</span></div>
            <span style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: 17, color: "#2E7DF1" }}>Detour</span>
          </div>
          <div style={{ fontSize: 12.5, color: "#9AA0AB", fontWeight: 500, maxWidth: "60ch", textAlign: "right" }}>
            Prices are two independent one-way tickets · the engine ranks by price, never by who paid.
          </div>
        </div>
      </footer>
    </div>
  );
}

function LegRow({ leg }: { leg: Leg }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, flex: 1 }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 15 }}>{leg.from}</span>
          <div style={{ flex: 1, height: 2, minWidth: 22, backgroundImage: "repeating-linear-gradient(90deg,#C9CFDA 0 6px,transparent 6px 12px)", position: "relative" }}>
            <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "#fff", padding: "0 5px", fontSize: 11 }}>✈</span>
          </div>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 15 }}>{leg.to}</span>
        </div>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, fontSize: 13, color: "#16223A", whiteSpace: "nowrap", flex: "none" }}>{leg.times}</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 14, color: "#16223A", flex: "none", minWidth: 44, textAlign: "right" }}>${leg.price}</span>
      </div>
      <div style={{ fontSize: 11.5, color: "#9AA0AB", fontWeight: 500 }}>{legMeta(leg)}</div>
    </div>
  );
}
