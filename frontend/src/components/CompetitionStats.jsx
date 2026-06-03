/**
 * CompetitionStats — Oyuncunun turnuva bazında istatistiklerini gösterir.
 * Her turnuva için maç, dakika, gol, asist, xG kartı.
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// Turnuva adından kısa renk/ikon ata
function tournamentMeta(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("world cup") || n.includes("dünya"))
    return { icon: "🌍", color: "#f59e0b", short: "WC" };
  if (n.includes("euro") || n.includes("avrupa"))
    return { icon: "⭐", color: "#38bdf8", short: "EURO" };
  if (n.includes("copa") || n.includes("america"))
    return { icon: "🏆", color: "#a78bfa", short: "COPA" };
  return { icon: "🎯", color: "#10b981", short: "INT" };
}

export default function CompetitionStats({ playerId }) {
  const [stats,   setStats]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/player/${playerId}/competition-stats`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [playerId]);

  if (loading) return <Wrap><div style={st.empty}>Yükleniyor…</div></Wrap>;
  if (!stats.length) return <Wrap><div style={st.empty}>Turnuva verisi yok</div></Wrap>;

  const totals = stats.reduce((acc, s) => ({
    mac:   acc.mac   + s.mac_sayisi,
    dk:    acc.dk    + s.dakika,
    gol:   acc.gol   + s.gol,
    asist: acc.asist + s.asist,
    xg:    acc.xg    + s.xg,
  }), { mac: 0, dk: 0, gol: 0, asist: 0, xg: 0 });

  return (
    <Wrap>
      {/* Başlık */}
      <div style={st.header}>
        <span style={st.title}>🏅 Turnuva Bazında</span>
        <div style={st.pills}>
          <span style={st.pillB}>{stats.length} turnuva</span>
          <span style={st.pillG}>⚽ {totals.gol} gol</span>
        </div>
      </div>

      {/* Özet bar */}
      <div style={st.totals}>
        {[
          { l: "Maç",   v: totals.mac,              c: "#94a3b8" },
          { l: "Dakika",v: totals.dk,                c: "#38bdf8" },
          { l: "G+A",   v: totals.gol + totals.asist,c: "#10b981" },
          { l: "xG",    v: totals.xg.toFixed(2),     c: "#f59e0b" },
        ].map(({ l, v, c }) => (
          <div key={l} style={st.totalItem}>
            <span style={{ ...st.totalVal, color: c }}>{v}</span>
            <span style={st.totalLbl}>{l}</span>
          </div>
        ))}
      </div>

      {/* Turnuva kartları */}
      <div style={st.cards}>
        {stats.map((s, i) => {
          const { icon, color, short } = tournamentMeta(s.turnuva);
          const ga      = s.gol + s.asist;
          const xgPer90 = s.dakika > 0 ? (s.xg / s.dakika * 90) : 0;

          return (
            <div key={i} style={{ ...st.card, borderColor: color + "30" }}>
              {/* Sol çubuk rengi */}
              <div style={{ ...st.cardBar, background: color }} />

              <div style={st.cardBody}>
                {/* Turnuva adı */}
                <div style={st.cardHead}>
                  <span style={st.cardIcon}>{icon}</span>
                  <div style={st.cardInfo}>
                    <span style={{ ...st.cardName, color }}>{s.turnuva}</span>
                    <span style={st.cardSub}>{s.mac_sayisi} maç · {s.dakika} dk</span>
                  </div>
                  <span style={{ ...st.shortBadge, color, borderColor: color + "45", background: color + "12" }}>
                    {short}
                  </span>
                </div>

                {/* Stat satırı */}
                <div style={st.statRow}>
                  <div style={st.statBox}>
                    <span style={{ ...st.statNum, color: "#10b981" }}>{s.gol}</span>
                    <span style={st.statLbl}>Gol</span>
                  </div>
                  <div style={st.statBox}>
                    <span style={{ ...st.statNum, color: "#38bdf8" }}>{s.asist}</span>
                    <span style={st.statLbl}>Asist</span>
                  </div>
                  <div style={st.statBox}>
                    <span style={{ ...st.statNum, color: "#f59e0b" }}>{s.xg.toFixed(2)}</span>
                    <span style={st.statLbl}>xG</span>
                  </div>
                  <div style={st.statBox}>
                    <span style={{ ...st.statNum, color: "#a78bfa" }}>{xgPer90.toFixed(2)}</span>
                    <span style={st.statLbl}>xG/90</span>
                  </div>
                  <div style={st.statBox}>
                    <span style={{
                      ...st.statNum,
                      color: s.gol > s.xg ? "#10b981" : s.gol < s.xg * 0.7 ? "#ef4444" : "#94a3b8",
                    }}>{ga}</span>
                    <span style={st.statLbl}>G+A</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
    padding: "14px 18px 12px",
    borderBottom: "1px solid #f1f5f9",
    background: "#fafafa",
  },
  title: { color: "#0f172a", fontSize: 13, fontWeight: 700 },
  pills: { display: "flex", gap: 6 },
  pillB: {
    background: "rgba(56,189,248,.1)", border: "1px solid rgba(56,189,248,.2)",
    color: "#38bdf8", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
  },
  pillG: {
    background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.2)",
    color: "#10b981", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
  },

  totals: {
    display: "flex",
    borderBottom: "1px solid #f1f5f9",
  },
  totalItem: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 4px", gap: 3 },
  totalVal:  { fontSize: 20, fontWeight: 900, lineHeight: 1 },
  totalLbl:  { fontSize: 9, color: "#94a3b8", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" },

  cards: { display: "flex", flexDirection: "column", gap: 0 },

  card: {
    display: "flex",
    borderBottom: "1px solid #f1f5f9",
    position: "relative",
    overflow: "hidden",
  },
  cardBar: { width: 3, flexShrink: 0 },
  cardBody: { flex: 1, padding: "12px 16px 10px 14px" },

  cardHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  cardIcon: { fontSize: 18, flexShrink: 0 },
  cardInfo: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 11, fontWeight: 800, display: "block", letterSpacing: ".02em" },
  cardSub:  { fontSize: 10, color: "#94a3b8", fontWeight: 600 },
  shortBadge: {
    fontSize: 9, fontWeight: 900, padding: "2px 8px",
    borderRadius: 4, border: "1px solid", letterSpacing: ".06em",
    flexShrink: 0,
  },

  statRow: { display: "flex", gap: 0 },
  statBox: {
    flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
    padding: "4px 0",
    borderRight: "1px solid #f1f5f9",
  },
  statNum:  { fontSize: 16, fontWeight: 900, lineHeight: 1 },
  statLbl:  { fontSize: 8, color: "#94a3b8", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" },

  empty: { color: "#94a3b8", fontSize: 13, padding: "30px 20px", textAlign: "center" },
};
