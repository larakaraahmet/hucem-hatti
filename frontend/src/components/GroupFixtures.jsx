/**
 * GroupFixtures — WC 2026 Grup Fikstürü
 * Props: onTeamClick(takim)
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const TR_MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]}`;
}

function MatchRow({ m, onTeamClick }) {
  const played = m.ev_gol != null;
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:6,
      padding:"6px 10px", borderBottom:"1px solid #f1f5f9",
      fontSize:12,
    }}>
      <span style={{ color:"#94a3b8", fontSize:10, width:40, flexShrink:0 }}>{fmtDate(m.tarih_utc)}</span>
      <span
        onClick={() => onTeamClick && onTeamClick(m.ev_takim)}
        style={{ flex:1, textAlign:"right", fontWeight: played ? 700 : 500, cursor:"pointer",
                 color: played && m.ev_gol > m.dep_gol ? "#16a34a" : "#0f172a" }}
      >{m.ev_takim}</span>
      <span style={{
        padding:"1px 8px", borderRadius:5, background:"#f1f5f9",
        fontWeight:800, fontSize:11, color:"#334155", flexShrink:0,
      }}>
        {played ? `${m.ev_gol} – ${m.dep_gol}` : "vs"}
      </span>
      <span
        onClick={() => onTeamClick && onTeamClick(m.dep_takim)}
        style={{ flex:1, textAlign:"left", fontWeight: played ? 700 : 500, cursor:"pointer",
                 color: played && m.dep_gol > m.ev_gol ? "#16a34a" : "#0f172a" }}
      >{m.dep_takim}</span>
    </div>
  );
}

export default function GroupFixtures({ onTeamClick }) {
  const [data,    setData]    = useState({});
  const [loading, setLoading] = useState(true);
  const [selGrp,  setSelGrp]  = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/fixtures/groups`)
      .then(r => r.ok ? r.json() : {})
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const groups = Object.keys(data).sort();

  if (loading) return <div style={{ textAlign:"center", padding:"40px 0", color:"#94a3b8" }}>Yükleniyor…</div>;
  if (!groups.length) return <div style={{ textAlign:"center", padding:"40px 0", color:"#94a3b8" }}>Fikstür verisi bulunamadı.</div>;

  return (
    <div>
      <div style={{ fontSize:10, fontWeight:800, color:"#94a3b8", letterSpacing:".1em", textTransform:"uppercase", marginBottom:14 }}>
        WC 2026 — GRUP AŞAMASI
      </div>

      {/* Grup sekme seçici */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:16 }}>
        <button onClick={() => setSelGrp(null)} style={{
          padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:700, cursor:"pointer",
          background: selGrp === null ? "#fef3c7" : "#ffffff",
          border:`1px solid ${selGrp === null ? "#fde68a" : "#e2e8f0"}`,
          color: selGrp === null ? "#d97706" : "#64748b",
        }}>Tümü</button>
        {groups.map(g => (
          <button key={g} onClick={() => setSelGrp(selGrp === g ? null : g)} style={{
            padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:800, cursor:"pointer",
            background: selGrp === g ? "#0f172a" : "#ffffff",
            border:`1px solid ${selGrp === g ? "#0f172a" : "#e2e8f0"}`,
            color: selGrp === g ? "#f59e0b" : "#334155",
          }}>Grup {g}</button>
        ))}
      </div>

      {/* Grup kartları */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px,1fr))", gap:12 }}>
        {groups.filter(g => !selGrp || g === selGrp).map(g => {
          const matches = data[g] || [];
          // Takım listesi (unique)
          const teams = [...new Set(matches.flatMap(m => [m.ev_takim, m.dep_takim]))];
          return (
            <div key={g} style={{
              background:"#ffffff", border:"1px solid #e2e8f0",
              borderRadius:12, overflow:"hidden",
              boxShadow:"0 1px 3px rgba(0,0,0,.06)",
            }}>
              {/* Grup başlığı */}
              <div style={{
                background:"#0f172a", padding:"8px 14px",
                display:"flex", alignItems:"center", gap:10,
              }}>
                <span style={{ fontSize:16, fontWeight:900, color:"#f59e0b", letterSpacing:".05em" }}>
                  GRUP {g}
                </span>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap", flex:1 }}>
                  {teams.map(t => (
                    <span key={t} onClick={() => onTeamClick && onTeamClick(t)}
                      style={{ fontSize:9, color:"rgba(255,255,255,.7)", cursor:"pointer",
                               background:"rgba(255,255,255,.08)", borderRadius:4, padding:"2px 6px" }}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              {/* Maçlar */}
              <div>
                {matches.map((m, i) => (
                  <MatchRow key={i} m={m} onTeamClick={onTeamClick} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
