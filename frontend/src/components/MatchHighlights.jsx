/**
 * MatchHighlights — Kariyer boyunca en iyi 5 maç performansı.
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const MONTHS   = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

function shortDate(d) {
  if (!d) return "—";
  const [, m, day] = d.split("-");
  return `${parseInt(day)} ${MONTHS[parseInt(m)-1]}`;
}

function score(m) {
  return (m.gol * 4) + (m.asist * 2.5) + ((m.xg ?? 0) * 2) + ((m.xa ?? 0) * 1.5) + (m.isabetli_sut * 0.5);
}

const TURNUVA_COLOR = {
  "FIFA World Cup": "#f59e0b",
  "UEFA Euro":     "#38bdf8",
  "Copa América":  "#a78bfa",
};
function tColor(t) {
  for (const [k, v] of Object.entries(TURNUVA_COLOR))
    if (t?.includes(k)) return v;
  return "#10b981";
}

export default function MatchHighlights({ playerId, milliyet, competition }) {
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
  if (!matches.length) return <Wrap><div style={st.empty}>Veri yok</div></Wrap>;

  const nat   = (milliyet || "").toLowerCase();
  const top5  = [...matches].sort((a, b) => score(b) - score(a)).slice(0, 5);
  const best  = top5[0];
  const maxSc = score(best);

  function getOpp(m) {
    if (!nat) return `${m.ev_takim} - ${m.deplasman_takim}`;
    if (m.ev_takim.toLowerCase() === nat)        return m.deplasman_takim;
    if (m.deplasman_takim.toLowerCase() === nat) return m.ev_takim;
    return m.deplasman_takim;
  }

  return (
    <Wrap>
      <div style={st.header}>
        <span style={st.title}>🏅 Kariyer Şovları</span>
        <span style={st.sub}>En iyi 5 maç · xG + Gol + Asist skoru</span>
      </div>

      <div style={st.list}>
        {top5.map((m, i) => {
          const sc     = score(m);
          const pct    = Math.round(sc / maxSc * 100);
          const c      = tColor(m.turnuva);
          const isBest = i === 0;

          return (
            <div key={m.mac_id} style={{
              ...st.row,
              borderTop: i > 0 ? "1px solid #f1f5f9" : "none",
              background: isBest ? "rgba(245,158,11,0.04)" : "transparent",
            }}>
              {/* Sıra */}
              <div style={{ ...st.rank, color: isBest ? "#f59e0b" : "#334155" }}>
                {isBest ? "★" : `#${i+1}`}
              </div>

              {/* Turnuva renk çizgisi */}
              <div style={{ width: 3, alignSelf: "stretch", background: c, borderRadius: 2, flexShrink: 0 }} />

              {/* Maç bilgisi */}
              <div style={st.matchInfo}>
                <span style={st.opp}>{getOpp(m)}</span>
                <span style={st.meta}>{shortDate(m.tarih)} · {m.turnuva}</span>
              </div>

              {/* Katkı */}
              <div style={st.contribs}>
                {m.gol   > 0 && <span style={st.chip}>⚽ {m.gol}</span>}
                {m.asist > 0 && <span style={{ ...st.chip, background: "rgba(56,189,248,.15)", color: "#38bdf8" }}>🅰️ {m.asist}</span>}
                {(m.xg ?? 0) > 0 && <span style={{ ...st.chip, background: "rgba(245,158,11,.1)", color: "#f59e0b" }}>xG {(m.xg??0).toFixed(2)}</span>}
              </div>

              {/* Skor barı */}
              <div style={st.barCol}>
                <div style={st.barTrack}>
                  <div style={{ ...st.barFill, width: `${pct}%`, background: c }} />
                </div>
                <span style={{ ...st.scoreNum, color: c }}>{sc.toFixed(1)}</span>
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
    display: "flex", alignItems: "baseline", justifyContent: "space-between",
    padding: "14px 18px 12px",
    borderBottom: "1px solid #f1f5f9",
    background: "#fafafa",
  },
  title: { color: "#0f172a", fontSize: 13, fontWeight: 700 },
  sub:   { color: "#94a3b8", fontSize: 10 },

  list: { display: "flex", flexDirection: "column" },
  row:  { display: "flex", alignItems: "center", gap: 10, padding: "10px 16px" },

  rank: { fontSize: 13, fontWeight: 900, width: 22, textAlign: "center", flexShrink: 0 },

  matchInfo: { flex: 1, minWidth: 0 },
  opp:  { display: "block", color: "#64748b", fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  meta: { color: "#94a3b8", fontSize: 9 },

  contribs: { display: "flex", gap: 4, flexWrap: "wrap", flexShrink: 0 },
  chip: {
    fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
    background: "rgba(34,197,94,.15)", color: "#22c55e",
  },

  barCol:   { display: "flex", alignItems: "center", gap: 6, width: 80, flexShrink: 0 },
  barTrack: { flex: 1, height: 5, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" },
  barFill:  { height: "100%", borderRadius: 3, transition: "width .5s ease" },
  scoreNum: { fontSize: 10, fontWeight: 800, width: 28, textAlign: "right" },

  empty: { color: "#94a3b8", fontSize: 13, padding: "30px 20px", textAlign: "center" },
};
