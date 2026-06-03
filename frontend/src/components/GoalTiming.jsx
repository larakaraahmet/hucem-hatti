/**
 * GoalTiming — Oyuncunun gol dakika dağılımı analizi
 *
 * İki veri kaynağını birleştirir:
 *   - StatsBomb shots (dakika dolu olanlar, migrasyon sonrası)
 *   - openfootball wc_historical_matches goller JSON
 *
 * Props: playerId, competition (opsiyonel filtre)
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// Periyot renkleri
const PERIOD_COLOR = {
  1: "#38bdf8",   // 1. yarı — mavi
  2: "#f59e0b",   // 2. yarı — turuncu
  3: "#a78bfa",   // uzatma — mor
};

// Dakika aralığı renk haritası
const INTERVAL_COLORS = [
  "#06b6d4",   // 0-15
  "#38bdf8",   // 16-30
  "#60a5fa",   // 31-45
  "#f59e0b",   // 46-60
  "#fb923c",   // 61-75
  "#ef4444",   // 76-90
  "#dc2626",   // 90+
];

export default function GoalTiming({ playerId, competition }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [view,    setView]    = useState("bar"); // "bar" | "list"

  useEffect(() => {
    if (!playerId) return;
    setLoading(true);
    const qs = competition ? `?turnuva=${encodeURIComponent(competition)}` : "";
    fetch(`${API_BASE}/player/${playerId}/goal-timing${qs}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [playerId, competition]);

  if (loading) return <Wrap><div style={st.empty}>⏳ Yükleniyor…</div></Wrap>;
  if (!data || data.toplam_gol === 0) return (
    <Wrap>
      <div style={st.empty}>⚽ Gol dakika verisi bulunamadı.</div>
    </Wrap>
  );

  const { toplam_gol, ort_dakika, dagilim, goller, erken_gec_oran } = data;
  const maxSayi = Math.max(...dagilim.map(d => d.sayi), 1);

  return (
    <Wrap>
      {/* Başlık */}
      <div style={st.header}>
        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
          <span style={{ fontSize:14 }}>⏱️</span>
          <span style={st.title}>Gol Dakika Analizi</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ fontSize:11, color:"#10b981", fontWeight:700 }}>
            {toplam_gol} gol
          </span>
          <span style={{ color:"#d1d5db" }}>·</span>
          <span style={{ fontSize:10, color:"#94a3b8" }}>
            ort. {ort_dakika}'
          </span>
          {/* Bar / Liste toggle */}
          <div style={st.toggle}>
            {["bar","list"].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                ...st.toggleBtn,
                background: view===v ? "#0f172a" : "transparent",
                color:      view===v ? "#fff" : "#94a3b8",
              }}>
                {v === "bar" ? "📊" : "📋"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Erken / Geç oranı */}
      <div style={st.halfBar}>
        <div style={{
          ...st.halfFill,
          width: `${erken_gec_oran.erken_pct}%`,
          background: "#38bdf8",
        }} />
        <div style={{
          ...st.halfFill,
          width: `${erken_gec_oran.gec_pct}%`,
          background: "#f59e0b",
        }} />
      </div>
      <div style={st.halfLabels}>
        <span style={{ color:"#38bdf8", fontSize:9, fontWeight:700 }}>
          1Y %{erken_gec_oran.erken_pct}
        </span>
        <span style={{ color:"#94a3b8", fontSize:8 }}>45'</span>
        <span style={{ color:"#f59e0b", fontSize:9, fontWeight:700 }}>
          2Y %{erken_gec_oran.gec_pct}
        </span>
      </div>

      {view === "bar" ? (
        /* ── Histogram ── */
        <div style={st.histWrap}>
          {dagilim.map((d, i) => {
            const pct = Math.round(d.sayi / maxSayi * 100);
            return (
              <div key={d.aralik} style={st.histCol}>
                <div style={st.histColInner}>
                  {d.sayi > 0 && (
                    <span style={{ ...st.histCount, color: INTERVAL_COLORS[i] }}>
                      {d.sayi}
                    </span>
                  )}
                  <div style={{
                    ...st.histBar,
                    height: `${Math.max(pct, 4)}%`,
                    background: INTERVAL_COLORS[i],
                    opacity: d.sayi === 0 ? 0.2 : 1,
                  }} />
                </div>
                <span style={st.histLabel}>{d.aralik}</span>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Liste ── */
        <div style={st.listWrap}>
          {goller.length === 0 ? (
            <div style={st.empty}>Detaylı veri yok.</div>
          ) : (
            goller.map((g, i) => (
              <div key={i} style={st.goalRow}>
                <div style={{
                  ...st.dakikaBadge,
                  background: PERIOD_COLOR[g.period] + "20",
                  color: PERIOD_COLOR[g.period],
                  border: `1px solid ${PERIOD_COLOR[g.period]}40`,
                }}>
                  {g.dakika}'
                </div>
                <div style={st.goalInfo}>
                  <span style={st.goalRakip}>{g.rakip || "—"}</span>
                  {g.turnuva && (
                    <span style={st.goalTurnuva}>{g.turnuva}</span>
                  )}
                </div>
                {g.mac_tarihi && (
                  <span style={st.goalTarih}>
                    {g.mac_tarihi.slice(0, 10)}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Footer: period dağılımı */}
      <div style={st.footer}>
        {[
          { label: "1. Yarı (0–45')", range: [0, 45],  color: "#38bdf8" },
          { label: "2. Yarı (46–90')", range: [46, 90], color: "#f59e0b" },
          { label: "Uzatma (90+)",    range: [91, 999], color: "#a78bfa" },
        ].map(({ label, range, color }) => {
          const n = goller.filter(g => g.dakika >= range[0] && g.dakika <= range[1]).length;
          if (n === 0) return null;
          return (
            <div key={label} style={st.footerItem}>
              <span style={{ ...st.footerDot, background: color }} />
              <span style={st.footerLabel}>{label}</span>
              <span style={{ ...st.footerVal, color }}>{n}</span>
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
      background: "#fff",
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
    display:"flex", alignItems:"center", justifyContent:"space-between",
    padding:"14px 16px 10px",
    borderBottom:"1px solid #f1f5f9",
    background:"#fafafa",
  },
  title: { fontSize:13, fontWeight:700, color:"#0f172a" },
  toggle: {
    display:"flex", background:"#f1f5f9", borderRadius:6, padding:2, gap:1,
  },
  toggleBtn: {
    border:"none", borderRadius:5, padding:"3px 7px",
    fontSize:11, cursor:"pointer", transition:"all .15s",
  },

  halfBar: {
    display:"flex", height:4, margin:"10px 16px 0",
    borderRadius:2, overflow:"hidden", gap:2, background:"#f1f5f9",
  },
  halfFill: { height:"100%", borderRadius:2, transition:"width .6s ease" },
  halfLabels: {
    display:"flex", justifyContent:"space-between",
    padding:"2px 16px 0", marginBottom:6,
  },

  histWrap: {
    display:"flex", gap:4, alignItems:"flex-end",
    height:100, padding:"6px 16px 4px",
  },
  histCol: {
    flex:1, display:"flex", flexDirection:"column",
    alignItems:"center", height:"100%", gap:2,
  },
  histColInner: {
    flex:1, width:"100%", display:"flex", flexDirection:"column",
    justifyContent:"flex-end", alignItems:"center",
  },
  histCount: { fontSize:9, fontWeight:700, marginBottom:2 },
  histBar:   { width:"80%", borderRadius:"3px 3px 0 0", minHeight:3, transition:"height .5s ease" },
  histLabel: { color:"#94a3b8", fontSize:8, fontWeight:600, textAlign:"center" },

  listWrap: {
    padding:"8px 16px",
    maxHeight:220,
    overflowY:"auto",
  },
  goalRow: {
    display:"flex", alignItems:"center", gap:8,
    padding:"5px 0",
    borderBottom:"1px solid #f8fafc",
  },
  dakikaBadge: {
    fontSize:12, fontWeight:800,
    minWidth:38, textAlign:"center",
    padding:"2px 6px", borderRadius:6, flexShrink:0,
  },
  goalInfo: { flex:1, display:"flex", flexDirection:"column", gap:1 },
  goalRakip: { fontSize:11, fontWeight:600, color:"#0f172a" },
  goalTurnuva: { fontSize:9, color:"#94a3b8" },
  goalTarih: { fontSize:9, color:"#cbd5e1", flexShrink:0 },

  footer: {
    borderTop:"1px solid #f1f5f9",
    padding:"8px 16px",
    display:"flex", flexDirection:"column", gap:4,
  },
  footerItem: { display:"flex", alignItems:"center", gap:6 },
  footerDot: { width:7, height:7, borderRadius:"50%", flexShrink:0 },
  footerLabel: { fontSize:10, color:"#94a3b8", flex:1 },
  footerVal: { fontSize:12, fontWeight:700 },
  empty: { color:"#94a3b8", fontSize:12, padding:"24px", textAlign:"center" },
};
