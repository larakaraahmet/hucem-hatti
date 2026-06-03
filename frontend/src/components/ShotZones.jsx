/**
 * ShotZones — Şutları saha bölgelerine göre gruplar.
 * StatsBomb koordinatları: rakip kale x=120, y=40 (birim: yard).
 * Gösterimde 1 yard = 0.9144 m dönüşümü uygulanır.
 * Bölgeler: 6m Kutusu, ceza sahası, dışarı.
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// StatsBomb koordinatlarında bölge sınıflandırması
function classifyZone(x, y) {
  if (x >= 114 && y >= 30 && y <= 50) return "6yard";
  if (x >= 102 && y >= 18 && y <= 62) return "box";
  return "outside";
}

// StatsBomb birimi → metre (1 yard = 0.9144 m)
const YD_TO_M = 0.9144;
const toMetres = (yards) => yards * YD_TO_M;

// Kaleye mesafe (metre cinsinden)
function distToGoal(x, y) {
  const yd = Math.sqrt(Math.pow(120 - x, 2) + Math.pow(40 - y, 2));
  return toMetres(yd);
}

const ZONES = {
  "6yard":   { label: "6m Kutusu",    color: "#f59e0b", desc: "Kaleye 0–5.5m" },
  "box":     { label: "Ceza Sahası",  color: "#38bdf8", desc: "16.5m çizgisi içi" },
  "outside": { label: "Dışarıdan",    color: "#a78bfa", desc: "Ceza sahası dışı" },
};

export default function ShotZones({ playerId, competition }) {
  const [shots,   setShots]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/player/${playerId}/shots${competition ? `?turnuva=${encodeURIComponent(competition)}` : ""}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setShots(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [playerId, competition]);

  if (loading) return <Wrap><div style={st.empty}>Yükleniyor…</div></Wrap>;
  if (!shots.length) return <Wrap><div style={st.empty}>Şut verisi yok</div></Wrap>;

  // Bölge bazlı grupla
  const byZone = { "6yard": [], "box": [], "outside": [] };
  const dists  = [];

  shots.forEach(s => {
    const zone = classifyZone(s.x_konum, s.y_konum);
    byZone[zone].push(s);
    dists.push(distToGoal(s.x_konum, s.y_konum));
  });

  const total = shots.length;
  const totalGoals = shots.filter(s => s.gol_mu).length;
  const totalXg    = shots.reduce((a, s) => a + (s.xg ?? 0), 0);
  const avgDist    = dists.length ? (dists.reduce((a, b) => a + b, 0) / dists.length) : 0;

  // Mesafe grupları (metre): 0-6, 6-11, 11-16, 16-22, 22+
  const distBuckets = [
    { label: "0–6m",   range: [0,  6]   },
    { label: "6–11m",  range: [6,  11]  },
    { label: "11–16m", range: [11, 16]  },
    { label: "16–22m", range: [16, 22]  },
    { label: "22+m",   range: [22, 999] },
  ].map(b => {
    const inRange = shots.filter(s => {
      const d = distToGoal(s.x_konum, s.y_konum);
      return d >= b.range[0] && d < b.range[1];
    });
    return {
      ...b,
      count: inRange.length,
      goals: inRange.filter(s => s.gol_mu).length,
      xg:    inRange.reduce((a, s) => a + (s.xg ?? 0), 0),
    };
  });

  const maxBucket = Math.max(...distBuckets.map(b => b.count), 1);

  return (
    <Wrap>
      {/* Başlık */}
      <div style={st.header}>
        <span style={st.title}>🎯 Şut Bölgesi Analizi</span>
        <div style={st.headerStats}>
          <span style={st.hs}>{total} şut</span>
          <span style={st.hsDot}>·</span>
          <span style={{ ...st.hs, color: "#10b981" }}>{totalGoals} gol</span>
          <span style={st.hsDot}>·</span>
          <span style={{ ...st.hs, color: "#f59e0b" }}>ort. {avgDist.toFixed(1)}m</span>
        </div>
      </div>

      {/* Bölge kartları */}
      <div style={st.zonesRow}>
        {Object.entries(byZone).map(([key, arr]) => {
          const { label, color } = ZONES[key];
          const goals = arr.filter(s => s.gol_mu).length;
          const xg    = arr.reduce((a, s) => a + (s.xg ?? 0), 0);
          const pct   = total ? Math.round(arr.length / total * 100) : 0;
          const conv  = arr.length ? Math.round(goals / arr.length * 100) : 0;

          return (
            <div key={key} style={{ ...st.zoneCard, borderColor: color + "40" }}>
              <div style={{ ...st.zoneTop, borderBottom: `2px solid ${color}` }}>
                <span style={{ ...st.zoneLabel, color }}>{label}</span>
                <span style={{ ...st.zonePct, color }}>{pct}%</span>
              </div>
              <div style={st.zoneStat}>
                <span style={st.zoneCount}>{arr.length}</span>
                <span style={st.zoneStatLbl}>şut</span>
              </div>
              <div style={st.zoneMini}>
                <span style={st.zoneMiniItem}>⚽ {goals}</span>
                <span style={st.zoneMiniItem}>xG {xg.toFixed(2)}</span>
                <span style={st.zoneMiniItem}>%{conv} dön.</span>
              </div>
              {/* Zone fill bar */}
              <div style={st.zoneFillTrack}>
                <div style={{ ...st.zoneFill, width: `${pct}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Mesafe histogramı */}
      <div style={st.histSection}>
        <div style={st.histTitle}>Mesafe Dağılımı (metre)</div>
        <div style={st.histBars}>
          {distBuckets.map(b => {
            const pct  = Math.round(b.count / maxBucket * 100);
            const conv = b.count ? Math.round(b.goals / b.count * 100) : 0;
            const barColor = b.label === "0-6" ? "#f59e0b"
              : b.label === "6-12" ? "#38bdf8"
              : b.label === "12-18" ? "#a78bfa"
              : b.label === "18-24" ? "#6366f1"
              : "#334155";

            return (
              <div key={b.label} style={st.histBar}>
                <div style={st.histBarInner}>
                  <span style={{ ...st.histPct, color: b.count > 0 ? barColor : "#1e3a52" }}>
                    {b.count > 0 && `%${conv}`}
                  </span>
                  <div style={{ ...st.histFill, height: `${pct}%`, background: barColor }} />
                </div>
                <span style={st.histLabel}>{b.label}</span>
                <span style={st.histCount}>{b.count}</span>
              </div>
            );
          })}
        </div>
        <div style={st.histNote}>Her barın üstü dönüşüm oranı (%)</div>
      </div>

      {/* Ortalama xG özet */}
      <div style={st.footer}>
        <div style={st.footerItem}>
          <span style={st.footerVal}>{totalXg.toFixed(2)}</span>
          <span style={st.footerLbl}>Toplam xG</span>
        </div>
        <div style={st.footerItem}>
          <span style={{ ...st.footerVal, color: "#10b981" }}>
            {total > 0 ? (totalXg / total).toFixed(3) : "—"}
          </span>
          <span style={st.footerLbl}>Ortalama xG/şut</span>
        </div>
        <div style={st.footerItem}>
          <span style={{
            ...st.footerVal,
            color: totalGoals > totalXg ? "#10b981" : totalGoals < totalXg * 0.7 ? "#ef4444" : "#94a3b8",
          }}>
            {totalXg > 0 ? ((totalGoals / totalXg - 1) * 100).toFixed(0) : "0"}%
          </span>
          <span style={st.footerLbl}>xG üzeri/altı</span>
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
  title:      { color: "#0f172a", fontSize: 13, fontWeight: 700 },
  headerStats:{ display: "flex", alignItems: "center", gap: 6 },
  hs:         { color: "#94a3b8", fontSize: 11, fontWeight: 600 },
  hsDot:      { color: "#d1d5db" },

  zonesRow: { display: "flex", gap: 8, padding: "14px 14px 0" },
  zoneCard: {
    flex: 1, padding: "10px 12px 10px",
    background: "#fafafa",
    border: "1px solid", borderRadius: 10,
  },
  zoneTop:   { display: "flex", justifyContent: "space-between", paddingBottom: 8, marginBottom: 8 },
  zoneLabel: { fontSize: 11, fontWeight: 800, letterSpacing: ".04em" },
  zonePct:   { fontSize: 11, fontWeight: 700 },
  zoneStat:  { display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 },
  zoneCount: { fontSize: 22, fontWeight: 900, color: "#0f172a", lineHeight: 1 },
  zoneStatLbl: { color: "#94a3b8", fontSize: 10, fontWeight: 700 },
  zoneMini:  { display: "flex", flexDirection: "column", gap: 2, marginBottom: 8 },
  zoneMiniItem: { color: "#94a3b8", fontSize: 10 },
  zoneFillTrack: { height: 3, background: "#e8eef4", borderRadius: 2 },
  zoneFill:  { height: "100%", borderRadius: 2, transition: "width .6s ease" },

  histSection: { padding: "14px 16px 4px" },
  histTitle:   { color: "#94a3b8", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", marginBottom: 10 },
  histBars:    { display: "flex", gap: 6, alignItems: "flex-end", height: 80 },
  histBar:     { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", gap: 4 },
  histBarInner:{ flex: 1, width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" },
  histPct:     { fontSize: 9, fontWeight: 700, marginBottom: 3 },
  histFill:    { width: "100%", borderRadius: "3px 3px 0 0", minHeight: 3, transition: "height .6s ease" },
  histLabel:   { color: "#94a3b8", fontSize: 9, fontWeight: 600 },
  histCount:   { color: "#d1d5db", fontSize: 9 },
  histNote:    { color: "#d1d5db", fontSize: 9, textAlign: "right", marginTop: 4 },

  footer: {
    display: "flex", padding: "12px 16px",
    borderTop: "1px solid #f1f5f9",
    gap: 0,
  },
  footerItem: { flex: 1, display: "flex", flexDirection: "column", gap: 3, alignItems: "center" },
  footerVal:  { fontSize: 18, fontWeight: 900, color: "#38bdf8", lineHeight: 1 },
  footerLbl:  { fontSize: 9, color: "#94a3b8", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" },
  empty:      { color: "#94a3b8", fontSize: 13, padding: "30px 20px", textAlign: "center" },
};
