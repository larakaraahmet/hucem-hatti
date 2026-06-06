/**
 * HüCem Hattı — 2026 Dünya Kupası Oyuncu Analiz Platformu
 */
import { useEffect, useState, useRef } from "react";
import { Routes, Route, Link, useNavigate, useLocation } from "react-router-dom";
import ComparePage from "./pages/ComparePage.jsx";
import LeadersPage from "./pages/LeadersPage.jsx";
import RadarChart       from "./components/RadarChart.jsx";
import PlayerMatches    from "./components/PlayerMatches.jsx";
import XGTimeline       from "./components/XGTimeline.jsx";
import PercentileBars   from "./components/PercentileBars.jsx";
import ShotZones        from "./components/ShotZones.jsx";
import GoalTiming       from "./components/GoalTiming.jsx";
import ContribTimeline  from "./components/ContribTimeline.jsx";
import PitchView        from "./components/PitchView.jsx";
import ShotQuality      from "./components/ShotQuality.jsx";
import CompetitionStats from "./components/CompetitionStats.jsx";
import FormStrip        from "./components/FormStrip.jsx";
import BettingPanel     from "./components/BettingPanel.jsx";
import HomeAwaySplit    from "./components/HomeAwaySplit.jsx";
import ScoringPattern   from "./components/ScoringPattern.jsx";
import OpponentProfile  from "./components/OpponentProfile.jsx";
import MatchHighlights  from "./components/MatchHighlights.jsx";
import MinutesImpact    from "./components/MinutesImpact.jsx";
import AssistQuality      from "./components/AssistQuality.jsx";
import FixtureList        from "./components/FixtureList.jsx";
import Yardimetre         from "./components/Yardimetre.jsx";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// ─── Global CSS ───────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #f1f5f9; font-family: 'Inter','Segoe UI',sans-serif; color: #0f172a; }

/* ── Splash ──────────────────────────────── */
@keyframes hh-trophy {
  0%   { transform: translateY(-90px) scale(0.4) rotate(-15deg); opacity: 0; filter: blur(4px); }
  55%  { transform: translateY(10px)  scale(1.08) rotate(4deg);  opacity: 1; filter: blur(0); }
  75%  { transform: translateY(-6px)  scale(0.97) rotate(-1deg); }
  100% { transform: translateY(0)     scale(1)    rotate(0deg);  }
}
@keyframes hh-ball-arc {
  0%   { transform: translate(-140px, 80px) rotate(-80deg)  scale(0.3); opacity: 0; }
  55%  { transform: translate(0,     -12px) rotate(250deg)  scale(1.06); opacity: 1; }
  78%  { transform: translate(0,       5px) rotate(340deg)  scale(0.95); }
  100% { transform: translate(0,       0)   rotate(360deg)  scale(1); }
}
@keyframes hh-letter {
  0%   { opacity: 0; transform: scale(0.1) rotate(-25deg) translateY(16px); }
  55%  { transform: scale(1.18) rotate(4deg) translateY(-4px); }
  80%  { transform: scale(0.96) rotate(-1deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg) translateY(0); }
}
@keyframes hh-fade-up   { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
@keyframes hh-fadein    { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
@keyframes hh-splash-out{ 0% { opacity:1; transform:scale(1); } 100% { opacity:0; transform:scale(1.04); } }
@keyframes hh-shimmer   { from { background-position:-300% center; } to { background-position:300% center; } }
@keyframes hh-ring      { 0%,100%{ opacity:.55; transform:scale(.88); } 50%{ opacity:.9; transform:scale(1.12); } }
@keyframes hh-glow-ring { 0%{ transform:scale(.85); opacity:.6; } 65%{ transform:scale(1.8); opacity:0; } 100%{ transform:scale(.85); opacity:0; } }

/* ── Cards ──────────────────────────────── */
@keyframes hh-card-in { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:none; } }
button[data-card]        { transition: all .2s ease !important; }
button[data-card]:hover  {
  background: #ffffff !important;
  border-color: #f59e0b !important;
  box-shadow: 0 4px 20px rgba(0,0,0,.10), 0 0 0 1px rgba(245,158,11,.25) !important;
  transform: translateY(-2px) !important;
}

/* ── Inputs ─────────────────────────────── */
input { background:#ffffff !important; color:#0f172a !important; }
input:focus {
  border-color: #f59e0b !important;
  box-shadow: 0 0 0 3px rgba(245,158,11,.10) !important;
}

/* ── Dropdowns ──────────────────────────── */
li[data-dd]:hover { background: #fef9f0 !important; }

/* ── Match rows ─────────────────────────── */
.hh-match-row:hover { background: #fef9f0 !important; }

/* ── Scrollbar ──────────────────────────── */
::-webkit-scrollbar { width:5px; }
::-webkit-scrollbar-track { background:transparent; }
::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
::-webkit-scrollbar-thumb:hover { background:#94a3b8; }

/* ── Responsive grid ─────────────────────── */
.hh-grid2 {
  display:grid;
  grid-template-columns:repeat(2, minmax(0,1fr));
  gap:14px; margin-bottom:14px;
}
@media (max-width:680px) { .hh-grid2 { grid-template-columns:1fr; } }

/* ── WC2026 conf header ──────────────────── */
.hh-conf-header {
  display:flex; align-items:center; gap:12px;
  padding:10px 0 8px;
}
.hh-conf-header::before, .hh-conf-header::after {
  content:''; flex:1; height:1px;
  background:linear-gradient(90deg, transparent, var(--conf-color, #38bdf8), transparent);
  opacity:.35;
}

/* ── Team cards ─────────────────────────── */
.hh-team-card {
  position:relative; overflow:hidden;
  display:flex; flex-direction:column; align-items:center; gap:8px;
  padding:20px 12px 16px;
  background:#ffffff;
  border:1px solid #e2e8f0;
  border-radius:14px; cursor:pointer;
  transition:all .2s ease;
  animation:hh-card-in .4s ease forwards;
  opacity:0;
  box-shadow:0 1px 3px rgba(0,0,0,.06);
}
.hh-team-card:hover {
  border-color:var(--conf-color, #f59e0b);
  box-shadow:0 4px 20px rgba(0,0,0,.10), 0 0 0 1px rgba(245,158,11,.2);
  transform:translateY(-3px);
}
.hh-team-card::before {
  content:''; position:absolute; top:0; left:0; right:0; height:3px;
  background:var(--conf-color, #38bdf8);
  opacity:.8;
}

/* ── Player card ────────────────────────── */
.hh-player-card {
  display:flex; flex-direction:column; align-items:flex-start; gap:5px;
  padding:13px 16px;
  background:#ffffff; border:1px solid #e2e8f0;
  border-radius:10px; cursor:pointer; text-align:left; color:inherit;
  animation:hh-card-in .35s ease forwards; opacity:0;
  transition:all .18s ease;
  border-left:3px solid #e2e8f0;
  box-shadow:0 1px 2px rgba(0,0,0,.04);
}
.hh-player-card:hover {
  border-color:#f59e0b;
  border-left-color:#f59e0b;
  transform:translateX(3px);
  box-shadow:0 4px 16px rgba(0,0,0,.08);
}
`;
if (typeof document !== "undefined" && !document.getElementById("hh-css")) {
  const el = document.createElement("style");
  el.id = "hh-css"; el.textContent = CSS; document.head.appendChild(el);
}

// ─── Bayraklar ────────────────────────────────────────────────────────────────
const FLAGS = {
  // WC 2026 — 48 takım
  Algeria:"🇩🇿",Argentina:"🇦🇷",Australia:"🇦🇺",Austria:"🇦🇹",
  Belgium:"🇧🇪","Bosnia and Herzegovina":"🇧🇦",Brazil:"🇧🇷",
  Canada:"🇨🇦","Cape Verde Islands":"🇨🇻",Colombia:"🇨🇴",
  "Congo DR":"🇨🇩",Croatia:"🇭🇷","Curaçao":"🇨🇼",
  "Czech Republic":"🇨🇿",Ecuador:"🇪🇨",Egypt:"🇪🇬",
  England:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",France:"🇫🇷",Germany:"🇩🇪",Ghana:"🇬🇭",
  Haiti:"🇭🇹",Iran:"🇮🇷",Iraq:"🇮🇶","Ivory Coast":"🇨🇮",
  Japan:"🇯🇵",Jordan:"🇯🇴",Mexico:"🇲🇽",Morocco:"🇲🇦",
  Netherlands:"🇳🇱","New Zealand":"🇳🇿",Norway:"🇳🇴",
  Panama:"🇵🇦",Paraguay:"🇵🇾",Portugal:"🇵🇹",Qatar:"🇶🇦",
  "Saudi Arabia":"🇸🇦",Scotland:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",Senegal:"🇸🇳",
  "South Africa":"🇿🇦","South Korea":"🇰🇷",Spain:"🇪🇸",
  Sweden:"🇸🇪",Switzerland:"🇨🇭",Tunisia:"🇹🇳",Turkey:"🇹🇷",
  "United States":"🇺🇸",Uruguay:"🇺🇾",Uzbekistan:"🇺🇿",
  "New Zealand":"🇳🇿",
  // Diğer
  Albania:"🇦🇱",Cameroon:"🇨🇲",Chile:"🇨🇱","Costa Rica":"🇨🇷",
  Denmark:"🇩🇰",Finland:"🇫🇮",Georgia:"🇬🇪",Hungary:"🇭🇺",
  Italy:"🇮🇹","North Macedonia":"🇲🇰",Peru:"🇵🇪",Poland:"🇵🇱",
  Romania:"🇷🇴",Russia:"🇷🇺",Serbia:"🇷🇸",Slovakia:"🇸🇰",
  Slovenia:"🇸🇮",Ukraine:"🇺🇦",Venezuela:"🇻🇪",Wales:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",
};
const flag = c => FLAGS[c] ?? "🏳️";

// ─── 2026 Dünya Kupası katılımcıları ─────────────────────────────────────────
const WC2026_TEAMS = new Set([
  // CONCACAF (6)
  "United States","Canada","Mexico","Panama","Haiti","Curaçao",
  // UEFA (16)
  "Germany","France","Spain","England","Portugal","Netherlands",
  "Croatia","Austria","Switzerland","Turkey","Scotland","Czech Republic",
  "Belgium","Bosnia and Herzegovina","Norway","Sweden",
  // CONMEBOL (6)
  "Argentina","Brazil","Uruguay","Colombia","Ecuador","Paraguay",
  // CAF (9+1)
  "Morocco","Senegal","Algeria","Ivory Coast","Cape Verde Islands",
  "Egypt","Ghana","South Africa","Tunisia","Congo DR",
  // AFC (8+1)
  "Japan","South Korea","Australia","Iran","Saudi Arabia",
  "Iraq","Jordan","Qatar","Uzbekistan",
  // OFC (1)
  "New Zealand",
]);

const CONF_COLOR = {
  CONCACAF:"#f97316", UEFA:"#38bdf8", CONMEBOL:"#f59e0b",
  CAF:"#10b981", AFC:"#a78bfa", OFC:"#ec4899",
};
const CONF_META = {
  CONCACAF:{ label:"CONCACAF", sub:"Kuzey Amerika · Ev Sahipleri", icon:"🌎" },
  UEFA:    { label:"UEFA",     sub:"Avrupa",                       icon:"⭐" },
  CONMEBOL:{ label:"CONMEBOL", sub:"Güney Amerika",                icon:"🌟" },
  CAF:     { label:"CAF",      sub:"Afrika",                       icon:"🌍" },
  AFC:     { label:"AFC",      sub:"Asya",                         icon:"🌏" },
  OFC:     { label:"OFC",      sub:"Okyanusya",                    icon:"🏝️" },
};
const TEAM_CONF = {
  "United States":"CONCACAF","Canada":"CONCACAF","Mexico":"CONCACAF",
  "Panama":"CONCACAF","Haiti":"CONCACAF","Curaçao":"CONCACAF",
  "Germany":"UEFA","France":"UEFA","Spain":"UEFA","England":"UEFA",
  "Portugal":"UEFA","Netherlands":"UEFA","Croatia":"UEFA","Austria":"UEFA",
  "Switzerland":"UEFA","Turkey":"UEFA","Scotland":"UEFA","Czech Republic":"UEFA",
  "Belgium":"UEFA","Bosnia and Herzegovina":"UEFA","Norway":"UEFA","Sweden":"UEFA",
  "Argentina":"CONMEBOL","Brazil":"CONMEBOL","Uruguay":"CONMEBOL",
  "Colombia":"CONMEBOL","Ecuador":"CONMEBOL","Paraguay":"CONMEBOL",
  "Morocco":"CAF","Senegal":"CAF","Algeria":"CAF","Ivory Coast":"CAF",
  "Cape Verde Islands":"CAF","Egypt":"CAF","Ghana":"CAF",
  "South Africa":"CAF","Tunisia":"CAF","Congo DR":"CAF",
  "Japan":"AFC","South Korea":"AFC","Australia":"AFC","Iran":"AFC",
  "Saudi Arabia":"AFC","Iraq":"AFC","Jordan":"AFC","Qatar":"AFC","Uzbekistan":"AFC",
  "New Zealand":"OFC",
};

// ─── Player photo hook (backend proxy) ────────────────────────────────────────
function usePlayerPhoto(playerId) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    fetch(`${API_BASE}/player/${playerId}/photo`)
      .then(r => r.ok ? r.json() : { url: null })
      .then(d => { if (!cancelled && d.url) setUrl(d.url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [playerId]);
  return url;
}

// Baş harf avatarı
function Avatar({ name, size = 96 }) {
  const parts = (name || "?").split(" ");
  const text  = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : (name || "?")[0];
  return (
    <div style={{
      width: size, height: size, borderRadius: 14, flexShrink: 0,
      background: "linear-gradient(135deg, #0c2040, #162d50)",
      border: "2px solid rgba(245,158,11,.25)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.33, fontWeight: 900, color: "#f59e0b",
      letterSpacing: -1, textTransform: "uppercase",
    }}>
      {text.toUpperCase()}
    </div>
  );
}

// ─── Oyuncu mini fotoğrafı / avatar ──────────────────────────────────────────
function PlayerPhotoMini({ playerId, name, size = 40 }) {
  const [url,   setUrl]   = useState(null);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    fetch(`${API_BASE}/player/${playerId}/photo`)
      .then(r => r.ok ? r.json() : { url: null })
      .then(d => { setUrl(d.url || null); setTried(true); })
      .catch(() => setTried(true));
  }, [playerId]);

  const initials = (() => {
    const parts = (name || "?").split(" ");
    return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : (name || "?")[0]).toUpperCase();
  })();

  if (url) return (
    <img src={url} alt={name}
      style={{ width:size, height:size, borderRadius:9, objectFit:"cover", objectPosition:"top center",
               flexShrink:0, border:"1.5px solid #e2e8f0" }}
      onError={() => setUrl(null)} />
  );
  return (
    <div style={{
      width:size, height:size, borderRadius:9, flexShrink:0,
      background:"linear-gradient(135deg,#0c2040,#162d50)",
      border:"1.5px solid rgba(245,158,11,.22)",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:Math.round(size * 0.34), fontWeight:900, color:"#f59e0b",
    }}>{initials}</div>
  );
}

// ─── WC2026 Geri sayım + İstatistik akışı ────────────────────────────────────
const WC_START = new Date("2026-06-11T12:00:00");

function WC2026Ticker() {
  const [now,     setNow]     = useState(new Date());
  const [leaders, setLeaders] = useState([]);
  const [tick,    setTick]    = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/stats/leaders`)
      .then(r => r.ok ? r.json() : [])
      .then(setLeaders)
      .catch(() => {});
  }, []);

  // Ticker döngüsü
  useEffect(() => {
    if (!leaders.length) return;
    const id = setInterval(() => setTick(t => (t + 1) % leaders.length), 3200);
    return () => clearInterval(id);
  }, [leaders]);

  const diff  = Math.max(0, WC_START - now);
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins  = Math.floor((diff % 3600000)  / 60000);
  const secs  = Math.floor((diff % 60000)    / 1000);

  const pad = n => String(n).padStart(2, "0");

  return (
    <div style={{
      background:"#ffffff", border:"1px solid #e2e8f0",
      borderRadius:14, marginBottom:20, overflow:"hidden",
      boxShadow:"0 1px 3px rgba(0,0,0,.06)",
    }}>
      {/* Üst çizgi — WC renkleri */}
      <div style={{ height:3, background:"linear-gradient(90deg,#22c55e,#f59e0b,#ef4444,#3b82f6)", opacity:.85 }} />

      <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap:0 }}>
        {/* Geri sayım */}
        <div style={{
          display:"flex", alignItems:"center", gap:14, padding:"12px 20px",
          borderRight:"1px solid #f1f5f9", flexShrink:0,
        }}>
          <span style={{ fontSize:22 }}>⏱️</span>
          <div>
            <div style={{ fontSize:9, fontWeight:800, letterSpacing:".1em", color:"#94a3b8", textTransform:"uppercase", marginBottom:3 }}>
              WC 2026&rsquo;ya
            </div>
            <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
              {[
                { v: days,     l: "gün"  },
                { v: hours,    l: "sa"   },
                { v: mins,     l: "dk"   },
                { v: secs,     l: "sn"   },
              ].map(({ v, l }) => (
                <span key={l} style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                  <span style={{ fontSize:20, fontWeight:900, color:"#f59e0b", lineHeight:1, fontVariantNumeric:"tabular-nums" }}>{pad(v)}</span>
                  <span style={{ fontSize:8, color:"#94a3b8", fontWeight:700 }}>{l}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Kayan istatistikler */}
        <div style={{ flex:1, padding:"12px 20px", overflow:"hidden", minWidth:0 }}>
          {leaders.length > 0 ? (
            <div style={{ animation:"hh-fade-up .4s ease" }} key={tick}>
              <div style={{ fontSize:9, fontWeight:800, letterSpacing:".1em", color:"#94a3b8", textTransform:"uppercase", marginBottom:5 }}>
                Platform İstatistiği
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                <span style={{ fontSize:18 }}>{leaders[tick]?.icon ?? "⚽"}</span>
                <span style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{leaders[tick]?.label}</span>
                <span style={{
                  background:"#fef3c7", border:"1px solid #fde68a",
                  borderRadius:6, color:"#d97706", fontSize:11, fontWeight:800, padding:"2px 10px",
                }}>{leaders[tick]?.value}</span>
                <span style={{ fontSize:12, color:"#64748b" }}>{leaders[tick]?.player}</span>
                <span style={{ fontSize:16 }}>{leaders[tick]?.flag ?? ""}</span>
              </div>
            </div>
          ) : (
            <div style={{ fontSize:12, color:"#94a3b8" }}>Veriler yükleniyor…</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── FIFA Dünya Kupası SVG Kupası ─────────────────────────────────────────────
function TrophySVG({ size = 130 }) {
  return (
    <svg viewBox="0 0 100 170" width={size} height={size * 1.7}
         xmlns="http://www.w3.org/2000/svg"
         style={{ filter: "drop-shadow(0 0 28px rgba(245,158,11,.7))", overflow:"visible" }}>
      <defs>
        <linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#fef9c3"/>
          <stop offset="30%"  stopColor="#fbbf24"/>
          <stop offset="70%"  stopColor="#d97706"/>
          <stop offset="100%" stopColor="#92400e"/>
        </linearGradient>
        <linearGradient id="tg2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#fef9c3"/>
          <stop offset="100%" stopColor="#f59e0b"/>
        </linearGradient>
        <linearGradient id="mg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#4ade80"/>
          <stop offset="50%"  stopColor="#16a34a"/>
          <stop offset="100%" stopColor="#14532d"/>
        </linearGradient>
        <radialGradient id="gg" cx="38%" cy="32%" r="68%">
          <stop offset="0%"   stopColor="#bfdbfe"/>
          <stop offset="45%"  stopColor="#3b82f6"/>
          <stop offset="100%" stopColor="#1e3a8a"/>
        </radialGradient>
      </defs>

      {/* Kaide — yeşil/altın katmanlar */}
      <rect x="10" y="158" width="80" height="9"  rx="2.5" fill="url(#mg)"/>
      <rect x="17" y="147" width="66" height="13" rx="2"   fill="url(#tg)"/>
      <rect x="24" y="136" width="52" height="13" rx="2"   fill="url(#mg)"/>
      <rect x="30" y="126" width="40" height="12" rx="2"   fill="url(#tg)"/>
      {/* Kaide parlaklık çizgisi */}
      <rect x="30" y="127" width="40" height="2" rx="1" fill="#fef9c3" opacity=".25"/>

      {/* Sap */}
      <rect x="43" y="96" width="14" height="32" rx="4" fill="url(#tg)"/>
      <rect x="46" y="98" width="4"  height="28" rx="2" fill="#fef9c3" opacity=".2"/>

      {/* Kupa gövdesi — yukarıya doğru açılan */}
      <path d="M12,44 Q6,68 16,90 Q26,110 50,113 Q74,110 84,90 Q94,68 88,44 Z" fill="url(#tg)"/>
      {/* İç gölge */}
      <path d="M22,48 Q18,70 26,88 Q34,106 50,109 Q66,106 74,88 Q82,70 78,48 Z"
            fill="#92400e" opacity=".18"/>
      {/* Sol vurgu */}
      <path d="M20,50 Q14,72 22,90" stroke="#fef9c3" strokeWidth="3.5"
            fill="none" strokeLinecap="round" opacity=".3"/>

      {/* Üst çember */}
      <ellipse cx="50" cy="44" rx="38" ry="9"   fill="#92400e"/>
      <ellipse cx="50" cy="44" rx="36" ry="7.5" fill="url(#tg)"/>
      <ellipse cx="50" cy="42" rx="33" ry="5"   fill="#fef9c3" opacity=".15"/>

      {/* Kulplar */}
      <path d="M12,50 Q-6,58 -4,80 Q0,100 16,98"
            stroke="url(#tg)" strokeWidth="11" strokeLinecap="round" fill="none"/>
      <path d="M12,50 Q-4,60 -2,80" stroke="#fef9c3" strokeWidth="2.5"
            strokeLinecap="round" fill="none" opacity=".25"/>
      <path d="M88,50 Q106,58 104,80 Q100,100 84,98"
            stroke="url(#tg)" strokeWidth="11" strokeLinecap="round" fill="none"/>
      <path d="M88,50 Q104,60 102,80" stroke="#fef9c3" strokeWidth="2.5"
            strokeLinecap="round" fill="none" opacity=".25"/>

      {/* Dünya — tepe */}
      <circle cx="50" cy="26" r="18" fill="url(#gg)"/>
      <ellipse cx="50" cy="26" rx="18" ry="7"  stroke="#e0f2fe" strokeWidth=".7" fill="none" opacity=".3"/>
      <ellipse cx="50" cy="26" rx="7"  ry="18" stroke="#e0f2fe" strokeWidth=".7" fill="none" opacity=".3"/>
      <line x1="32" y1="26" x2="68" y2="26"   stroke="#e0f2fe" strokeWidth=".7" opacity=".3"/>
      {/* Kıtalar */}
      <path d="M39,21 Q42,15 49,18 Q54,15 57,21 Q59,28 55,31 Q50,34 44,31 Q39,27 39,21Z"
            fill="#166534" opacity=".75"/>
      <path d="M57,17 Q63,14 66,19 Q68,26 63,30 Q58,27 57,17Z" fill="#166534" opacity=".7"/>
      <path d="M32,24 Q36,19 39,22 Q38,28 35,29 Q31,27 32,24Z" fill="#166534" opacity=".65"/>
      {/* Işık yansıması */}
      <ellipse cx="43" cy="20" rx="6" ry="4" fill="white" opacity=".16"
               transform="rotate(-20 43 20)"/>

      {/* Sol figür */}
      <circle cx="41" cy="48" r="3.2" fill="#fbbf24"/>
      <line x1="41" y1="51"  x2="41" y2="62" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M41,54 Q36,44 39,37"  stroke="#fbbf24" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <line x1="41" y1="54"  x2="46" y2="58" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="41" y1="62"  x2="37" y2="71" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="41" y1="62"  x2="45" y2="71" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round"/>

      {/* Sağ figür */}
      <circle cx="59" cy="48" r="3.2" fill="#fbbf24"/>
      <line x1="59" y1="51"  x2="59" y2="62" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="59" y1="54"  x2="54" y2="58" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M59,54 Q64,44 61,37"  stroke="#fbbf24" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <line x1="59" y1="62"  x2="55" y2="71" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="59" y1="62"  x2="63" y2="71" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Adidas Dünya Kupası Topu SVG ─────────────────────────────────────────────
function WorldCupBallSVG({ size = 88 }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size}
         xmlns="http://www.w3.org/2000/svg"
         style={{ filter: "drop-shadow(0 4px 18px rgba(0,0,0,.55))", overflow: "visible" }}>
      <defs>
        {/* Ana top gradyanı — 3D görünüm */}
        <radialGradient id="bg1" cx="38%" cy="32%" r="65%">
          <stop offset="0%"   stopColor="#ffffff"/>
          <stop offset="35%"  stopColor="#f0f4f8"/>
          <stop offset="70%"  stopColor="#c8d6e0"/>
          <stop offset="100%" stopColor="#8fa8b8"/>
        </radialGradient>
        {/* Panel karanlık gradyanı */}
        <radialGradient id="pg1" cx="50%" cy="50%" r="55%">
          <stop offset="0%"   stopColor="#1a2a3a"/>
          <stop offset="100%" stopColor="#0a1520"/>
        </radialGradient>
        {/* Panel gradyanı — renkli */}
        <radialGradient id="pg2" cx="50%" cy="50%" r="55%">
          <stop offset="0%"   stopColor="#1d4ed8"/>
          <stop offset="100%" stopColor="#0c2460"/>
        </radialGradient>
        <radialGradient id="pg3" cx="50%" cy="50%" r="55%">
          <stop offset="0%"   stopColor="#b45309"/>
          <stop offset="100%" stopColor="#78350f"/>
        </radialGradient>
        {/* Clippath */}
        <clipPath id="ballClip">
          <circle cx="50" cy="50" r="47"/>
        </clipPath>
        {/* Parlaklık efekti */}
        <radialGradient id="shine" cx="35%" cy="28%" r="40%">
          <stop offset="0%"   stopColor="white" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="white" stopOpacity="0"/>
        </radialGradient>
        {/* Gölge */}
        <radialGradient id="shadow" cx="50%" cy="50%" r="50%">
          <stop offset="60%"  stopColor="black" stopOpacity="0"/>
          <stop offset="100%" stopColor="black" stopOpacity="0.22"/>
        </radialGradient>
      </defs>

      {/* Zemin gölgesi */}
      <ellipse cx="50" cy="97" rx="32" ry="4" fill="black" opacity=".28"/>

      {/* Top yüzeyi */}
      <circle cx="50" cy="50" r="47" fill="url(#bg1)"/>

      {/* Adidas tarzı geometrik paneller — kesik çizgi deseni */}
      <g clipPath="url(#ballClip)">
        {/* Merkez altıgen benzeri koyu panel */}
        <path d="M50,21 L65,30 L65,50 L50,59 L35,50 L35,30 Z"
              fill="url(#pg1)" opacity=".88"/>
        {/* Sol üst panel */}
        <path d="M19,24 L35,30 L35,50 L20,55 L10,40 Z"
              fill="url(#pg2)" opacity=".78"/>
        {/* Sağ üst panel */}
        <path d="M81,24 L65,30 L65,50 L80,55 L90,40 Z"
              fill="url(#pg1)" opacity=".75"/>
        {/* Alt sol panel */}
        <path d="M20,55 L35,50 L50,59 L44,75 L25,72 Z"
              fill="url(#pg3)" opacity=".7"/>
        {/* Alt sağ panel */}
        <path d="M80,55 L65,50 L50,59 L56,75 L75,72 Z"
              fill="url(#pg2)" opacity=".72"/>
        {/* Alt merkez panel */}
        <path d="M44,75 L50,59 L56,75 L50,88 Z"
              fill="url(#pg1)" opacity=".68"/>
        {/* Üst sol küçük */}
        <path d="M35,5 L50,21 L35,30 L22,18 Z"
              fill="url(#pg2)" opacity=".65"/>
        {/* Üst sağ küçük */}
        <path d="M65,5 L78,18 L65,30 L50,21 Z"
              fill="url(#pg1)" opacity=".6"/>

        {/* Panel dikiş çizgileri */}
        <path d="M50,21 L65,30 L65,50 L50,59 L35,50 L35,30 Z"
              fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1"/>
        <path d="M19,24 L35,30 L35,50 L20,55 L10,40 Z"
              fill="none" stroke="rgba(255,255,255,.2)" strokeWidth=".8"/>
        <path d="M81,24 L65,30 L65,50 L80,55 L90,40 Z"
              fill="none" stroke="rgba(255,255,255,.2)" strokeWidth=".8"/>
        <path d="M20,55 L35,50 L50,59 L44,75 L25,72 Z"
              fill="none" stroke="rgba(255,255,255,.18)" strokeWidth=".8"/>
        <path d="M80,55 L65,50 L50,59 L56,75 L75,72 Z"
              fill="none" stroke="rgba(255,255,255,.18)" strokeWidth=".8"/>
        <path d="M44,75 L50,59 L56,75 L50,88 Z"
              fill="none" stroke="rgba(255,255,255,.15)" strokeWidth=".8"/>
        <path d="M35,5 L50,21 L35,30 L22,18 Z"
              fill="none" stroke="rgba(255,255,255,.15)" strokeWidth=".8"/>
        <path d="M65,5 L78,18 L65,30 L50,21 Z"
              fill="none" stroke="rgba(255,255,255,.15)" strokeWidth=".8"/>

        {/* Adidas logosu — 3 çizgi siyah */}
        <g transform="translate(42,35) rotate(-15)" opacity=".65">
          <rect x="0"  y="0" width="3" height="11" rx="1.5" fill="#111"/>
          <rect x="5"  y="2" width="3" height="9"  rx="1.5" fill="#111"/>
          <rect x="10" y="4" width="3" height="7"  rx="1.5" fill="#111"/>
        </g>

        {/* Kenar koyulaştırma */}
        <circle cx="50" cy="50" r="47" fill="url(#shadow)"/>
      </g>

      {/* Dış halka */}
      <circle cx="50" cy="50" r="47"
              fill="none" stroke="rgba(0,0,0,.18)" strokeWidth="1"/>

      {/* Parlaklık yansıması */}
      <circle cx="50" cy="50" r="47" fill="url(#shine)"/>

      {/* Parlak nokta */}
      <ellipse cx="36" cy="30" rx="9" ry="6"
               fill="white" opacity=".28"
               transform="rotate(-25 36 30)"/>
    </svg>
  );
}

// ─── Splash ────────────────────────────────────────────────────────────────────
function SplashScreen({ onDone }) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setOut(true), 2600);
    const t2 = setTimeout(onDone,              3100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  const title  = "HüCem Hattı";
  const isBlue = new Set([0, 6]);   // H positions
  const isGold = new Set([2]);      // C

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "radial-gradient(ellipse 140% 100% at 50% 60%, #0c2442 0%, #050c18 60%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      animation: out ? "hh-splash-out .55s ease forwards" : "none",
      userSelect: "none",
    }}>
      {/* Nabız halkaları */}
      {[500, 340, 200].map((s, i) => (
        <div key={s} style={{
          position: "absolute", width: s, height: s, borderRadius: "50%",
          border: "1px solid rgba(245,158,11,.06)",
          animation: `hh-ring ${2.6 + i * .5}s ease-in-out infinite`,
          animationDelay: `${i * .35}s`,
        }} />
      ))}
      <div style={{
        position: "absolute", width: 220, height: 220, borderRadius: "50%",
        border: "2px solid rgba(245,158,11,.18)",
        animation: "hh-glow-ring 2.2s ease-out .3s infinite",
      }} />

      {/* Kupa + Top */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 18, marginBottom: 28 }}>
        <div style={{
          animation: "hh-trophy .9s cubic-bezier(.34,1.56,.64,1) .1s forwards",
          opacity: 0,
        }}>
          <TrophySVG size={110} />
        </div>
        <div style={{
          animation: "hh-ball-arc .95s cubic-bezier(.34,1.42,.64,1) .55s forwards",
          opacity: 0,
          marginBottom: 12,
        }}>
          <WorldCupBallSVG size={74} />
        </div>
      </div>

      {/* Başlık */}
      <h1 style={{
        fontSize: "clamp(42px,8vw,66px)", fontWeight: 900,
        letterSpacing: "-1.5px", lineHeight: 1, marginBottom: 20,
        display: "flex", gap: 0,
      }}>
        {title.split("").map((ch, i) => (
          <span key={i} style={{
            display: ch === " " ? "inline" : "inline-block",
            color:      isBlue.has(i) ? "#38bdf8" : isGold.has(i) ? "#f59e0b" : "#ffffff",
            textShadow: isBlue.has(i)
              ? "0 0 28px rgba(56,189,248,.7)"
              : isGold.has(i) ? "0 0 28px rgba(245,158,11,.7)" : "none",
            opacity: 0,
            animation: "hh-letter .55s cubic-bezier(.34,1.56,.64,1) forwards",
            animationDelay: `${.95 + i * .072}s`,
          }}>{ch}</span>
        ))}
      </h1>

      {/* Alt yazı */}
      <div style={{
        fontSize: 14, fontWeight: 800, letterSpacing: ".28em",
        background: "linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)",
        backgroundSize: "200% auto",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        animation: "hh-fade-up .6s ease forwards, hh-shimmer 3s linear 1.9s infinite",
        opacity: 0, animationDelay: "1.85s, 2.4s",
        marginBottom: 8,
      }}>2026 FIFA DÜNYA KUPASI</div>

      <div style={{
        fontSize: 11, fontWeight: 600, letterSpacing: ".22em",
        color: "#334155", opacity: 0,
        animation: "hh-fade-up .6s ease forwards",
        animationDelay: "2.1s",
      }}>OYUNCU ANALİZ PLATFORMU</div>
    </div>
  );
}

// ─── Oyuncu arama autocomplete ─────────────────────────────────────────────────
function PlayerSearch({ onSelect, placeholder = "Oyuncu ara…" }) {
  const [q,    setQ]    = useState("");
  const [res,  setRes]  = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  const onChange = e => {
    const v = e.target.value; setQ(v);
    clearTimeout(timer.current);
    if (v.length < 2) { setRes([]); setOpen(false); return; }
    timer.current = setTimeout(() => {
      fetch(`${API_BASE}/players/search?q=${encodeURIComponent(v)}`)
        .then(r => r.ok ? r.json() : [])
        .then(d => { setRes(d); setOpen(d.length > 0); })
        .catch(() => {});
    }, 240);
  };

  const pick = p => { setQ(p.isim); setOpen(false); onSelect(p.oyuncu_id, p.isim); };

  return (
    <div style={S.acWrap}>
      <div style={S.searchBox}>
        <span style={S.searchIcon}>🔍</span>
        <input
          type="text" value={q} onChange={onChange} placeholder={placeholder}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
          onFocus={() => res.length > 0 && setOpen(true)}
          style={S.searchInput}
        />
      </div>
      {open && (
        <ul style={S.dropdown}>
          {res.map(p => (
            <li key={p.oyuncu_id} data-dd onMouseDown={() => pick(p)} style={S.ddItem}>
              <span style={S.ddName}>{p.isim}</span>
              {p.mevki    && <span style={S.ddMeta}>{p.mevki}</span>}
              {p.milliyet && <span style={S.ddMeta}>{flag(p.milliyet)} {p.milliyet}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


// ─── Anasayfa: 2026 WC ülke kartları ─────────────────────────────────────────
function TeamsPage({ onTeamSelect }) {
  const [teams,   setTeams]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState("maclar"); // "maclar" | "oyuncular"

  useEffect(() => {
    fetch(`${API_BASE}/teams`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setTeams(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ textAlign:"center", paddingTop:80 }}>
      <div style={{ animation:"hh-trophy .9s ease-in-out infinite alternate", display:"inline-block" }}>
        <TrophySVG size={60} />
      </div>
      <div style={{ color:"#334155", fontSize:13, marginTop:16 }}>Yükleniyor…</div>
    </div>
  );

  // Sadece 2026 WC takımlarını filtrele
  const wc = teams.filter(t => WC2026_TEAMS.has(t.ulke));

  // Konfederasyon sırasına göre grupla
  const ORDER = ["CONCACAF","UEFA","CONMEBOL","CAF","AFC","OFC"];
  const grouped = {};
  ORDER.forEach(c => { grouped[c] = []; });
  wc.forEach(t => {
    const c = TEAM_CONF[t.ulke] ?? "UEFA";
    if (!grouped[c]) grouped[c] = [];
    grouped[c].push(t);
  });

  const total = wc.reduce((s, t) => s + t.oyuncu_sayisi, 0);

  return (
    <>
      {/* WC2026 Geri sayım + istatistik akışı */}
      <WC2026Ticker />

      {/* WC2026 Banner */}
      <div style={S.wcBanner}>
        <div style={S.wcBannerGlow} />
        <TrophySVG size={52} />
        <div style={S.wcBannerText}>
          <span style={S.wcBannerTitle}>2026 FIFA Dünya Kupası</span>
          <span style={S.wcBannerSub}>
            ABD · Kanada · Meksika &nbsp;·&nbsp; {wc.length} Takım &nbsp;·&nbsp; {total.toLocaleString()} Oyuncu
          </span>
        </div>
        <div style={S.wcBannerBadge}>48<span style={{ fontSize:10, fontWeight:600 }}>Takım</span></div>
      </div>

      {/* ── Ana sekme navigasyonu ── */}
      <div style={{
        display:"flex", gap:8, marginBottom:16,
        background:"#ffffff", borderRadius:12, padding:6,
        border:"1px solid #e2e8f0", boxShadow:"0 1px 3px rgba(0,0,0,.06)",
      }}>
        {[
          { key:"maclar",    label:"📅 Maçlar",           desc:"WC 2026 fikstür & sonuçlar" },
          { key:"oyuncular", label:"👤 Takımlar & Oyuncular", desc:"Kadro ve oyuncu analizi" },
        ].map(({ key, label, desc }) => (
          <button key={key} onClick={() => setTab(key)} style={{
            flex:1, padding:"10px 12px", borderRadius:8, cursor:"pointer",
            border:`1.5px solid ${tab===key ? "#f59e0b" : "transparent"}`,
            background: tab===key ? "#fef3c7" : "transparent",
            textAlign:"left", transition:"all .18s",
          }}>
            <div style={{ fontSize:13, fontWeight:800, color: tab===key ? "#d97706" : "#0f172a" }}>{label}</div>
            <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>{desc}</div>
          </button>
        ))}
      </div>

      {/* ── İçerik ── */}
      {tab === "maclar" && <FixtureList onTeamClick={onTeamSelect} />}

      {tab === "oyuncular" && <>
      {/* Konfederasyon grupları */}
      {ORDER.map(confKey => {
        const list = grouped[confKey] || [];
        if (!list.length) return null;
        const { label, sub, icon } = CONF_META[confKey];
        const color = CONF_COLOR[confKey];
        let idx = 0;

        return (
          <div key={confKey} style={{ marginBottom: 28 }}>
            {/* Konfederasyon başlığı */}
            <div className="hh-conf-header" style={{ "--conf-color": color }}>
              <div style={{
                display:"flex", alignItems:"center", gap:10,
                padding:"4px 14px", borderRadius:8,
                background: color + "18",
                border:`1px solid ${color}35`,
              }}>
                <span style={{ fontSize:18 }}>{icon}</span>
                <div>
                  <span style={{ color, fontSize:12, fontWeight:900, letterSpacing:".05em" }}>{label}</span>
                  <span style={{ color:"#334155", fontSize:10, fontWeight:600, marginLeft:8 }}>{sub}</span>
                </div>
                <span style={{
                  marginLeft:6, background:color+"22", color, fontSize:10, fontWeight:800,
                  padding:"1px 8px", borderRadius:10, border:`1px solid ${color}44`,
                }}>{list.length} takım</span>
              </div>
            </div>

            {/* Takım kartları */}
            <div style={S.teamsGrid}>
              {list.map(t => {
                const delay = (idx++) * 0.028;
                return (
                  <button key={t.ulke}
                    className="hh-team-card"
                    style={{ animationDelay:`${delay}s`, "--conf-color": color }}
                    onClick={() => onTeamSelect(t.ulke)}>
                    <span style={{ fontSize:34, lineHeight:1 }}>{flag(t.ulke)}</span>
                    <span style={S.teamName}>{t.ulke}</span>
                    <span style={{ ...S.teamCount, color: color + "cc" }}>{t.oyuncu_sayisi} oyuncu</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      </>}
    </>
  );
}

// ─── Takım sayfası ────────────────────────────────────────────────────────────
function TeamPage({ ulke, onPlayerSelect, onBack }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/teams/${encodeURIComponent(ulke)}/players`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setPlayers(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [ulke]);

  const confKey   = TEAM_CONF[ulke] ?? "UEFA";
  const confColor = CONF_COLOR[confKey] ?? "#38bdf8";

  return (
    <>
      <button onClick={onBack} style={S.backBtn}>← Takımlara dön</button>

      {/* Takım başlık kartı */}
      <div style={{ ...S.teamHeadCard, borderTopColor: confColor }}>
        <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg, ${confColor}, ${confColor}44)` }} />
        <span style={{ fontSize:46, lineHeight:1 }}>{flag(ulke)}</span>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
            <span style={{ fontSize:24, fontWeight:900, color:"#0f172a" }}>{ulke}</span>
            <span style={{ background:confColor+"22", border:`1px solid ${confColor}44`, color:confColor, fontSize:10, fontWeight:800, padding:"2px 10px", borderRadius:6 }}>
              {CONF_META[confKey]?.label}
            </span>
          </div>
          <span style={S.countBadge}>{players.length} oyuncu · 2026 WC kadrosu</span>
        </div>
      </div>

      {loading ? (
        <div style={{ color:"#334155", textAlign:"center", padding:"40px 0" }}>Yükleniyor…</div>
      ) : (
        <div style={S.playersGrid}>
          {players.map((p, i) => (
            <button key={p.oyuncu_id}
              className="hh-player-card"
              onClick={() => onPlayerSelect(p.oyuncu_id, p.isim)}
              style={{ animationDelay:`${i*.022}s`, "--conf-color": confColor }}>
              <div style={S.playerCardInner}>
                <PlayerPhotoMini playerId={p.oyuncu_id} name={p.isim} size={38} />
                <div style={{ minWidth:0 }}>
                  <span style={S.playerCardName}>{p.isim}</span>
                  {p.mevki && <span style={{ ...S.playerCardPos, color: confColor + "bb", display:"block", marginTop:2 }}>{p.mevki}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// Turnuva adından renk ve ikon
const COMP_META = {
  // Dünya kupası & kıta
  "FIFA World Cup":         { icon:"🌍", color:"#f59e0b" },
  "FIFA Dünya Kupası":      { icon:"🌍", color:"#f59e0b" },
  "UEFA Avrupa Şampiyonası":{ icon:"⭐", color:"#38bdf8" },
  "UEFA Euro":              { icon:"⭐", color:"#38bdf8" },
  "Copa América":           { icon:"🌟", color:"#a78bfa" },
  "Nations League":         { icon:"🏳️", color:"#64748b" },
  // UEFA kulüp
  "Champions League":       { icon:"🏆", color:"#fbbf24" },
  "Europa League":          { icon:"🟠", color:"#f97316" },
  "Conference League":      { icon:"🟢", color:"#10b981" },
  // Büyük 5
  "Premier League":         { icon:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", color:"#8b5cf6" },
  "La Liga":                { icon:"🇪🇸", color:"#ef4444" },
  "Bundesliga":             { icon:"🇩🇪", color:"#f97316" },
  "Serie A":                { icon:"🇮🇹", color:"#10b981" },
  "Ligue 1":                { icon:"🇫🇷", color:"#3b82f6" },
  // Diğer Avrupa
  "Eredivisie":             { icon:"🇳🇱", color:"#f97316" },
  "Primeira Liga":          { icon:"🇵🇹", color:"#16a34a" },
  "Championship":           { icon:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", color:"#7c3aed" },
  "2. Bundesliga":          { icon:"🇩🇪", color:"#ea580c" },
  "Segunda División":       { icon:"🇪🇸", color:"#dc2626" },
  "Ligue 2":                { icon:"🇫🇷", color:"#2563eb" },
  "Serie B":                { icon:"🇮🇹", color:"#059669" },
  // Amerika
  "Brasileirão":            { icon:"🇧🇷", color:"#16a34a" },
  "Copa Libertadores":      { icon:"🌎", color:"#ca8a04" },
  "MLS":                    { icon:"🇺🇸", color:"#1d4ed8" },
};
function compMeta(name) {
  for (const [k, v] of Object.entries(COMP_META))
    if (name?.includes(k)) return v;
  return { icon:"🏟️", color:"#64748b" };
}

// ─── Performans profili popup — hero kartı sağında ikon, hover'da açılır ──────
function PerfPopup({ p90 }) {
  const [open, setOpen] = useState(false);
  const metrics = [
    { l:"xG/90",    v: p90.xg90,    c:"#10b981" },
    { l:"xA/90",    v: p90.xa90,    c:"#38bdf8" },
    { l:"Gol/90",   v: p90.gol90,   c:"#f59e0b" },
    { l:"Asist/90", v: p90.asist90, c:"#f472b6" },
    { l:"Şut/90",   v: p90.sut90,   c:"#a78bfa" },
  ];
  return (
    <div style={{ position:"relative", display:"inline-flex", alignItems:"center" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div style={{
        width:32, height:32, borderRadius:8,
        background: open ? "rgba(245,158,11,.18)" : "rgba(245,158,11,.08)",
        border: `1px solid ${open ? "rgba(245,158,11,.5)" : "rgba(245,158,11,.2)"}`,
        display:"flex", alignItems:"center", justifyContent:"center",
        cursor:"default", fontSize:15,
        transform: open ? "scale(1.18)" : "scale(1)",
        transition:"all .18s",
      }}>
        📊
      </div>
      {open && (
        <div style={{
          position:"absolute", top:"calc(100% + 8px)", right:0,
          background:"#ffffff", border:"1px solid #e2e8f0",
          borderRadius:14, padding:"14px 16px",
          boxShadow:"0 12px 40px rgba(0,0,0,.14)",
          zIndex:200, minWidth:210,
          animation:"hh-fadein .15s ease",
          pointerEvents:"none",
        }}>
          <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", letterSpacing:".08em", marginBottom:10 }}>
            📊 PERFORMANS PROFİLİ
          </div>
          {metrics.map(({l,v,c}) => (
            <div key={l} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7 }}>
              <span style={{ fontSize:11, color:"#64748b" }}>{l}</span>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <div style={{
                  width: Math.min((v ?? 0) * 50, 70),
                  height:4, borderRadius:2,
                  background: c, opacity:.75,
                  transition:"width .3s",
                }} />
                <span style={{ fontSize:12, fontWeight:800, color:"#0f172a", minWidth:34, textAlign:"right" }}>
                  {(v ?? 0).toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Oyuncu sayfası ───────────────────────────────────────────────────────────
const SEC_NAV = [
  { id:"sec-maclar",  icon:"📋", label:"Maçlar"    },
  { id:"sec-analiz",  icon:"📊", label:"Analiz"    },
  { id:"sec-saha",    icon:"⚽", label:"Saha"      },
  { id:"sec-profil",  icon:"🎯", label:"Profil"    },
  { id:"sec-bahis",   icon:"💰", label:"Bahis"     },
];

function SectionNav() {
  const [active, setActive] = useState(null);
  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) { el.scrollIntoView({ behavior:"smooth", block:"start" }); setActive(id); }
  };
  return (
    <div style={{
      display:"flex", gap:6, overflowX:"auto", padding:"0 0 10px",
      scrollbarWidth:"none", WebkitOverflowScrolling:"touch",
      borderBottom:"1px solid #f1f5f9", marginBottom:16,
    }}>
      {SEC_NAV.map(s => (
        <button key={s.id} onClick={() => scrollTo(s.id)}
          style={{
            display:"flex", alignItems:"center", gap:6, flexShrink:0,
            background: active === s.id ? "#fef3c7" : "#ffffff",
            border: `1px solid ${active === s.id ? "#fde68a" : "#e2e8f0"}`,
            borderRadius:20, color: active === s.id ? "#d97706" : "#64748b",
            cursor:"pointer", fontSize:12, fontWeight:700, padding:"6px 14px",
            transition:"all .15s", boxShadow:"0 1px 2px rgba(0,0,0,.04)",
          }}>
          <span>{s.icon}</span> {s.label}
        </button>
      ))}
    </div>
  );
}

const ARCHETYPE_META = {
  "Box Threat":          { icon:"🎯", color:"#ef4444" },
  "Finisher":            { icon:"⚽", color:"#f59e0b" },
  "Creator":             { icon:"🎨", color:"#8b5cf6" },
  "Chance Creator":      { icon:"🅰️", color:"#a78bfa" },
  "Deep Playmaker":      { icon:"🧠", color:"#38bdf8" },
  "Progressive Carrier": { icon:"➡️", color:"#10b981" },
  "Volume Shooter":      { icon:"🏹", color:"#f97316" },
  "Direct Winger":       { icon:"⚡", color:"#fbbf24" },
  "Possession Hub":      { icon:"🔄", color:"#64748b" },
  "Balanced":            { icon:"⚖️", color:"#94a3b8" },
};

function PlayerPage({ playerId, playerName, onBack }) {
  const [profile,    setProfile]    = useState(null);
  const [archetype,  setArchetype]  = useState(null);
  const [comps,      setComps]      = useState([]);
  const [competition, setComp]      = useState(null); // null = tümü
  const [market,     setMarket]     = useState(null);
  const [xgTrend,    setXgTrend]    = useState([]);
  const [insight,    setInsight]    = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightOpen,    setInsightOpen]    = useState(false);
  const photoUrl = usePlayerPhoto(playerId);

  useEffect(() => {
    if (!playerId) return;
    setProfile(null); setArchetype(null); setComps([]); setComp(null);
    setMarket(null);  setXgTrend([]);    setInsight(null); setInsightOpen(false);

    fetch(`${API_BASE}/player/${playerId}`)
      .then(r => r.ok ? r.json() : null).then(setProfile).catch(() => {});
    fetch(`${API_BASE}/player/${playerId}/competitions`)
      .then(r => r.ok ? r.json() : []).then(setComps).catch(() => {});
    fetch(`${API_BASE}/player/${playerId}/archetype`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.archetype && setArchetype(d.archetype)).catch(() => {});
    fetch(`${API_BASE}/player/${playerId}/market`)
      .then(r => r.ok ? r.json() : null).then(setMarket).catch(() => {});
    fetch(`${API_BASE}/player/${playerId}/xg-trend`)
      .then(r => r.ok ? r.json() : []).then(d => setXgTrend(Array.isArray(d) ? d : [])).catch(() => {});
  }, [playerId]);

  const fetchInsight = () => {
    if (insight || insightLoading) { setInsightOpen(o => !o); return; }
    setInsightLoading(true); setInsightOpen(true);
    fetch(`${API_BASE}/player/${playerId}/insight`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setInsight(d?.insight ?? d?.text ?? JSON.stringify(d)); setInsightLoading(false); })
      .catch(() => { setInsight("Yorum alınamadı."); setInsightLoading(false); });
  };

  const p90 = profile?.per90;

  return (
    <>
      <button onClick={onBack} style={S.backBtn}>← Geri</button>

      {/* ── Oyuncu hero kartı ── */}
      <div style={S.heroCard}>
        <div style={S.heroGlow} />

        {/* Foto / avatar */}
        {photoUrl ? (
          <img src={photoUrl} alt={playerName} style={S.heroPhoto}
            onError={e => { e.target.style.display="none"; }} />
        ) : (
          <Avatar name={playerName} size={96} />
        )}

        <div style={{ flex:1, minWidth:0 }}>
          <div style={S.heroNameRow}>
            <h2 style={S.heroName}>{profile?.isim ?? playerName}</h2>
            {p90 && Object.values(p90).some(v => v > 0) && (
              <PerfPopup p90={p90} />
            )}
          </div>
          <div style={S.badgesRow}>
            {profile?.milliyet && <span style={S.badgeGold}>{flag(profile.milliyet)} {profile.milliyet}</span>}
            {profile?.mevki    && <span style={S.badgeBlue}>{profile.mevki}</span>}
            {archetype && (() => {
              const meta = ARCHETYPE_META[archetype] ?? { icon:"🏷️", color:"#64748b" };
              return (
                <span style={{
                  background: meta.color + "18",
                  border: `1px solid ${meta.color}44`,
                  borderRadius: 6, color: meta.color,
                  fontSize: 10, fontWeight: 800, padding: "2px 10px",
                }}>
                  {meta.icon} {archetype}
                </span>
              );
            })()}
            {profile?.club_takim && (
              <span style={S.badgeClub}>
                ⚽ {profile.club_takim}
                {profile.club_lig && <span style={{ opacity:.7 }}> · {profile.club_lig}</span>}
              </span>
            )}
            {profile           && <span style={S.badgeGray}>{profile.mac_sayisi} maç · {profile.toplam_dakika} dk</span>}
            {market?.deger_eur && (
              <span style={{
                background:"#dcfce7", border:"1px solid #86efac",
                borderRadius:6, color:"#16a34a",
                fontSize:10, fontWeight:800, padding:"2px 10px",
              }}>
                💰 {market.deger_eur >= 1e6
                  ? `€${(market.deger_eur/1e6).toFixed(0)}M`
                  : `€${(market.deger_eur/1e3).toFixed(0)}K`}
              </span>
            )}
          </div>
          {p90 && (
            <div style={S.statsRow}>
              {[
                { l:"xG/90",    v: p90.xg90?.toFixed(2)   },
                { l:"xA/90",    v: p90.xa90?.toFixed(2)   },
                { l:"Gol/90",   v: p90.gol90?.toFixed(2)  },
                { l:"Asist/90", v: p90.asist90?.toFixed(2)},
                { l:"Şut/90",   v: p90.sut90?.toFixed(1)  },
              ].map(({ l, v }) => (
                <div key={l} style={S.statItem}>
                  <span style={S.statVal}>{v ?? "—"}</span>
                  <span style={S.statLbl}>{l}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Claude AI Yorumu ── */}
      <div style={{ marginBottom: 12 }}>
        <button onClick={fetchInsight} style={{
          display:"flex", alignItems:"center", gap:7,
          padding:"8px 16px", borderRadius:8, cursor:"pointer",
          background: insightOpen ? "#fef3c7" : "#ffffff",
          border:`1px solid ${insightOpen ? "#fde68a" : "#e2e8f0"}`,
          fontSize:11, fontWeight:700, color: insightOpen ? "#d97706" : "#64748b",
          transition:"all .2s",
        }}>
          🤖 Claude Analizi {insightLoading ? "…" : insightOpen ? "▲" : "▼"}
        </button>
        {insightOpen && (
          <div style={{
            marginTop:8, padding:"14px 16px",
            background:"#fffbeb", border:"1px solid #fde68a",
            borderRadius:10, fontSize:12, lineHeight:1.7, color:"#0f172a",
          }}>
            {insightLoading
              ? <span style={{ color:"#94a3b8" }}>🤖 Claude analiz hazırlıyor…</span>
              : insight ?? <span style={{ color:"#94a3b8" }}>Yorum bulunamadı.</span>
            }
          </div>
        )}
      </div>

      {/* ── Lig / Turnuva filtresi — gruplu ── */}
      {comps.length > 0 && (() => {
        const MILLI_KEYS = ["World Cup","Euro","Copa","Africa","Nations League","Qualifier","Qualifying","CONMEBOL","CONCACAF","AFC","CAF","AFCON","Gold Cup","Eleme"];
        const isMilli = t => MILLI_KEYS.some(k => t?.includes(k));
        const milliComps = comps.filter(c => isMilli(c.turnuva));
        const kuluepComps = comps.filter(c => !isMilli(c.turnuva));
        const renderChips = (list) => list.map(c => {
          const meta = compMeta(c.turnuva);
          const isAct = competition === c.turnuva;
          return (
            <button key={c.turnuva}
              onClick={() => setComp(isAct ? null : c.turnuva)}
              style={{
                ...S.compChip,
                ...(isAct ? { ...S.compChipActive, borderColor: meta.color + "66", background: meta.color + "18", color: meta.color } : {}),
              }}
            >
              {meta.icon} {c.turnuva}
              <span style={{ opacity:.6, fontSize:9, marginLeft:4 }}>{c.mac_sayisi}m</span>
            </button>
          );
        });
        return (
          <div style={{ marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <button onClick={() => setComp(null)}
                style={{ ...S.compChip, ...(competition === null ? S.compChipActive : {}) }}>
                🌐 Tümü
              </button>
            </div>
            {milliComps.length > 0 && (
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:9, fontWeight:700, color:"#94a3b8", letterSpacing:".08em", marginBottom:5 }}>
                  MİLLİ TAKIM
                </div>
                <div style={S.compFilter}>{renderChips(milliComps)}</div>
              </div>
            )}
            {kuluepComps.length > 0 && (
              <div>
                <div style={{ fontSize:9, fontWeight:700, color:"#94a3b8", letterSpacing:".08em", marginBottom:5 }}>
                  KULÜP
                </div>
                <div style={S.compFilter}>{renderChips(kuluepComps)}</div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Bölüm navigasyonu ── */}
      <SectionNav />

      {/* ── Maç geçmişi ── */}
      <div id="sec-maclar">
        <PlayerMatches playerId={playerId} milliyet={profile?.milliyet} competition={competition} />
      </div>

      {/* ════ PERFORMANS ANALİZİ ════ */}
      <div id="sec-analiz" style={S.sectionHeader}>
        <div style={{ ...S.sectionAccent, background: "#38bdf8" }} />
        <span style={S.sectionHeading}>📊 Performans Analizi</span>
      </div>

      <div className="hh-grid2">
        <section style={S.cell}><PercentileBars  playerId={playerId} /></section>
        <section style={S.cell}><XGTimeline      playerId={playerId} milliyet={profile?.milliyet} competition={competition} /></section>
      </div>

      <div className="hh-grid2">
        <section style={S.cell}><ContribTimeline playerId={playerId} milliyet={profile?.milliyet} competition={competition} /></section>
        <section style={S.cell}><ShotZones       playerId={playerId} competition={competition} /></section>
      </div>

      <div className="hh-grid2">
        <section style={S.cell}><GoalTiming      playerId={playerId} competition={competition} /></section>
      </div>

      <div className="hh-grid2">
        <section style={S.cell}><ShotQuality      playerId={playerId} competition={competition} /></section>
      </div>

      {/* xG Trend (Understat — verisi varsa göster) */}
      {xgTrend.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...S.sectionHeader, marginBottom: 8 }}>
            <div style={{ ...S.sectionAccent, background:"#10b981" }} />
            <span style={S.sectionHeading}>📈 Sezonluk xG Trendi</span>
          </div>
          <div style={{
            background:"#ffffff", border:"1px solid #e2e8f0",
            borderRadius:12, padding:"16px", boxShadow:"0 1px 3px rgba(0,0,0,.06)",
            overflowX:"auto",
          }}>
            <div style={{ display:"flex", gap:0, alignItems:"flex-end", minHeight:90, minWidth: xgTrend.length * 52 }}>
              {xgTrend.map((s, i) => {
                const maxXg = Math.max(...xgTrend.map(x => x.xg ?? 0), 1);
                const maxXa = Math.max(...xgTrend.map(x => x.xa ?? 0), 1);
                const xgH = Math.round(((s.xg ?? 0) / maxXg) * 70);
                const xaH = Math.round(((s.xa ?? 0) / maxXa) * 70);
                return (
                  <div key={i} style={{ flex:1, textAlign:"center", minWidth:48 }}>
                    <div style={{ fontSize:9, fontWeight:700, color:"#10b981", marginBottom:2 }}>{(s.xg??0).toFixed(1)}</div>
                    <div style={{ display:"flex", gap:2, justifyContent:"center", alignItems:"flex-end", height:72 }}>
                      <div style={{ width:12, height:xgH, background:"#10b981", borderRadius:"3px 3px 0 0", opacity:.85 }} title={`xG: ${s.xg}`} />
                      <div style={{ width:12, height:xaH, background:"#38bdf8", borderRadius:"3px 3px 0 0", opacity:.85 }} title={`xA: ${s.xa}`} />
                    </div>
                    <div style={{ fontSize:8, color:"#94a3b8", marginTop:4, whiteSpace:"nowrap" }}>{s.sezon?.slice(-5) ?? i}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display:"flex", gap:14, marginTop:10, justifyContent:"center" }}>
              <span style={{ fontSize:10, color:"#64748b", display:"flex", alignItems:"center", gap:4 }}>
                <span style={{ width:10, height:10, background:"#10b981", borderRadius:2, display:"inline-block" }} /> xG
              </span>
              <span style={{ fontSize:10, color:"#64748b", display:"flex", alignItems:"center", gap:4 }}>
                <span style={{ width:10, height:10, background:"#38bdf8", borderRadius:2, display:"inline-block" }} /> xA
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Yardımetre — xT / Katkı Değeri ── */}
      <div className="hh-grid2">
        <section style={S.cell}><Yardimetre playerId={playerId} /></section>
        <section style={S.cell}><CompetitionStats playerId={playerId} /></section>
      </div>

      {/* ── Saha görünümleri ── */}
      <div id="sec-saha" style={{ height:1, marginTop:4 }} />
      <div className="hh-grid2">
        <section style={S.cell}><PitchView        playerId={playerId} playerName={profile?.isim ?? playerName} competition={competition} /></section>
        <section style={S.cell} id="sec-profil"><RadarChart       playerId={playerId} playerName={profile?.isim ?? playerName} /></section>
      </div>


      {/* ════ BAHİS & TAHMİN ════ */}
      <div id="sec-bahis" style={{ ...S.sectionHeader, marginTop: 12 }}>
        <div style={{ ...S.sectionAccent, background: "#f59e0b" }} />
        <span style={{ ...S.sectionHeading, color: "#f59e0b" }}>💰 Bahis & Tahmin</span>
      </div>

      <div className="hh-grid2">
        <section style={S.cell}><FormStrip        playerId={playerId} competition={competition} /></section>
        <section style={S.cell}><BettingPanel     playerId={playerId} competition={competition} /></section>
      </div>

      <div className="hh-grid2">
        <section style={S.cell}><HomeAwaySplit    playerId={playerId} milliyet={profile?.milliyet} competition={competition} /></section>
        <section style={S.cell}><ScoringPattern   playerId={playerId} competition={competition} /></section>
      </div>

      <div className="hh-grid2">
        <section style={S.cell}><MinutesImpact    playerId={playerId} competition={competition} /></section>
        <section style={S.cell}><AssistQuality    playerId={playerId} competition={competition} /></section>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:14, marginBottom:48 }}>
        <section style={S.cell}><OpponentProfile  playerId={playerId} milliyet={profile?.milliyet} competition={competition} /></section>
      </div>
    </>
  );
}

// ─── Ana uygulama ─────────────────────────────────────────────────────────────
export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const [page,       setPage]       = useState("teams");
  const [selTeam,    setSelTeam]    = useState(null);
  const [playerId,   setPlayerId]   = useState(null);
  const [playerName, setPlayerName] = useState(null);

  const navigate = useNavigate();
  const location = useLocation();

  // Yeni sayfalara geçince state-based sayfayı "teams"'e sıfırla
  useEffect(() => {
    if (location.pathname === "/") {
      // nothing
    }
  }, [location.pathname]);

  const goPlayer = (id, name) => {
    setPlayerId(id); setPlayerName(name); setPage("player");
    navigate("/");
  };
  const goTeam   = ulke => { setSelTeam(ulke); setPage("team"); navigate("/"); };

  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}

      <div style={{
        minHeight:"100vh",
        background:"#f1f5f9",
        opacity: splashDone ? 1 : 0,
        transition:"opacity .5s ease",
      }}>
        {/* ── HEADER ── */}
        <header style={S.header}>
          <div style={S.headerStripe} />
          <div style={S.headerRow}>
            {/* Sol: Logo */}
            <Link to="/" onClick={() => setPage("teams")} style={{ textDecoration:"none", flexShrink:0 }}>
              <span style={S.logo}>
                {"HüCem Hattı".split("").map((ch, i) => {
                  const blue = new Set([0,6]), gold = new Set([2]);
                  return (
                    <span key={i} style={{
                      color: blue.has(i) ? "#38bdf8" : gold.has(i) ? "#f59e0b" : "#ffffff",
                      textShadow: blue.has(i) ? "0 0 14px rgba(56,189,248,.5)"
                        : gold.has(i) ? "0 0 14px rgba(245,158,11,.5)" : "none",
                    }}>{ch}</span>
                  );
                })}
              </span>
            </Link>

            {/* Orta: Nav linkleri */}
            <div style={S.navRow}>
              <NavLink to="/" exact onClick={() => setPage("teams")}>🏠 Takımlar</NavLink>
              <NavLink to="/leaders">🏆 Liderler</NavLink>
              <NavLink to="/compare">⚖️ Karşılaştır</NavLink>
            </div>

            {/* Sağ: Search */}
            <div style={{ flexShrink:0 }}>
              <PlayerSearch
                placeholder="Oyuncu ara…"
                onSelect={(id, name) => goPlayer(id, name)}
              />
            </div>
          </div>
        </header>

        {/* ── İÇERİK ── */}
        <main style={S.main}>
          <Routes>
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/leaders" element={
              <LeadersPage onPlayerSelect={(id, name) => goPlayer(id, name)} />
            } />
            <Route path="/*" element={
              <>
                {page === "teams"  && <TeamsPage onTeamSelect={goTeam} />}
                {page === "team"   && selTeam  && (
                  <TeamPage ulke={selTeam} onPlayerSelect={goPlayer} onBack={() => setPage("teams")} />
                )}
                {page === "player" && playerId && (
                  <PlayerPage playerId={playerId} playerName={playerName}
                    onBack={() => setPage(selTeam ? "team" : "teams")} />
                )}
              </>
            } />
          </Routes>
        </main>
      </div>
    </>
  );
}

// ─── Navigasyon linki ──────────────────────────────────────────────────────────
function NavLink({ to, children, onClick }) {
  const location = useLocation();
  const isActive = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
  return (
    <Link
      to={to}
      onClick={onClick}
      style={{
        ...S.navLink,
        ...(isActive ? S.navLinkActive : {}),
      }}
    >
      {children}
    </Link>
  );
}

// ─── Stiller ──────────────────────────────────────────────────────────────────
const S = {
  // Header — kompakt yatay navbar
  header: {
    position:"sticky", top:0, zIndex:50,
    background:"rgba(15,23,42,.97)",
    backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
    borderBottom:"1px solid rgba(255,255,255,.06)",
    boxShadow:"0 2px 20px rgba(0,0,0,.25)",
  },
  headerStripe: {
    height:3,
    background:"linear-gradient(90deg, transparent 0%, #22c55e 15%, #22c55e 85%, transparent 100%)",
    opacity:.8,
  },
  headerRow: {
    display:"flex", alignItems:"center", gap:16,
    padding:"10px 24px 12px",
  },
  logo: {
    fontSize:"clamp(18px,2.5vw,26px)", fontWeight:900, letterSpacing:-0.5,
    display:"inline-block",
  },

  // Nav links
  navRow: {
    display:"flex", gap:6, flex:1, justifyContent:"center",
  },
  navLink: {
    textDecoration:"none",
    background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.1)",
    borderRadius:20, color:"rgba(255,255,255,.65)",
    fontSize:11, fontWeight:600, padding:"5px 14px",
    transition:"all .15s",
  },
  navLinkActive: {
    background:"rgba(245,158,11,.15)", border:"1px solid rgba(245,158,11,.35)",
    color:"#f59e0b",
  },

  // Main
  main: { maxWidth:1200, margin:"0 auto", padding:"32px 24px 80px" },

  // Autocomplete
  acWrap:   { position:"relative", width:"min(400px,92vw)" },
  searchBox: {
    display:"flex", alignItems:"center",
    background:"#ffffff", border:"1px solid #e2e8f0",
    borderRadius:10, overflow:"hidden",
    transition:"border-color .2s, box-shadow .2s",
    boxShadow:"0 1px 3px rgba(0,0,0,.06)",
  },
  searchIcon:  { padding:"0 12px", fontSize:14, color:"#94a3b8", flexShrink:0 },
  searchInput: {
    flex:1, background:"transparent", border:"none",
    color:"#0f172a", fontSize:14, padding:"11px 14px 11px 0",
    outline:"none",
  },
  dropdown: {
    position:"absolute", top:"calc(100% + 6px)", left:0, right:0,
    background:"#ffffff", border:"1px solid #e2e8f0",
    borderRadius:10, listStyle:"none", padding:"6px 0",
    zIndex:200, maxHeight:290, overflowY:"auto",
    boxShadow:"0 10px 40px rgba(0,0,0,.12)",
  },
  ddItem: { display:"flex", alignItems:"center", gap:8, padding:"9px 16px", cursor:"pointer" },
  ddName: { color:"#0f172a", fontSize:13, flexGrow:1 },
  ddMeta: {
    color:"#64748b", fontSize:11,
    background:"#f1f5f9", borderRadius:4, padding:"1px 7px",
  },

  // WC2026 banner
  wcBanner: {
    display:"flex", alignItems:"center", gap:20, flexWrap:"wrap",
    padding:"18px 24px", marginBottom:28,
    background:"#ffffff",
    border:"1px solid #e2e8f0",
    borderRadius:16, position:"relative", overflow:"hidden",
    boxShadow:"0 1px 3px rgba(0,0,0,.06)",
  },
  wcBannerGlow: {
    position:"absolute", top:0, left:0, right:0, height:3,
    background:"linear-gradient(90deg, #f59e0b, #38bdf8)",
    opacity:.9,
  },
  wcBannerText: { flex:1, display:"flex", flexDirection:"column", gap:4 },
  wcBannerTitle:{ fontSize:"clamp(18px,3vw,26px)", fontWeight:900, color:"#0f172a", letterSpacing:"-.3px" },
  wcBannerSub:  { color:"#64748b", fontSize:11, fontWeight:500, letterSpacing:".03em" },
  wcBannerBadge:{
    display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
    width:54, height:54, borderRadius:12, flexShrink:0,
    background:"#fef3c7", border:"1px solid #fde68a",
    color:"#d97706", fontSize:22, fontWeight:900, lineHeight:1, gap:1,
  },

  // Teams grid
  teamsGrid: {
    display:"grid",
    gridTemplateColumns:"repeat(auto-fill, minmax(130px, 1fr))",
    gap:10, marginTop:10,
  },
  teamName:  { color:"#1e293b", fontSize:11, fontWeight:700, textAlign:"center", lineHeight:1.3 },
  teamCount: { fontSize:9, fontWeight:600 },

  // Team page
  teamHeadCard: {
    display:"flex", alignItems:"center", gap:18,
    padding:"20px 24px", marginBottom:24,
    background:"#ffffff", borderRadius:16,
    border:"1px solid #e2e8f0",
    position:"relative", overflow:"hidden",
    boxShadow:"0 1px 4px rgba(0,0,0,.06)",
  },
  backBtn: {
    background:"#ffffff", border:"1px solid #e2e8f0",
    borderRadius:8, color:"#64748b", cursor:"pointer",
    fontSize:13, padding:"7px 16px", marginBottom:20,
    transition:"all .15s",
    boxShadow:"0 1px 2px rgba(0,0,0,.04)",
  },
  countBadge: {
    background:"#fef3c7", border:"1px solid #fde68a",
    borderRadius:6, color:"#d97706", fontSize:11, fontWeight:700, padding:"3px 12px",
  },
  playersGrid: {
    display:"grid",
    gridTemplateColumns:"repeat(auto-fill, minmax(220px,1fr))",
    gap:8,
  },
  playerCardName: { color:"#1e293b", fontSize:13, fontWeight:600 },
  playerCardPos:  { fontSize:11 },
  playerCardInner: { display:"flex", alignItems:"center", gap:10, width:"100%" },

  // Player hero
  heroCard: {
    display:"flex", alignItems:"flex-start", gap:22,
    padding:"22px 24px", marginBottom:22, flexWrap:"wrap",
    background:"#ffffff",
    border:"1px solid #e2e8f0",
    borderRadius:16, position:"relative", overflow:"hidden",
    boxShadow:"0 1px 4px rgba(0,0,0,.06)",
  },
  heroGlow: {
    position:"absolute", top:0, left:0, right:0, height:3,
    background:"linear-gradient(90deg, #f59e0b 0%, #38bdf8 100%)",
    pointerEvents:"none",
  },
  heroPhoto: {
    width:96, height:96, borderRadius:14, flexShrink:0,
    objectFit:"cover", objectPosition:"top center",
    border:"2px solid #e2e8f0",
    boxShadow:"0 2px 8px rgba(0,0,0,.1)",
  },
  heroNameRow: { display:"flex", alignItems:"center", gap:12, marginBottom:8, justifyContent:"space-between" },
  heroName: { fontSize:22, fontWeight:900, color:"#0f172a" },
  badgesRow: { display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 },
  badgeGold: {
    background:"#fef3c7", border:"1px solid #fde68a",
    borderRadius:6, color:"#d97706", fontSize:11, fontWeight:700, padding:"3px 10px",
  },
  badgeBlue: {
    background:"#e0f2fe", border:"1px solid #bae6fd",
    borderRadius:6, color:"#0284c7", fontSize:11, fontWeight:700, padding:"3px 10px",
  },
  badgeGray: {
    background:"#f8fafc", border:"1px solid #e2e8f0",
    borderRadius:6, color:"#64748b", fontSize:11, fontWeight:600, padding:"3px 10px",
  },
  badgeClub: {
    background:"#f0fdf4", border:"1px solid #bbf7d0",
    borderRadius:6, color:"#166534", fontSize:11, fontWeight:700, padding:"3px 10px",
  },
  statsRow:  { display:"flex", gap:20, flexWrap:"wrap" },
  statItem:  { display:"flex", flexDirection:"column", gap:3 },
  statVal:   { fontSize:20, fontWeight:900, color:"#f59e0b", lineHeight:1 },
  statLbl:   { color:"#94a3b8", fontSize:10, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase" },

  // Section headers
  sectionHeader: {
    display:"flex", alignItems:"center", gap:12,
    marginBottom:14, marginTop:4,
  },
  sectionAccent: { width:3, height:20, borderRadius:2, flexShrink:0 },
  sectionHeading:{ color:"#64748b", fontSize:11, fontWeight:800, letterSpacing:".12em", textTransform:"uppercase" },

  // Full-width cell
  cell: { width:"100%", minWidth:0 },

  // Lig / turnuva filtre çubuğu
  compFilter: {
    display:"flex", flexWrap:"wrap", gap:6,
    padding:"12px 0 8px",
    borderBottom:"1px solid #f1f5f9",
    marginBottom:14,
  },
  compChip: {
    display:"flex", alignItems:"center", gap:4,
    background:"#ffffff", border:"1px solid #e2e8f0",
    borderRadius:20, color:"#64748b", cursor:"pointer",
    fontSize:11, fontWeight:600, padding:"5px 12px",
    transition:"all .15s",
    boxShadow:"0 1px 2px rgba(0,0,0,.04)",
  },
  compChipActive: {
    background:"#fef3c7", borderColor:"#fde68a",
    color:"#d97706",
  },
};
