/**
 * PercentileBars — Oyuncunun 7 metriğini yatay çubuk grafiğiyle gösterir.
 * Renk: kırmızı (alt) → sarı (orta) → yeşil (üst).
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const METRICS = [
  { key: "xg90",        label: "xG / 90",          icon: "🎯", fmt: v => v.toFixed(2) },
  { key: "xa90",        label: "xA / 90",          icon: "🔑", fmt: v => v.toFixed(2) },
  { key: "gol90",       label: "Gol / 90",         icon: "⚽", fmt: v => v.toFixed(2) },
  { key: "asist90",     label: "Asist / 90",       icon: "🅰️", fmt: v => v.toFixed(2) },
  { key: "sut90",       label: "Şut / 90",         icon: "💥", fmt: v => v.toFixed(1) },
  { key: "isabetli90",  label: "İsabetli Şut / 90",icon: "🎳", fmt: v => v.toFixed(1) },
  { key: "prog_pass90", label: "İlerletici Pas / 90",icon:"➡️", fmt: v => v.toFixed(1) },
];

function percentileColor(p) {
  if (p >= 80) return { bg: "#10b981", glow: "rgba(16,185,129,0.35)" };
  if (p >= 60) return { bg: "#22c55e", glow: "rgba(34,197,94,0.25)" };
  if (p >= 40) return { bg: "#f59e0b", glow: "rgba(245,158,11,0.25)" };
  if (p >= 20) return { bg: "#f97316", glow: "rgba(249,115,22,0.25)" };
  return { bg: "#ef4444", glow: "rgba(239,68,68,0.25)" };
}

function percentileLabel(p) {
  if (p >= 90) return "Elit";
  if (p >= 75) return "Çok İyi";
  if (p >= 50) return "İyi";
  if (p >= 25) return "Orta";
  return "Düşük";
}

export default function PercentileBars({ playerId }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/player/${playerId}/percentiles`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [playerId]);

  if (loading) return <Wrap><div style={st.empty}>Yükleniyor…</div></Wrap>;
  if (!data)   return <Wrap><div style={st.empty}>Veri yok</div></Wrap>;

  const { per90, percentile } = data;

  return (
    <Wrap>
      {/* Başlık */}
      <div style={st.header}>
        <span style={st.title}>📊 Metrik Yüzdilimi</span>
        <span style={st.sub}>Pozisyona göre karşılaştırma</span>
      </div>

      {/* Barlar */}
      <div style={st.list}>
        {METRICS.map(({ key, label, icon, fmt }, i) => {
          const pct  = Math.round(percentile?.[key] ?? 0);
          const val  = per90?.[key] ?? 0;
          const { bg, glow } = percentileColor(pct);

          return (
            <div key={key} style={{
              ...st.row,
              borderTop: i > 0 ? "1px solid #f1f5f9" : "none",
            }}>
              {/* İkon + etiket */}
              <div style={st.labelCol}>
                <span style={st.icon}>{icon}</span>
                <span style={st.label}>{label}</span>
              </div>

              {/* Bar + yüzdelik */}
              <div style={st.barArea}>
                <div style={st.track}>
                  <div style={{
                    ...st.fill,
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${bg}99 0%, ${bg} 100%)`,
                    boxShadow: pct > 50 ? `0 0 10px ${glow}` : "none",
                  }} />
                </div>
                <span style={{ ...st.pct, color: bg }}>
                  {pct}<span style={{ fontSize: 9, opacity: 0.7 }}>%</span>
                </span>
              </div>

              {/* Değer + etiket */}
              <div style={st.valueCol}>
                <span style={{ ...st.value, color: bg }}>{fmt(val)}</span>
                <span style={{ ...st.rank, color: bg + "aa" }}>{percentileLabel(pct)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Renk lejandı */}
      <div style={st.legend}>
        {[
          { color: "#ef4444", label: "Alt %25" },
          { color: "#f59e0b", label: "Orta" },
          { color: "#22c55e", label: "Üst %25" },
          { color: "#10b981", label: "Elit %10" },
        ].map(({ color, label }) => (
          <div key={label} style={st.legendItem}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={st.legendLabel}>{label}</span>
          </div>
        ))}
      </div>
    </Wrap>
  );
}

function Wrap({ children }) {
  return (
    <div style={{
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: 16, overflow: "hidden",
      width: "100%",
    }}>
      {children}
    </div>
  );
}

const st = {
  header: {
    display: "flex", alignItems: "baseline", justifyContent: "space-between",
    padding: "16px 18px 14px",
    borderBottom: "1px solid #f1f5f9",
    background: "#fafafa",
  },
  title: { color: "#0f172a", fontSize: 13, fontWeight: 700 },
  sub:   { color: "#94a3b8", fontSize: 11 },

  list: { display: "flex", flexDirection: "column" },
  row: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "9px 16px",
  },
  labelCol: { display: "flex", alignItems: "center", gap: 6, width: 148, flexShrink: 0 },
  icon:     { fontSize: 13, width: 18, textAlign: "center" },
  label:    { color: "#64748b", fontSize: 11, fontWeight: 600 },

  barArea: { flex: 1, display: "flex", alignItems: "center", gap: 8 },
  track:   {
    flex: 1, height: 8,
    background: "#e8eef4",
    borderRadius: 4, overflow: "hidden",
  },
  fill: {
    height: "100%", borderRadius: 4,
    transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
    minWidth: 4,
  },
  pct: { fontSize: 12, fontWeight: 800, width: 36, textAlign: "right", flexShrink: 0 },

  valueCol: { display: "flex", flexDirection: "column", alignItems: "flex-end", width: 48, flexShrink: 0 },
  value:    { fontSize: 13, fontWeight: 800, lineHeight: 1 },
  rank:     { fontSize: 9,  fontWeight: 700, letterSpacing: "0.06em" },

  legend: {
    display: "flex", gap: 14, padding: "9px 16px",
    borderTop: "1px solid #f1f5f9",
    justifyContent: "flex-end",
  },
  legendItem:  { display: "flex", alignItems: "center", gap: 5 },
  legendLabel: { color: "#94a3b8", fontSize: 10, fontWeight: 600 },
  empty: { color: "#94a3b8", fontSize: 13, padding: "30px 20px", textAlign: "center" },
};
