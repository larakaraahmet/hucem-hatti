/**
 * ContribTimeline — Oyuncunun maç bazında gol+asist katkılarını ve
 * progressive pass trendini gösterir.
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
function shortDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${parseInt(day)} ${MONTHS[parseInt(m)-1]}`;
}

function shortOpp(ev, dep, milliyet) {
  if (!milliyet) return `${ev}-${dep}`;
  const m = milliyet.toLowerCase();
  if (dep.toLowerCase() === m) return ev.length > 8 ? ev.slice(0,7)+"…" : ev;
  if (ev.toLowerCase()  === m) return dep.length > 8 ? dep.slice(0,7)+"…" : dep;
  return ev.length > 6 ? ev.slice(0,5)+"…" : ev;
}

export default function ContribTimeline({ playerId, milliyet, competition }) {
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
  if (!matches.length) return <Wrap><div style={st.empty}>Maç verisi yok</div></Wrap>;

  const rows      = matches.slice(0, 15).reverse(); // kronolojik
  const totalG    = matches.reduce((a, m) => a + m.gol,   0);
  const totalA    = matches.reduce((a, m) => a + m.asist, 0);
  const totalProg = matches.reduce((a, m) => a + (m.progressive_pass ?? 0), 0);
  const maxProg   = Math.max(...matches.map(m => m.progressive_pass ?? 0), 1);

  // Maçlarda aktif olduğu (katkısı olan) kaç maç
  const activeMatches = matches.filter(m => m.gol > 0 || m.asist > 0).length;

  return (
    <Wrap>
      {/* Başlık */}
      <div style={st.header}>
        <span style={st.title}>📈 Katkı & Form</span>
        <div style={st.pills}>
          <span style={st.pillG}>⚽ {totalG} gol</span>
          <span style={st.pillA}>🅰️ {totalA} asist</span>
          <span style={st.pillP}>➡️ {totalProg} prog.pas</span>
        </div>
      </div>

      {/* Özet satır */}
      <div style={st.summary}>
        <div style={st.sumItem}>
          <span style={st.sumVal}>{matches.length}</span>
          <span style={st.sumLbl}>Maç</span>
        </div>
        <div style={st.sumItem}>
          <span style={{ ...st.sumVal, color: "#10b981" }}>{totalG + totalA}</span>
          <span style={st.sumLbl}>G+A Toplamı</span>
        </div>
        <div style={st.sumItem}>
          <span style={{
            ...st.sumVal,
            color: activeMatches / matches.length > 0.5 ? "#10b981" :
                   activeMatches / matches.length > 0.25 ? "#f59e0b" : "#ef4444",
          }}>
            %{Math.round(activeMatches / matches.length * 100)}
          </span>
          <span style={st.sumLbl}>Aktif Maç</span>
        </div>
        <div style={st.sumItem}>
          <span style={{ ...st.sumVal, color: "#a78bfa" }}>
            {matches.length > 0 ? (totalProg / matches.length).toFixed(1) : "—"}
          </span>
          <span style={st.sumLbl}>Ort. Prog.Pas</span>
        </div>
      </div>

      {/* Kolon zaman çizelgesi */}
      <div style={st.timelineWrap}>
        <div style={st.timeline}>
          {rows.map((m, i) => {
            const hasCont  = m.gol > 0 || m.asist > 0;
            const prog     = m.progressive_pass ?? 0;
            const progPct  = Math.round(prog / maxProg * 100);
            const opp      = shortOpp(m.ev_takim, m.deplasman_takim, milliyet);
            const dk       = m.dakika ?? 90;

            return (
              <div key={m.mac_id} style={st.col}>
                {/* Gol + asist göstergeleri */}
                <div style={st.dotsArea}>
                  {Array.from({ length: m.gol }).map((_, gi) => (
                    <span key={`g${gi}`} style={st.goalDot} title="Gol">⚽</span>
                  ))}
                  {Array.from({ length: m.asist }).map((_, ai) => (
                    <span key={`a${ai}`} style={st.assistDot} title="Asist">🅰️</span>
                  ))}
                  {!hasCont && <div style={st.noDot} />}
                </div>

                {/* Progressive pass çubuğu */}
                <div style={st.progTrack}>
                  <div style={{
                    ...st.progFill,
                    height: `${progPct}%`,
                    opacity: prog > 0 ? 1 : 0.2,
                  }} />
                </div>

                {/* Dakika göstergesi */}
                <div style={{
                  ...st.dkBar,
                  height: `${Math.round(dk / 120 * 100)}%`,
                  background: dk >= 90 ? "#334155" : "#f59e0b55",
                }} title={`${dk} dk`} />

                {/* Rakip */}
                <span style={st.oppLabel}>{opp}</span>
                <span style={st.dateLabel}>{shortDate(m.tarih)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lejand */}
      <div style={st.legend}>
        <div style={st.legItem}><span style={st.legDot}>⚽</span> Gol</div>
        <div style={st.legItem}><span style={st.legDot}>🅰️</span> Asist</div>
        <div style={st.legItem}><div style={{ ...st.legBar, background: "#a78bfa" }} /> İlrltc.Pas</div>
        <div style={st.legItem}><div style={{ ...st.legBar, background: "#334155" }} /> Süre</div>
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
  pillG: {
    background: "rgba(16,185,129,.12)", border: "1px solid rgba(16,185,129,.22)",
    color: "#10b981", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
  },
  pillA: {
    background: "rgba(56,189,248,.12)", border: "1px solid rgba(56,189,248,.22)",
    color: "#38bdf8", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
  },
  pillP: {
    background: "rgba(167,139,250,.12)", border: "1px solid rgba(167,139,250,.22)",
    color: "#a78bfa", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
  },

  summary: {
    display: "flex",
    borderBottom: "1px solid #f1f5f9",
  },
  sumItem: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0", gap: 3 },
  sumVal:  { fontSize: 20, fontWeight: 900, color: "#38bdf8", lineHeight: 1 },
  sumLbl:  { fontSize: 9, color: "#94a3b8", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" },

  timelineWrap: { padding: "14px 12px 4px", overflowX: "auto" },
  timeline: { display: "flex", gap: 6, alignItems: "flex-end", minWidth: "max-content", paddingBottom: 4 },

  col: {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: 3, width: 44,
  },
  dotsArea: {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: 2, minHeight: 40, justifyContent: "flex-end",
  },
  goalDot:  { fontSize: 14, lineHeight: 1 },
  assistDot:{ fontSize: 12, lineHeight: 1 },
  noDot: { width: 4, height: 4, borderRadius: "50%", background: "#e2e8f0" },

  progTrack: {
    width: "70%", height: 36,
    background: "rgba(167,139,250,0.1)", borderRadius: "3px 3px 0 0",
    display: "flex", alignItems: "flex-end", overflow: "hidden",
  },
  progFill: {
    width: "100%", background: "#a78bfa",
    borderRadius: "3px 3px 0 0", transition: "height .5s ease",
  },

  dkBar: {
    width: "50%", background: "#334155",
    borderRadius: "2px 2px 0 0", transition: "height .5s ease",
    minHeight: 2,
  },

  oppLabel:  { color: "#94a3b8", fontSize: 8, fontWeight: 600, textAlign: "center", lineHeight: 1.2 },
  dateLabel: { color: "#d1d5db", fontSize: 7, textAlign: "center" },

  legend: {
    display: "flex", gap: 14, padding: "8px 16px",
    borderTop: "1px solid #f1f5f9",
    justifyContent: "flex-end",
  },
  legItem: {
    display: "flex", alignItems: "center", gap: 5,
    color: "#94a3b8", fontSize: 10, fontWeight: 600,
  },
  legDot: { fontSize: 11 },
  legBar: { width: 10, height: 10, borderRadius: 2 },
  empty: { color: "#94a3b8", fontSize: 13, padding: "30px 20px", textAlign: "center" },
};
