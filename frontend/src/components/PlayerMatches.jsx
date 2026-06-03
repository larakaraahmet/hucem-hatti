/**
 * PlayerMatches — Oyuncunun analiz edilen tüm maçlarını listeler.
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${parseInt(day)} ${MONTHS[parseInt(m) - 1]} ${y}`;
}

function shortTournament(t) {
  return t
    .replace("FIFA World Cup", "WC")
    .replace("UEFA Euro", "Euro")
    .replace("Copa América", "Copa");
}

const TOURN_COLOR = {
  "FIFA World Cup": "#fbbf24",
  "UEFA Euro":      "#38bdf8",
  "Copa América":   "#34d399",
};

function tournColor(t) {
  for (const [k, v] of Object.entries(TOURN_COLOR)) {
    if (t.startsWith(k)) return v;
  }
  return "#94a3b8";
}

export default function PlayerMatches({ playerId, milliyet, competition }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/player/${playerId}/matches${competition ? `?turnuva=${encodeURIComponent(competition)}` : ""}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { setMatches(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [playerId, competition]);

  if (loading) return <div style={st.empty}>Maçlar yükleniyor…</div>;
  if (!matches.length) return null;

  const shown = open ? matches : matches.slice(0, 6);

  return (
    <div style={st.wrap}>
      <div style={st.header}>
        <h3 style={st.title}>
          <span style={st.titleIcon}>📋</span>
          Analiz Edilen Maçlar
        </h3>
        <span style={st.countBadge}>{matches.length} maç</span>
      </div>

      <div style={st.list}>
        {shown.map((m, idx) => {
          const color   = tournColor(m.turnuva);
          const isHome  = milliyet && m.ev_takim.toLowerCase() === milliyet.toLowerCase();
          const isAway  = milliyet && m.deplasman_takim.toLowerCase() === milliyet.toLowerCase();
          const myTeam  = isHome ? m.ev_takim : isAway ? m.deplasman_takim : null;
          const oppTeam = isHome ? m.deplasman_takim : isAway ? m.ev_takim : null;

          return (
            <div key={m.mac_id} style={{ ...st.row, animationDelay: `${idx * 0.04}s` }} className="hh-match-row">
              {/* Turnuva renk şeridi */}
              <div style={{ ...st.stripe, background: color }} />

              {/* Sol: tarih + turnuva */}
              <div style={st.leftCol}>
                <span style={st.date}>{fmtDate(m.tarih)}</span>
                <span style={{ ...st.tourn, color }}>{shortTournament(m.turnuva)}</span>
              </div>

              {/* Orta: maç */}
              <div style={st.midCol}>
                {myTeam ? (
                  <>
                    <span style={st.myTeam}>{myTeam}</span>
                    <span style={st.vsText}>vs</span>
                    <span style={st.oppTeam}>{oppTeam}</span>
                  </>
                ) : (
                  <>
                    <span style={st.oppTeam}>{m.ev_takim}</span>
                    <span style={st.vsText}>vs</span>
                    <span style={st.oppTeam}>{m.deplasman_takim}</span>
                  </>
                )}
              </div>

              {/* Sağ: istatistikler */}
              <div style={st.statsCol}>
                <span style={st.minStat}>{m.dakika ?? "—"}'</span>
                {m.gol > 0 && (
                  <span style={st.statPill}>⚽ {m.gol}</span>
                )}
                {m.asist > 0 && (
                  <span style={{ ...st.statPill, ...st.pillAssist }}>🅰️ {m.asist}</span>
                )}
                {m.xg != null && m.xg > 0 && (
                  <span style={{ ...st.statPill, ...st.pillXg }}>xG {m.xg.toFixed(2)}</span>
                )}
                {m.isabetli_sut > 0 && (
                  <span style={{ ...st.statPill, ...st.pillShot }}>
                    🎯 {m.isabetli_sut}/{m.sut}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {matches.length > 6 && (
        <button onClick={() => setOpen(o => !o)} style={st.showMore}>
          {open ? "Daha az göster ▲" : `Tümünü göster (${matches.length}) ▼`}
        </button>
      )}
    </div>
  );
}

const st = {
  wrap: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 28,
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 18px 12px",
    borderBottom: "1px solid #f1f5f9",
  },
  title: {
    display: "flex", alignItems: "center", gap: 8,
    fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0,
  },
  titleIcon: { fontSize: 14 },
  countBadge: {
    background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)",
    borderRadius: 6, color: "#38bdf8", fontSize: 11, fontWeight: 700, padding: "2px 10px",
  },
  list: { display: "flex", flexDirection: "column" },
  row: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "10px 18px 10px 14px",
    borderBottom: "1px solid #f1f5f9",
    position: "relative",
    animation: "hh-fade-up 0.35s ease forwards",
    opacity: 0,
    transition: "background 0.15s",
  },
  stripe: {
    width: 3, height: 32, borderRadius: 2, flexShrink: 0,
  },
  leftCol: {
    display: "flex", flexDirection: "column", gap: 2,
    width: 110, flexShrink: 0,
  },
  date:  { color: "#64748b", fontSize: 11 },
  tourn: { fontSize: 11, fontWeight: 700 },
  midCol: {
    display: "flex", alignItems: "center", gap: 6,
    flex: 1, minWidth: 0,
  },
  myTeam: {
    color: "#0f172a", fontSize: 12, fontWeight: 700,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  oppTeam: {
    color: "#64748b", fontSize: 12,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  vsText: { color: "#94a3b8", fontSize: 10, flexShrink: 0 },
  statsCol: {
    display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  minStat: { color: "#94a3b8", fontSize: 11, minWidth: 26, textAlign: "right" },
  statPill: {
    background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)",
    borderRadius: 5, color: "#38bdf8", fontSize: 10, fontWeight: 700, padding: "2px 7px",
    whiteSpace: "nowrap",
  },
  pillAssist: {
    background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)",
    color: "#34d399",
  },
  pillXg: {
    background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)",
    color: "#fbbf24",
  },
  pillShot: {
    background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)",
    color: "#a78bfa",
  },
  showMore: {
    width: "100%", padding: "11px",
    background: "rgba(56,189,248,0.04)",
    border: "none", borderTop: "1px solid #f1f5f9",
    color: "#38bdf8", fontSize: 12, fontWeight: 600,
    cursor: "pointer", transition: "background 0.2s",
  },
  empty: { color: "#94a3b8", fontSize: 13, padding: "20px", textAlign: "center" },
};
