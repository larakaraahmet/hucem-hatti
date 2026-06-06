/**
 * Bracket — WC 2026 Eleme Bracket
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const STAGE_ORDER = ["Son 32","Son 16","Çeyrek Final","Yarı Final","Final","3. lük"];
const STAGE_LABEL = {
  "Son 32":      "Son 32",
  "Son 16":      "Son 16",
  "Çeyrek Final":"Çeyrek\nFinal",
  "Yarı Final":  "Yarı\nFinal",
  "Final":       "Final",
  "3. lük":      "3. lük",
};

const TR_MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]}`;
}

function MatchCard({ m }) {
  const played  = m.ev_gol != null;
  const evWin   = played && m.ev_gol > m.dep_gol;
  const depWin  = played && m.dep_gol > m.ev_gol;

  return (
    <div style={{
      background:"#ffffff", border:"1px solid #e2e8f0",
      borderRadius:8, overflow:"hidden",
      boxShadow:"0 1px 3px rgba(0,0,0,.06)",
      minWidth:160, marginBottom:6,
    }}>
      {/* Ev sahibi */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"5px 10px",
        background: evWin ? "#f0fdf4" : "#fafafa",
        borderBottom:"1px solid #f1f5f9",
      }}>
        <span style={{ fontSize:12, fontWeight: evWin ? 800 : 500, color: evWin ? "#16a34a" : "#0f172a" }}>
          {m.ev_takim || "TBD"}
        </span>
        {played && (
          <span style={{ fontSize:13, fontWeight:900, color: evWin ? "#16a34a" : "#94a3b8" }}>
            {m.ev_gol}
          </span>
        )}
      </div>
      {/* Deplasman */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"5px 10px",
        background: depWin ? "#f0fdf4" : "#ffffff",
      }}>
        <span style={{ fontSize:12, fontWeight: depWin ? 800 : 500, color: depWin ? "#16a34a" : "#0f172a" }}>
          {m.dep_takim || "TBD"}
        </span>
        {played && (
          <span style={{ fontSize:13, fontWeight:900, color: depWin ? "#16a34a" : "#94a3b8" }}>
            {m.dep_gol}
          </span>
        )}
      </div>
      {/* Tarih */}
      {m.tarih_utc && (
        <div style={{ padding:"2px 10px 4px", fontSize:9, color:"#94a3b8", background:"#fafafa" }}>
          {fmtDate(m.tarih_utc)}
        </div>
      )}
    </div>
  );
}

export default function Bracket() {
  const [data,    setData]    = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/fixtures/bracket`)
      .then(r => r.ok ? r.json() : {})
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign:"center", padding:"40px 0", color:"#94a3b8" }}>Yükleniyor…</div>;

  const stages = STAGE_ORDER.filter(s => data[s] && data[s].length > 0);

  if (!stages.length) return (
    <div style={{ textAlign:"center", padding:"60px 0", color:"#94a3b8" }}>
      <div style={{ fontSize:32, marginBottom:12 }}>🏆</div>
      <div style={{ fontSize:13 }}>Eleme bracket verisi henüz mevcut değil.</div>
      <div style={{ fontSize:11, marginTop:6 }}>Maçlar grup aşaması tamamlandıktan sonra görünecek.</div>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize:10, fontWeight:800, color:"#94a3b8", letterSpacing:".1em", textTransform:"uppercase", marginBottom:14 }}>
        WC 2026 — ELEME BRACKET
      </div>
      <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
        <div style={{ display:"flex", gap:16, alignItems:"flex-start", minWidth:"fit-content", paddingBottom:16 }}>
          {stages.map(stage => (
            <div key={stage} style={{ minWidth:180, flexShrink:0 }}>
              {/* Aşama başlığı */}
              <div style={{
                background:"#0f172a", color:"#f59e0b", fontWeight:800, fontSize:11,
                padding:"6px 12px", borderRadius:"8px 8px 0 0", textAlign:"center",
                marginBottom:8, letterSpacing:".04em", whiteSpace:"pre-line",
              }}>
                {STAGE_LABEL[stage] || stage}
              </div>
              {/* Maçlar */}
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {(data[stage] || []).map((m, i) => (
                  <MatchCard key={i} m={m} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
