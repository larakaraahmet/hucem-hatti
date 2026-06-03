/**
 * AssistQuality — xA (beklenen asist) vs gerçek asist, kilit pas kalitesi.
 * İkinci asist yapan, gol fırsatı üretme potansiyeli olan oyuncular için.
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export default function AssistQuality({ playerId, competition }) {
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

  const n           = matches.length;
  const totalAsist  = matches.reduce((a, m) => a + m.asist, 0);
  const totalXA     = matches.reduce((a, m) => a + (m.xa ?? 0), 0);
  const xaMatches   = matches.filter(m => (m.xa ?? 0) > 0.1);
  const assistMats  = matches.filter(m => m.asist > 0);

  // xA olan ama asist olmayan maçlar = "şanssız" maçlar
  const unlucky = matches.filter(m => (m.xa ?? 0) >= 0.2 && m.asist === 0).length;
  // Asist ama xA düşük = "şanslı" asistler
  const lucky   = matches.filter(m => m.asist > 0 && (m.xa ?? 0) < 0.1).length;

  // xA performansı
  const xaOverPerf = totalXA > 0 ? (totalAsist / totalXA - 1) * 100 : 0;
  const overPerfColor = xaOverPerf > 10 ? "#10b981" : xaOverPerf < -20 ? "#ef4444" : "#94a3b8";

  // Ortalamalar
  const avgXA      = totalXA / n;
  const avgXA5     = matches.slice(0, 5).reduce((a, m) => a + (m.xa ?? 0), 0) / Math.min(5, n);
  const xaTrend    = avgXA5 > avgXA * 1.15 ? "↑" : avgXA5 < avgXA * 0.7 ? "↓" : "→";
  const xaTrendC   = xaTrend === "↑" ? "#10b981" : xaTrend === "↓" ? "#ef4444" : "#f59e0b";

  // xA dağılımı (maç başına 5 grup)
  const xaBuckets = [
    { label: "0",         range: [0,    0.05],  color: "#1e293b" },
    { label: "0.05–0.15", range: [0.05, 0.15],  color: "#6366f1" },
    { label: "0.15–0.30", range: [0.15, 0.30],  color: "#38bdf8" },
    { label: "0.30+",     range: [0.30, 999],   color: "#10b981" },
  ].map(b => ({
    ...b,
    count:  matches.filter(m => { const xa = m.xa ?? 0; return xa >= b.range[0] && xa < b.range[1]; }).length,
    assists:matches.filter(m => { const xa = m.xa ?? 0; return xa >= b.range[0] && xa < b.range[1] && m.asist > 0; }).length,
  }));
  const maxBucket = Math.max(...xaBuckets.map(b => b.count), 1);

  // Son 5 xA mini bar
  const last5 = matches.slice(0, 5).reverse();
  const maxXA5 = Math.max(...last5.map(m => m.xa ?? 0), 0.1);

  return (
    <Wrap>
      <div style={st.header}>
        <span style={st.title}>🔑 Asist Kalitesi</span>
        <div style={st.pills}>
          <span style={st.pillB}>xA {totalXA.toFixed(2)}</span>
          <span style={st.pillG}>{totalAsist} gerçek</span>
        </div>
      </div>

      {/* Özet */}
      <div style={st.summary}>
        <div style={st.sumItem}>
          <span style={{ ...st.sumVal, color: "#38bdf8" }}>{totalXA.toFixed(2)}</span>
          <span style={st.sumLbl}>Toplam xA</span>
        </div>
        <div style={st.sumItem}>
          <span style={{ ...st.sumVal, color: "#10b981" }}>{totalAsist}</span>
          <span style={st.sumLbl}>Gerçek Asist</span>
        </div>
        <div style={st.sumItem}>
          <span style={{ ...st.sumVal, color: overPerfColor }}>
            {xaOverPerf > 0 ? "+" : ""}{xaOverPerf.toFixed(0)}%
          </span>
          <span style={st.sumLbl}>xA Üzeri/Altı</span>
        </div>
        <div style={st.sumItem}>
          <span style={{ ...st.sumVal, color: xaTrendC }}>{xaTrend}</span>
          <span style={st.sumLbl}>Son 5 Trend</span>
        </div>
      </div>

      {/* xA dağılım histogramı */}
      <div style={st.histWrap}>
        <div style={st.histLabel}>xA / MAÇ DAĞILIMI</div>
        <div style={st.histRow}>
          {xaBuckets.map(b => (
            <div key={b.label} style={st.histCol}>
              <div style={st.histTrack}>
                <div style={{
                  ...st.histFill,
                  height: `${Math.round(b.count / maxBucket * 100)}%`,
                  background: b.color,
                }} />
              </div>
              <span style={st.histLabel2}>{b.label}</span>
              <span style={{ ...st.histCount, color: b.count > 0 ? b.color : "#1e3a52" }}>{b.count}</span>
              {b.assists > 0 && <span style={st.histAssist}>🅰️{b.assists}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Son 5 maç xA mini grafiği */}
      <div style={st.last5Wrap}>
        <div style={st.histLabel}>SON 5 MAÇ xA</div>
        <div style={st.last5Row}>
          {last5.map((m, i) => {
            const xa  = m.xa ?? 0;
            const pct = Math.round(xa / maxXA5 * 100);
            return (
              <div key={m.mac_id} style={st.last5Col}>
                <div style={st.last5Track}>
                  <div style={{
                    ...st.last5Fill,
                    height: `${pct}%`,
                    background: m.asist > 0 ? "#10b981" : xa > 0.15 ? "#38bdf8" : "#334155",
                  }} />
                </div>
                <span style={st.last5Val}>{xa.toFixed(2)}</span>
                {m.asist > 0 && <span style={{ fontSize: 10 }}>🅰️</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Şans analizi */}
      <div style={st.chanceRow}>
        <div style={st.chanceItem}>
          <span style={{ ...st.chanceNum, color: "#ef4444" }}>{unlucky}</span>
          <span style={st.chanceLabel}>Şanssız Maç</span>
          <span style={st.chanceSub}>xA ≥0.2 ama asist yok</span>
        </div>
        <div style={st.chanceDivider} />
        <div style={st.chanceItem}>
          <span style={{ ...st.chanceNum, color: "#f59e0b" }}>{lucky}</span>
          <span style={st.chanceLabel}>Şanslı Asist</span>
          <span style={st.chanceSub}>Düşük xA'ya rağmen asist</span>
        </div>
        <div style={st.chanceDivider} />
        <div style={st.chanceItem}>
          <span style={{ ...st.chanceNum, color: "#38bdf8" }}>{(avgXA * 90).toFixed(2)}</span>
          <span style={st.chanceLabel}>xA / 90</span>
          <span style={st.chanceSub}>Ortalama kilit pas</span>
        </div>
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
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 18px 12px",
    borderBottom: "1px solid #f1f5f9",
    background: "#fafafa",
  },
  title: { color: "#0f172a", fontSize: 13, fontWeight: 700 },
  pills: { display: "flex", gap: 6 },
  pillB: { background:"rgba(56,189,248,.1)", border:"1px solid rgba(56,189,248,.2)", color:"#38bdf8", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:5 },
  pillG: { background:"rgba(16,185,129,.1)", border:"1px solid rgba(16,185,129,.2)", color:"#10b981", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:5 },

  summary: { display: "flex", borderBottom: "1px solid #f1f5f9" },
  sumItem: { flex:1, display:"flex", flexDirection:"column", alignItems:"center", padding:"10px 0", gap:3 },
  sumVal:  { fontSize:20, fontWeight:900, lineHeight:1 },
  sumLbl:  { fontSize:8, color:"#334155", fontWeight:700, letterSpacing:".08em", textTransform:"uppercase" },

  histWrap:  { padding: "10px 16px 4px" },
  histLabel: { color: "#94a3b8", fontSize: 9, fontWeight: 700, letterSpacing: ".1em", marginBottom: 8 },
  histRow:   { display: "flex", gap: 8, alignItems: "flex-end", height: 60 },
  histCol:   { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", gap: 2 },
  histTrack: { flex: 1, width: "100%", display: "flex", alignItems: "flex-end", background: "#f1f5f9", borderRadius: "3px 3px 0 0", overflow: "hidden" },
  histFill:  { width: "100%", borderRadius: "3px 3px 0 0", transition: "height .5s ease", minHeight: 3 },
  histLabel2:{ color: "#94a3b8", fontSize: 8, textAlign: "center" },
  histCount: { fontSize: 10, fontWeight: 800 },
  histAssist:{ fontSize: 9, color: "#10b981" },

  last5Wrap: { padding: "8px 16px 8px", borderTop: "1px solid #f1f5f9" },
  last5Row:  { display: "flex", gap: 6, alignItems: "flex-end", height: 52 },
  last5Col:  { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", gap: 2 },
  last5Track:{ flex: 1, width: "75%", display: "flex", alignItems: "flex-end", background: "#f1f5f9", borderRadius: "2px 2px 0 0", overflow: "hidden" },
  last5Fill: { width: "100%", borderRadius: "2px 2px 0 0", transition: "height .4s ease", minHeight: 2 },
  last5Val:  { color: "#94a3b8", fontSize: 8, fontWeight: 600 },

  chanceRow:    { display:"flex", borderTop:"1px solid #f1f5f9" },
  chanceItem:   { flex:1, display:"flex", flexDirection:"column", alignItems:"center", padding:"10px 4px", gap:2 },
  chanceNum:    { fontSize:20, fontWeight:900, lineHeight:1 },
  chanceLabel:  { fontSize:9, color:"#475569", fontWeight:700, letterSpacing:".06em" },
  chanceSub:    { fontSize:8, color:"#334155", textAlign:"center" },
  chanceDivider:{ width:1, background:"rgba(255,255,255,0.05)", flexShrink:0, margin:"8px 0" },

  empty: { color:"#334155", fontSize:13, padding:"30px 20px", textAlign:"center" },
};
