/**
 * SeasonProgression — Turnuva/sezon bazında performans karşılaştırması.
 * Oyuncunun farklı liglerde / turnuvalarda nasıl oynadığını gösterir.
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const COMP_COLORS = {
  "FIFA World Cup":    "#f59e0b",
  "UEFA Euro":        "#38bdf8",
  "Copa América":     "#a78bfa",
  "La Liga":          "#ef4444",
  "Ligue 1":          "#3b82f6",
  "Bundesliga":       "#dc2626",
  "Champions League": "#fbbf24",
  "Serie A":          "#10b981",
  "Premier League":   "#8b5cf6",
};

function compColor(name) {
  for (const [k, v] of Object.entries(COMP_COLORS))
    if (name?.includes(k)) return v;
  return "#64748b";
}

function compIcon(name) {
  if (!name) return "🏟️";
  if (name.includes("World Cup"))       return "🌍";
  if (name.includes("Euro"))            return "⭐";
  if (name.includes("Copa"))            return "🌟";
  if (name.includes("Champions"))       return "🏆";
  if (name.includes("La Liga"))         return "🇪🇸";
  if (name.includes("Ligue"))           return "🇫🇷";
  if (name.includes("Bundesliga"))      return "🇩🇪";
  if (name.includes("Premier"))         return "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
  if (name.includes("Serie"))           return "🇮🇹";
  return "🏟️";
}

export default function SeasonProgression({ playerId }) {
  const [comps, setComps]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState("xg"); // xg | gol | asist | ga

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/player/${playerId}/competition-stats`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setComps(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [playerId]);

  if (loading) return <Wrap><div style={st.empty}>Yükleniyor…</div></Wrap>;
  if (!comps.length) return <Wrap><div style={st.empty}>Veri yok</div></Wrap>;

  const METRICS = [
    { id: "xg",    label: "xG",       getValue: c => c.dakika > 0 ? c.xg / c.dakika * 90 : 0, fmt: v => v.toFixed(2), suffix: "/90" },
    { id: "gol",   label: "Gol",      getValue: c => c.dakika > 0 ? c.gol / c.dakika * 90 : 0, fmt: v => v.toFixed(2), suffix: "/90" },
    { id: "asist", label: "Asist",    getValue: c => c.dakika > 0 ? c.asist / c.dakika * 90 : 0, fmt: v => v.toFixed(2), suffix: "/90" },
    { id: "ga",    label: "G+A",      getValue: c => c.dakika > 0 ? (c.gol + c.asist) / c.dakika * 90 : 0, fmt: v => v.toFixed(2), suffix: "/90" },
    { id: "mac",   label: "Maç",      getValue: c => c.mac_sayisi, fmt: v => v.toFixed(0), suffix: " maç" },
  ];

  const activeMetric = METRICS.find(m => m.id === metric) || METRICS[0];
  const values = comps.map(c => activeMetric.getValue(c));
  const maxVal = Math.max(...values, 0.01);

  return (
    <Wrap>
      <div style={st.header}>
        <span style={st.title}>📊 Turnuva Karşılaştırması</span>
        <div style={st.metricTabs}>
          {METRICS.map(m => (
            <button key={m.id} onClick={() => setMetric(m.id)} style={{
              ...st.tab,
              ...(metric === m.id ? st.tabActive : {}),
            }}>{m.label}</button>
          ))}
        </div>
      </div>

      <div style={st.list}>
        {comps.map((c, i) => {
          const val   = activeMetric.getValue(c);
          const pct   = Math.round(val / maxVal * 100);
          const color = compColor(c.turnuva);
          const isBest = val === maxVal;

          return (
            <div key={c.turnuva} style={{
              ...st.row,
              borderTop: i > 0 ? "1px solid #f1f5f9" : "none",
              background: isBest ? color + "08" : "transparent",
            }}>
              {/* İkon + isim */}
              <div style={{ ...st.compIcon, background: color + "15", border: `1px solid ${color}30` }}>
                <span style={{ fontSize: 14 }}>{compIcon(c.turnuva)}</span>
              </div>

              <div style={st.compInfo}>
                <span style={{ ...st.compName, color: isBest ? color : "#94a3b8" }}>
                  {c.turnuva}
                </span>
                <span style={st.compMeta}>
                  {c.mac_sayisi} maç · {c.gol}G {c.asist}A · {Math.round(c.dakika)}dk
                </span>
              </div>

              {/* Bar */}
              <div style={st.barArea}>
                <div style={st.barTrack}>
                  <div style={{
                    ...st.barFill,
                    width: `${pct}%`,
                    background: color,
                  }} />
                </div>
                <span style={{ ...st.barVal, color }}>
                  {activeMetric.fmt(val)}{activeMetric.suffix}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Özet grid */}
      <div style={st.footer}>
        <div style={st.footItem}>
          <span style={{ ...st.footVal, color: "#f59e0b" }}>{comps.length}</span>
          <span style={st.footLabel}>Turnuva</span>
        </div>
        <div style={st.footItem}>
          <span style={{ ...st.footVal, color: "#38bdf8" }}>
            {comps.reduce((a, c) => a + c.mac_sayisi, 0)}
          </span>
          <span style={st.footLabel}>Toplam Maç</span>
        </div>
        <div style={st.footItem}>
          <span style={{ ...st.footVal, color: "#22c55e" }}>
            {comps.reduce((a, c) => a + c.gol, 0)}G {comps.reduce((a, c) => a + c.asist, 0)}A
          </span>
          <span style={st.footLabel}>Toplam G+A</span>
        </div>
        <div style={st.footItem}>
          <span style={{ ...st.footVal, color: "#a78bfa" }}>
            {comps.reduce((a, c) => a + c.xg, 0).toFixed(1)}
          </span>
          <span style={st.footLabel}>Toplam xG</span>
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
    display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
    padding: "14px 18px 12px",
    borderBottom: "1px solid #f1f5f9",
    background: "#fafafa",
  },
  title: { color: "#0f172a", fontSize: 13, fontWeight: 700 },
  metricTabs: { display: "flex", gap: 4 },
  tab: {
    background: "transparent", border: "1px solid rgba(255,255,255,.08)",
    borderRadius: 6, color: "#94a3b8", cursor: "pointer",
    fontSize: 10, fontWeight: 700, padding: "3px 8px",
    transition: "all .15s",
  },
  tabActive: {
    background: "rgba(245,158,11,.1)", borderColor: "rgba(245,158,11,.3)",
    color: "#f59e0b",
  },

  list: { display: "flex", flexDirection: "column" },
  row:  { display: "flex", alignItems: "center", gap: 10, padding: "10px 16px" },

  compIcon: {
    width: 32, height: 32, borderRadius: 8,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  compInfo: { flex: 1, minWidth: 0 },
  compName: { display: "block", fontSize: 11, fontWeight: 700, lineHeight: 1.3 },
  compMeta: { color: "#94a3b8", fontSize: 9 },

  barArea:  { display: "flex", alignItems: "center", gap: 8, width: 130, flexShrink: 0 },
  barTrack: { flex: 1, height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" },
  barFill:  { height: "100%", borderRadius: 3, transition: "width .5s ease", minWidth: 3 },
  barVal:   { fontSize: 11, fontWeight: 800, width: 46, textAlign: "right" },

  footer: { display: "flex", borderTop: "1px solid #f1f5f9" },
  footItem:  { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 4px", gap: 2 },
  footVal:   { fontSize: 18, fontWeight: 900, lineHeight: 1 },
  footLabel: { fontSize: 8, color: "#94a3b8", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" },

  empty: { color: "#94a3b8", fontSize: 13, padding: "30px 20px", textAlign: "center" },
};
