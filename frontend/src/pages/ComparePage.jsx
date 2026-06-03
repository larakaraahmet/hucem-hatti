/**
 * ComparePage — İki oyuncuyu yan yana karşılaştır
 */
import { useState, useRef, useEffect } from "react";
import { api } from "../services/api.js";

const FLAGS = {
  Argentina:"🇦🇷",Australia:"🇦🇺",Belgium:"🇧🇪",Brazil:"🇧🇷",Cameroon:"🇨🇲",
  Canada:"🇨🇦","Costa Rica":"🇨🇷",Croatia:"🇭🇷",Denmark:"🇩🇰",Ecuador:"🇪🇨",
  England:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",France:"🇫🇷",Germany:"🇩🇪",Ghana:"🇬🇭",Iran:"🇮🇷",
  Japan:"🇯🇵",Mexico:"🇲🇽",Morocco:"🇲🇦",Netherlands:"🇳🇱",Poland:"🇵🇱",
  Portugal:"🇵🇹",Qatar:"🇶🇦","Saudi Arabia":"🇸🇦",Senegal:"🇸🇳",Serbia:"🇷🇸",
  "South Korea":"🇰🇷",Spain:"🇪🇸",Switzerland:"🇨🇭",Tunisia:"🇹🇳",
  "United States":"🇺🇸",Uruguay:"🇺🇾",Wales:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",Albania:"🇦🇱",
  Austria:"🇦🇹","Czech Republic":"🇨🇿",Finland:"🇫🇮",Hungary:"🇭🇺",
  Italy:"🇮🇹","North Macedonia":"🇲🇰",Russia:"🇷🇺",Scotland:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  Slovakia:"🇸🇰",Sweden:"🇸🇪",Turkey:"🇹🇷",Ukraine:"🇺🇦",
  Bolivia:"🇧🇴",Chile:"🇨🇱",Colombia:"🇨🇴",Paraguay:"🇵🇾",Peru:"🇵🇪",
  Venezuela:"🇻🇪",Georgia:"🇬🇪",Romania:"🇷🇴",Slovenia:"🇸🇮",
};
const flag = c => FLAGS[c] ?? "🏳️";

// Player search box
function PlayerSearchBox({ label, color, onSelect, selected }) {
  const [q,    setQ]    = useState(selected?.isim ?? "");
  const [res,  setRes]  = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    setQ(selected?.isim ?? "");
  }, [selected]);

  const onChange = e => {
    const v = e.target.value; setQ(v);
    clearTimeout(timer.current);
    if (v.length < 2) { setRes([]); setOpen(false); return; }
    timer.current = setTimeout(() => {
      api.searchPlayers(v).then(d => { setRes(d); setOpen(d.length > 0); });
    }, 200);
  };

  const pick = p => {
    setQ(p.isim); setOpen(false); setRes([]);
    onSelect(p);
  };

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <div style={{ ...st.searchBox, borderColor: selected ? color : "#e2e8f0" }}>
        <span style={{ padding: "0 12px", fontSize: 14, color: selected ? color : "#94a3b8", flexShrink: 0 }}>
          {selected ? "👤" : "🔍"}
        </span>
        <input
          type="text" value={q} onChange={onChange}
          placeholder={`${label} ara…`}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
          onFocus={() => res.length > 0 && setOpen(true)}
          style={st.searchInput}
        />
        {selected && (
          <button onClick={() => { setQ(""); onSelect(null); }} style={st.clearBtn}>✕</button>
        )}
      </div>
      {open && (
        <ul style={st.dropdown}>
          {res.map(p => (
            <li key={p.oyuncu_id} onMouseDown={() => pick(p)} style={st.ddItem}>
              <span style={st.ddName}>{p.isim}</span>
              {p.mevki    && <span style={st.ddMeta}>{p.mevki}</span>}
              {p.milliyet && <span style={st.ddMeta}>{flag(p.milliyet)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Metric rows config ──────────────────────────────────────────────────────
const METRICS = [
  { key:"xg90",        label:"xG/90",         icon:"📐", fmt: v => v?.toFixed(3) },
  { key:"xa90",        label:"xA/90",          icon:"🅰️", fmt: v => v?.toFixed(3) },
  { key:"gol90",       label:"Gol/90",         icon:"⚽", fmt: v => v?.toFixed(3) },
  { key:"asist90",     label:"Asist/90",       icon:"🎯", fmt: v => v?.toFixed(3) },
  { key:"sut90",       label:"Şut/90",         icon:"🏹", fmt: v => v?.toFixed(2) },
  { key:"isabetli90",  label:"İsabetli Şut/90",icon:"✅", fmt: v => v?.toFixed(2) },
  { key:"prog_pass90", label:"Prog. Pas/90",   icon:"➡️", fmt: v => v?.toFixed(2) },
];

function StatBar({ label, icon, valA, valB, colorA, colorB, fmt }) {
  const a = parseFloat(valA) || 0;
  const b = parseFloat(valB) || 0;
  const max = Math.max(a, b, 0.001);
  const pctA = Math.round((a / max) * 100);
  const pctB = Math.round((b / max) * 100);
  const winA = a > b;
  const winB = b > a;

  return (
    <div style={st.metricRow}>
      <div style={st.metricValLeft}>
        <span style={{ ...st.metricNum, color: winA ? colorA : "#64748b" }}>
          {fmt(a)}
        </span>
      </div>

      <div style={st.metricLabel}>
        <span style={st.metricIcon}>{icon}</span>
        <span style={st.metricText}>{label}</span>
      </div>

      <div style={st.metricValRight}>
        <span style={{ ...st.metricNum, color: winB ? colorB : "#64748b" }}>
          {fmt(b)}
        </span>
      </div>

      {/* ── Bars ── */}
      <div style={st.barsWrap}>
        {/* Left bar — grows from center to left */}
        <div style={st.barHalf}>
          <div style={{
            ...st.barFill,
            width: `${pctA}%`,
            background: colorA,
            opacity: winA ? 1 : 0.35,
            marginLeft: "auto",
          }} />
        </div>
        <div style={st.barCenter} />
        {/* Right bar — grows from center to right */}
        <div style={st.barHalf}>
          <div style={{
            ...st.barFill,
            width: `${pctB}%`,
            background: colorB,
            opacity: winB ? 1 : 0.35,
          }} />
        </div>
      </div>
    </div>
  );
}

// ── Player hero card ─────────────────────────────────────────────────────────
function PlayerHero({ profile, color }) {
  if (!profile) return (
    <div style={{ ...st.hero, borderColor: "#e2e8f0" }}>
      <div style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: "28px 0" }}>
        Oyuncu seçilmedi
      </div>
    </div>
  );

  const p90 = profile.per90;
  return (
    <div style={{ ...st.hero, borderColor: color + "44" }}>
      <div style={{ height: 3, background: color, borderRadius: "8px 8px 0 0", margin: "-1px -1px 0" }} />
      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", marginBottom: 4, lineHeight: 1.2 }}>
          {profile.isim}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {profile.milliyet && <span style={{ ...st.badge, color }}>{flag(profile.milliyet)} {profile.milliyet}</span>}
          {profile.mevki    && <span style={{ ...st.badge, borderColor: color + "44", color }}>{profile.mevki}</span>}
        </div>
        <div style={{ display: "flex", gap: 16, color: "#64748b", fontSize: 11 }}>
          <span>{profile.mac_sayisi} maç</span>
          <span>{profile.toplam_dakika} dk</span>
        </div>
        {profile.club_takim && (
          <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>
            ⚽ {profile.club_takim}
            {profile.club_lig && <span style={{ opacity: 0.7 }}> · {profile.club_lig}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
const COLOR_A = "#38bdf8";
const COLOR_B = "#f59e0b";

export default function ComparePage() {
  const [playerA, setPlayerA] = useState(null);
  const [playerB, setPlayerB] = useState(null);
  const [profileA, setProfileA] = useState(null);
  const [profileB, setProfileB] = useState(null);

  useEffect(() => {
    setProfileA(null);
    if (playerA) api.getPlayer(playerA.oyuncu_id).then(setProfileA);
  }, [playerA]);

  useEffect(() => {
    setProfileB(null);
    if (playerB) api.getPlayer(playerB.oyuncu_id).then(setProfileB);
  }, [playerB]);

  const canCompare = profileA && profileB;

  return (
    <div style={st.page}>
      {/* ── Başlık ── */}
      <div style={st.header}>
        <h1 style={st.title}>⚖️ Oyuncu Karşılaştırma</h1>
        <p style={st.sub}>İki oyuncuyu yan yana metriklerle karşılaştır</p>
      </div>

      {/* ── Arama kutuları ── */}
      <div style={st.searchRow}>
        <PlayerSearchBox label="1. Oyuncu" color={COLOR_A} onSelect={setPlayerA} selected={playerA} />
        <div style={st.vsCircle}>VS</div>
        <PlayerSearchBox label="2. Oyuncu" color={COLOR_B} onSelect={setPlayerB} selected={playerB} />
      </div>

      {/* ── Hero kartları ── */}
      <div style={st.heroRow}>
        <PlayerHero profile={profileA} color={COLOR_A} />
        <PlayerHero profile={profileB} color={COLOR_B} />
      </div>

      {/* ── Karşılaştırma tablosu ── */}
      {canCompare && (
        <div style={st.compareCard}>
          {/* Header */}
          <div style={st.compareHeader}>
            <span style={{ ...st.colLabel, color: COLOR_A }}>
              {profileA.isim.split(" ").at(-1)}
            </span>
            <span style={st.colCenter}>Per 90 dk.</span>
            <span style={{ ...st.colLabel, color: COLOR_B }}>
              {profileB.isim.split(" ").at(-1)}
            </span>
          </div>

          {METRICS.map(m => (
            <StatBar
              key={m.key}
              label={m.label}
              icon={m.icon}
              valA={profileA.per90?.[m.key]}
              valB={profileB.per90?.[m.key]}
              colorA={COLOR_A}
              colorB={COLOR_B}
              fmt={m.fmt}
            />
          ))}
        </div>
      )}

      {!canCompare && (
        <div style={st.placeholder}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚽</div>
          <div style={{ color: "#64748b", fontSize: 14 }}>
            {!playerA && !playerB
              ? "Karşılaştırmak için iki oyuncu seç"
              : "İkinci oyuncuyu da seç"}
          </div>
        </div>
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 860, margin: "0 auto" },
  header: { textAlign: "center", marginBottom: 24, paddingTop: 28 },
  title: {
    fontSize: "clamp(22px,4vw,32px)", fontWeight: 900,
    color: "#0f172a", letterSpacing: -0.5, marginBottom: 6,
  },
  sub: { color: "#64748b", fontSize: 12 },

  searchRow: {
    display: "flex", alignItems: "center", gap: 12,
    marginBottom: 20,
  },
  vsCircle: {
    width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
    background: "#f1f5f9", border: "2px solid #e2e8f0",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 11, fontWeight: 900, color: "#94a3b8",
  },

  heroRow: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14,
    marginBottom: 20,
  },
  hero: {
    background: "#ffffff", border: "1px solid #e2e8f0",
    borderRadius: 12, overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
    paddingBottom: 14,
  },

  badge: {
    background: "rgba(56,189,248,.08)", border: "1px solid rgba(56,189,248,.2)",
    borderRadius: 5, fontSize: 10, fontWeight: 700, padding: "2px 8px",
  },

  // ── Search ──
  searchBox: {
    display: "flex", alignItems: "center",
    background: "#ffffff", border: "1px solid #e2e8f0",
    borderRadius: 10, overflow: "hidden",
    transition: "border-color .2s",
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
  },
  searchInput: {
    flex: 1, background: "transparent", border: "none",
    color: "#0f172a", fontSize: 13, padding: "11px 10px",
    outline: "none",
  },
  clearBtn: {
    background: "none", border: "none",
    color: "#94a3b8", cursor: "pointer",
    padding: "0 12px", fontSize: 13,
  },
  dropdown: {
    position: "absolute", top: "calc(100% + 5px)", left: 0, right: 0,
    background: "#ffffff", border: "1px solid #e2e8f0",
    borderRadius: 10, listStyle: "none", padding: "6px 0",
    zIndex: 200, maxHeight: 260, overflowY: "auto",
    boxShadow: "0 10px 40px rgba(0,0,0,.12)",
  },
  ddItem: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "9px 16px", cursor: "pointer",
    transition: "background .12s",
  },
  ddName: { color: "#0f172a", fontSize: 13, flexGrow: 1 },
  ddMeta: {
    color: "#64748b", fontSize: 11,
    background: "#f1f5f9", borderRadius: 4, padding: "1px 7px",
  },

  // ── Compare card ──
  compareCard: {
    background: "#ffffff", border: "1px solid #e2e8f0",
    borderRadius: 16, overflow: "hidden",
    boxShadow: "0 1px 4px rgba(0,0,0,.06)",
    marginBottom: 48,
  },
  compareHeader: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "14px 20px",
    borderBottom: "1px solid #f1f5f9",
    background: "#fafafa",
  },
  colLabel: {
    flex: 1, fontSize: 13, fontWeight: 800, textAlign: "center",
  },
  colCenter: {
    flex: 1, fontSize: 11, color: "#94a3b8", fontWeight: 600, textAlign: "center",
  },

  // ── Metric rows ──
  metricRow: {
    display: "flex", alignItems: "center", gap: 0,
    padding: "10px 20px",
    borderBottom: "1px solid #f8fafc",
    position: "relative",
  },
  metricValLeft: {
    flex: 1, textAlign: "right", paddingRight: 8,
  },
  metricValRight: {
    flex: 1, textAlign: "left", paddingLeft: 8,
  },
  metricNum: {
    fontSize: 16, fontWeight: 800,
  },
  metricLabel: {
    width: 140, flexShrink: 0, display: "flex",
    flexDirection: "column", alignItems: "center", gap: 1,
  },
  metricIcon: { fontSize: 14 },
  metricText: { fontSize: 10, color: "#64748b", fontWeight: 600 },

  barsWrap: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
    display: "flex", alignItems: "stretch",
  },
  barHalf: {
    flex: 1, display: "flex", alignItems: "stretch", overflow: "hidden",
  },
  barFill: {
    height: "100%", borderRadius: 2,
    transition: "width .4s ease",
    minWidth: 2,
  },
  barCenter: {
    width: 1, background: "#e2e8f0", flexShrink: 0,
  },

  placeholder: {
    textAlign: "center",
    padding: "60px 0 80px",
    color: "#94a3b8",
  },
};
