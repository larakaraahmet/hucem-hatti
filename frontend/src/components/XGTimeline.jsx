/**
 * xGTimeline — Oyuncunun maç bazında xG ve gol seyrini gösterir.
 * Yatay bar → xG değeri, altın nokta → attığı gol.
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

function fmtShortDate(d) {
  if (!d) return "—";
  const [, m, day] = d.split("-");
  return `${parseInt(day)} ${MONTHS[parseInt(m) - 1]}`;
}

function shortOpponent(ev, dep, milliyet) {
  if (!milliyet) return `${ev} - ${dep}`;
  const mine = milliyet.toLowerCase();
  if (dep.toLowerCase() === mine) return ev;
  if (ev.toLowerCase() === mine) return dep;
  return `${ev} - ${dep}`;
}

function xgColor(xg, max) {
  const ratio = max > 0 ? xg / max : 0;
  if (ratio > 0.65) return "#f59e0b";
  if (ratio > 0.35) return "#38bdf8";
  return "#1e3a52";
}

export default function XGTimeline({ playerId, milliyet, competition }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/player/${playerId}/matches${competition ? `?turnuva=${encodeURIComponent(competition)}` : ""}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setMatches(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [playerId, competition]);

  if (loading) return <Wrap><div style={st.empty}>Yükleniyor…</div></Wrap>;

  const rows = matches.filter(m => m.xg != null).slice(0, 12);
  if (!rows.length) return <Wrap><div style={st.empty}>xG verisi yok</div></Wrap>;

  const maxXg = Math.max(...rows.map(m => m.xg ?? 0), 0.1);
  const totalGoals = rows.reduce((s, m) => s + m.gol, 0);
  const totalXg    = rows.reduce((s, m) => s + (m.xg ?? 0), 0);

  return (
    <Wrap>
      {/* Başlık + özet */}
      <div style={st.header}>
        <div style={st.titleRow}>
          <span style={st.title}>⚡ xG Grafiği</span>
          <span style={st.sub}>{rows.length} maç</span>
        </div>
        <div style={st.summaryRow}>
          <div style={st.summaryItem}>
            <span style={st.summaryVal}>{totalXg.toFixed(2)}</span>
            <span style={st.summaryLbl}>Toplam xG</span>
          </div>
          <div style={st.summaryDivider} />
          <div style={st.summaryItem}>
            <span style={{ ...st.summaryVal, color: "#10b981" }}>{totalGoals}</span>
            <span style={st.summaryLbl}>Gol</span>
          </div>
          <div style={st.summaryDivider} />
          <div style={st.summaryItem}>
            <span style={{
              ...st.summaryVal,
              color: totalGoals > totalXg ? "#10b981" : totalGoals < totalXg * 0.7 ? "#ef4444" : "#94a3b8",
            }}>
              {totalXg > 0 ? (totalGoals / totalXg * 100).toFixed(0) : 0}%
            </span>
            <span style={st.summaryLbl}>Konversiyon</span>
          </div>
        </div>
      </div>

      {/* Maç satırları */}
      <div style={st.rows}>
        {rows.map((m, i) => {
          const pct   = maxXg > 0 ? (m.xg ?? 0) / maxXg * 100 : 0;
          const color = xgColor(m.xg ?? 0, maxXg);
          const opp   = shortOpponent(m.ev_takim, m.deplasman_takim, milliyet);

          return (
            <div key={m.mac_id} style={{
              ...st.row,
              borderTop: i > 0 ? "1px solid #f1f5f9" : "none",
            }}>
              {/* Tarih + rakip */}
              <div style={st.left}>
                <span style={st.date}>{fmtShortDate(m.tarih)}</span>
                <span style={st.opp}>{opp.length > 14 ? opp.slice(0, 13) + "…" : opp}</span>
              </div>

              {/* Bar */}
              <div style={st.barTrack}>
                <div style={{
                  ...st.bar,
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${color}cc 0%, ${color} 100%)`,
                  boxShadow: pct > 50 ? `0 0 8px ${color}60` : "none",
                }} />
              </div>

              {/* xG değeri */}
              <span style={{ ...st.xgVal, color }}>
                {(m.xg ?? 0).toFixed(2)}
              </span>

              {/* Goller */}
              <div style={st.goals}>
                {Array.from({ length: m.gol }).map((_, gi) => (
                  <span key={gi} style={st.goalDot}>⚽</span>
                ))}
                {m.gol === 0 && <span style={st.noGoal}>—</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Eksen etiketi */}
      <div style={st.axis}>
        <span>0</span>
        <span>{(maxXg / 2).toFixed(2)}</span>
        <span>{maxXg.toFixed(2)} xG</span>
      </div>
    </Wrap>
  );
}

function Wrap({ children }) {
  return (
    <div style={{
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: 16,
      overflow: "hidden",
      width: "100%",
    }}>
      {children}
    </div>
  );
}

const st = {
  header: {
    padding: "16px 18px 12px",
    borderBottom: "1px solid #f1f5f9",
    background: "#fafafa",
  },
  titleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 },
  title: { color: "#0f172a", fontSize: 13, fontWeight: 700 },
  sub:   { color: "#94a3b8", fontSize: 11, background: "#e8eef4", borderRadius: 4, padding: "1px 8px" },
  summaryRow: { display: "flex", alignItems: "center", gap: 0 },
  summaryItem: { display: "flex", flexDirection: "column", gap: 2, flex: 1, alignItems: "center" },
  summaryVal:  { fontSize: 20, fontWeight: 800, color: "#38bdf8", lineHeight: 1 },
  summaryLbl:  { fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" },
  summaryDivider: { width: 1, height: 32, background: "#e2e8f0", flexShrink: 0 },

  rows: { display: "flex", flexDirection: "column" },
  row: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "7px 16px",
  },
  left: { display: "flex", flexDirection: "column", gap: 1, width: 82, flexShrink: 0 },
  date: { color: "#94a3b8", fontSize: 10 },
  opp:  { color: "#64748b", fontSize: 11, fontWeight: 600 },

  barTrack: {
    flex: 1, height: 8, background: "#e8eef4",
    borderRadius: 4, overflow: "hidden",
    position: "relative",
  },
  bar: {
    height: "100%", borderRadius: 4,
    transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
    minWidth: 3,
  },
  xgVal: { fontSize: 11, fontWeight: 700, width: 34, textAlign: "right", flexShrink: 0 },
  goals: { display: "flex", gap: 2, width: 38, justifyContent: "flex-end", flexShrink: 0 },
  goalDot: { fontSize: 12, lineHeight: 1 },
  noGoal: { color: "#d1d5db", fontSize: 11 },

  axis: {
    display: "flex", justifyContent: "space-between",
    padding: "6px 16px 6px 108px",
    color: "#d1d5db", fontSize: 9, fontWeight: 600,
    borderTop: "1px solid #f1f5f9",
  },
  empty: { color: "#94a3b8", fontSize: 13, padding: "30px 20px", textAlign: "center" },
};
