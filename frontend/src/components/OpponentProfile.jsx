/**
 * OpponentProfile — Oyuncunun rakip bazında performansı.
 * Hangi takımlara karşı daha tehlikeli? İddaa için kritik.
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export default function OpponentProfile({ playerId, milliyet, competition }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("best"); // "best" | "worst" | "all"

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/player/${playerId}/matches${competition ? `?turnuva=${encodeURIComponent(competition)}` : ""}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setMatches(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [playerId, competition]);

  if (loading) return <Wrap><div style={st.empty}>Yükleniyor…</div></Wrap>;
  if (!matches.length) return <Wrap><div style={st.empty}>Veri yok</div></Wrap>;

  const nat = (milliyet || "").toLowerCase();

  // Her maç için rakibi belirle
  function getOpponent(m) {
    if (!nat) return `${m.ev_takim} vs ${m.deplasman_takim}`;
    if (m.ev_takim.toLowerCase() === nat) return m.deplasman_takim;
    if (m.deplasman_takim.toLowerCase() === nat) return m.ev_takim;
    // Eşleşme yoksa daha uzun olanı rakip varsay
    return m.deplasman_takim;
  }

  // Rakip bazlı topla
  const oppMap = {};
  for (const m of matches) {
    const opp = getOpponent(m);
    if (!oppMap[opp]) oppMap[opp] = { n: 0, gol: 0, asist: 0, xg: 0, sut: 0, dakika: 0 };
    const o = oppMap[opp];
    o.n++;
    o.gol   += m.gol;
    o.asist += m.asist;
    o.xg    += (m.xg ?? 0);
    o.sut   += m.sut;
    o.dakika += (m.dakika ?? 90);
  }

  // Sıralama için puan: xG ağırlıklı
  const opps = Object.entries(oppMap).map(([name, d]) => ({
    name,
    ...d,
    score: d.gol * 3 + d.asist * 2 + d.xg * 1,
    xgPer90: d.dakika > 0 ? d.xg / d.dakika * 90 : 0,
    golOran: d.gol / d.n,
  })).sort((a, b) => b.score - a.score);

  const best  = opps.slice(0, 5);
  const worst = [...opps].sort((a, b) => a.score - b.score).slice(0, 5);
  const shown = view === "best" ? best : view === "worst" ? worst : opps.slice(0, 12);

  const maxScore = opps.length > 0 ? opps[0].score : 1;

  return (
    <Wrap>
      {/* Başlık */}
      <div style={st.header}>
        <span style={st.title}>🎯 Rakip Profili</span>
        <div style={st.tabs}>
          {[
            { id: "best",  label: "En İyi" },
            { id: "worst", label: "En Zayıf" },
            { id: "all",   label: "Tümü" },
          ].map(t => (
            <button key={t.id} onClick={() => setView(t.id)} style={{
              ...st.tab,
              ...(view === t.id ? st.tabActive : {}),
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Alt başlık */}
      <div style={st.subHeader}>
        <span style={st.sub}>
          {view === "best"  && "🔥 En çok katkı sağladığı rakipler"}
          {view === "worst" && "❄️ En az katkı sağladığı rakipler"}
          {view === "all"   && `📋 Tüm rakipler (${opps.length} takım)`}
        </span>
      </div>

      {/* Rakip listesi */}
      <div style={st.list}>
        {shown.map((o, i) => {
          const barW = view === "worst"
            ? Math.max(4, (1 - o.score / (maxScore + 0.1)) * 100)
            : Math.max(4, (o.score / maxScore) * 100);
          const barColor = view === "worst" ? "#ef4444"
            : o.gol > 0 && o.asist > 0 ? "#10b981"
            : o.gol > 0 ? "#22c55e"
            : o.asist > 0 ? "#38bdf8"
            : "#334155";
          const rank = view === "best" ? i + 1 : view === "worst" ? opps.length - i : null;

          return (
            <div key={o.name} style={{
              ...st.row,
              borderTop: i > 0 ? "1px solid #f1f5f9" : "none",
              background: i === 0 && view === "best" ? "rgba(16,185,129,.03)" : "transparent",
            }}>
              {rank && <span style={{ ...st.rank, color: i === 0 ? barColor : "#334155" }}>#{i + 1}</span>}

              {/* Rakip adı */}
              <div style={st.nameCol}>
                <span style={st.oppName}>{o.name}</span>
                <span style={st.oppSub}>{o.n} maç · {o.dakika} dk</span>
              </div>

              {/* Bar */}
              <div style={st.barTrack}>
                <div style={{
                  ...st.barFill,
                  width: `${barW}%`,
                  background: barColor,
                  opacity: 0.85,
                }} />
              </div>

              {/* İstatistikler */}
              <div style={st.statsCol}>
                <div style={st.statInline}>
                  <span style={{ ...st.statVal, color: o.gol > 0 ? "#22c55e" : "#334155" }}>{o.gol}G</span>
                  <span style={{ ...st.statVal, color: o.asist > 0 ? "#38bdf8" : "#334155" }}>{o.asist}A</span>
                  <span style={{ ...st.statVal, color: "#f59e0b" }}>{o.xg.toFixed(2)}xG</span>
                </div>
                <span style={{ ...st.xgPer, color: o.xgPer90 > 0.2 ? "#f59e0b" : "#334155" }}>
                  {o.xgPer90.toFixed(2)}/90
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {opps.length > 5 && view !== "all" && (
        <button onClick={() => setView("all")} style={st.moreBtn}>
          + {opps.length - 5} daha fazla rakip göster
        </button>
      )}
    </Wrap>
  );
}

function Wrap({ children }) {
  return (
    <div style={{
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: 16, overflow: "hidden", width: "100%",
    }}>{children}</div>
  );
}

const st = {
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
    padding: "12px 18px 10px",
    borderBottom: "1px solid #f1f5f9",
    background: "#fafafa",
  },
  title: { color: "#0f172a", fontSize: 13, fontWeight: 700 },
  tabs:  { display: "flex", gap: 4 },
  tab: {
    background: "transparent", border: "1px solid rgba(255,255,255,.08)",
    borderRadius: 6, color: "#94a3b8", cursor: "pointer",
    fontSize: 10, fontWeight: 700, padding: "4px 10px",
    transition: "all .15s",
  },
  tabActive: {
    background: "rgba(245,158,11,.1)", borderColor: "rgba(245,158,11,.3)",
    color: "#f59e0b",
  },

  subHeader: { padding: "6px 18px 8px", borderBottom: "1px solid #f1f5f9" },
  sub: { color: "#94a3b8", fontSize: 10, fontWeight: 600 },

  list: { display: "flex", flexDirection: "column" },
  row:  { display: "flex", alignItems: "center", gap: 10, padding: "8px 16px" },
  rank: { fontSize: 11, fontWeight: 800, width: 24, flexShrink: 0, textAlign: "center" },

  nameCol: { width: 110, flexShrink: 0 },
  oppName: { display: "block", color: "#64748b", fontSize: 11, fontWeight: 700, lineHeight: 1.2 },
  oppSub:  { color: "#94a3b8", fontSize: 9 },

  barTrack: {
    flex: 1, height: 6,
    background: "#e8eef4",
    borderRadius: 3, overflow: "hidden",
  },
  barFill: {
    height: "100%", borderRadius: 3,
    transition: "width .5s ease", minWidth: 3,
  },

  statsCol:   { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 },
  statInline: { display: "flex", gap: 6 },
  statVal:    { fontSize: 10, fontWeight: 700 },
  xgPer:      { fontSize: 9, fontWeight: 600 },

  moreBtn: {
    width: "100%",
    background: "transparent", border: "none",
    borderTop: "1px solid #f1f5f9",
    color: "#94a3b8", cursor: "pointer",
    fontSize: 11, fontWeight: 600, padding: "10px 0",
    transition: "color .15s",
  },
  empty: { color: "#94a3b8", fontSize: 13, padding: "30px 20px", textAlign: "center" },
};
