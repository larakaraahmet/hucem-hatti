/**
 * HomeAwaySplit — Oyuncunun ev sahibi vs deplasman performansını karşılaştırır.
 * Uluslararası maçlarda hangi ortamda daha iyi oynadığını gösterir.
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function safeDiv(a, b) { return b > 0 ? a / b : 0; }

function StatBar({ val, maxVal, color }) {
  const pct = maxVal > 0 ? Math.min(val / maxVal * 100, 100) : 0;
  return (
    <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
      <div style={{
        height: "100%", borderRadius: 3,
        width: `${pct}%`,
        background: color,
        transition: "width .6s ease",
      }} />
    </div>
  );
}

export default function HomeAwaySplit({ playerId, milliyet, competition }) {
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

  // Oyuncunun ev sahibi mi deplasman mı olduğunu belirle
  const nat = (milliyet || "").toLowerCase();
  const home  = matches.filter(m => m.ev_takim.toLowerCase() === nat);
  const away  = matches.filter(m => m.ev_takim.toLowerCase() !== nat);
  const neutral = home.length === 0 && away.length === 0;

  // Eğer milliyet eşleşmiyorsa (kulüp verisi gibi), kabaca böl
  const homeList = neutral ? matches.filter((_, i) => i % 2 === 0) : home;
  const awayList = neutral ? matches.filter((_, i) => i % 2 !== 0) : away;
  const isNeutral = neutral;

  function calc(list) {
    if (!list.length) return null;
    const n     = list.length;
    const gol   = list.reduce((a, m) => a + m.gol,   0);
    const asist = list.reduce((a, m) => a + m.asist, 0);
    const xg    = list.reduce((a, m) => a + (m.xg ?? 0), 0);
    const sut   = list.reduce((a, m) => a + m.sut,   0);
    const pp    = list.reduce((a, m) => a + (m.progressive_pass ?? 0), 0);
    const katkili = list.filter(m => m.gol > 0 || m.asist > 0).length;
    return {
      n, gol, asist, xg, sut, pp, katkili,
      gol90:   safeDiv(gol,   list.reduce((a, m) => a + (m.dakika ?? 90), 0) / 90),
      asist90: safeDiv(asist, list.reduce((a, m) => a + (m.dakika ?? 90), 0) / 90),
      xg90:    safeDiv(xg,    list.reduce((a, m) => a + (m.dakika ?? 90), 0) / 90),
      sut90:   safeDiv(sut,   list.reduce((a, m) => a + (m.dakika ?? 90), 0) / 90),
      katkiOran: safeDiv(katkili, n) * 100,
    };
  }

  const H = calc(homeList);
  const A = calc(awayList);
  if (!H || !A) return <Wrap><div style={st.empty}>Veri yetersiz</div></Wrap>;

  // Hangi taraf daha iyi?
  const diff = (key) => {
    const dif = H[key] - A[key];
    const abs = Math.abs(dif);
    if (abs < H[key] * 0.05) return { label: "Eşit", color: "#64748b" };
    return dif > 0
      ? { label: "Ev daha iyi", color: "#10b981" }
      : { label: "Dep. daha iyi", color: "#38bdf8" };
  };

  const ROWS = [
    { key: "gol90",   label: "Gol / 90",      fmt: v => v.toFixed(2), max: Math.max(H.gol90, A.gol90, 0.1)   },
    { key: "asist90", label: "Asist / 90",     fmt: v => v.toFixed(2), max: Math.max(H.asist90, A.asist90, 0.1) },
    { key: "xg90",    label: "xG / 90",        fmt: v => v.toFixed(2), max: Math.max(H.xg90, A.xg90, 0.1)     },
    { key: "sut90",   label: "Şut / 90",       fmt: v => v.toFixed(1), max: Math.max(H.sut90, A.sut90, 0.1)   },
    { key: "katkiOran",label: "Katkılı Maç %", fmt: v => v.toFixed(0)+"%", max: 100                           },
  ];

  const overallEdge = H.xg90 > A.xg90 * 1.1 ? "home"
                    : A.xg90 > H.xg90 * 1.1 ? "away"
                    : "even";

  return (
    <Wrap>
      {/* Başlık */}
      <div style={st.header}>
        <span style={st.title}>🏟️ Ev / Deplasman</span>
        {isNeutral && <span style={st.neutralNote}>* Tarafsız zemin (uluslararası)</span>}
        <div style={{
          ...st.edgeBadge,
          color:        overallEdge === "home" ? "#10b981" : overallEdge === "away" ? "#38bdf8" : "#f59e0b",
          borderColor:  overallEdge === "home" ? "rgba(16,185,129,.3)" : overallEdge === "away" ? "rgba(56,189,248,.3)" : "rgba(245,158,11,.3)",
          background:   overallEdge === "home" ? "rgba(16,185,129,.08)" : overallEdge === "away" ? "rgba(56,189,248,.08)" : "rgba(245,158,11,.08)",
        }}>
          {overallEdge === "home" ? "🏠 Ev Avantajı" : overallEdge === "away" ? "✈️ Deplasman Yıkıcı" : "⚖️ Dengeli"}
        </div>
      </div>

      {/* Sütun başlıkları */}
      <div style={st.colHeaders}>
        <div style={{ width: 130, flexShrink: 0 }} />
        <div style={{ ...st.colHead, color: "#10b981" }}>🏠 Ev ({H.n} maç)</div>
        <div style={{ ...st.colHead, color: "#38bdf8" }}>✈️ Deplasman ({A.n} maç)</div>
      </div>

      {/* Stat satırları */}
      <div style={st.rows}>
        {ROWS.map(({ key, label, fmt, max }) => {
          const hv = H[key], av = A[key];
          const edge = diff(key);
          const hBetter = hv >= av;
          return (
            <div key={key} style={st.row}>
              <div style={st.rowLabel}>
                <span style={st.metricLabel}>{label}</span>
                <span style={{ ...st.edgeLabel, color: edge.color }}>{edge.label}</span>
              </div>
              {/* Ev */}
              <div style={st.valCell}>
                <span style={{ ...st.val, color: hBetter ? "#10b981" : "#475569" }}>{fmt(hv)}</span>
                <StatBar val={hv} maxVal={max} color={hBetter ? "#10b981" : "#334155"} />
              </div>
              {/* Dep */}
              <div style={st.valCell}>
                <span style={{ ...st.val, color: !hBetter ? "#38bdf8" : "#475569" }}>{fmt(av)}</span>
                <StatBar val={av} maxVal={max} color={!hBetter ? "#38bdf8" : "#334155"} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Özet */}
      <div style={st.footer}>
        <div style={st.footItem}>
          <span style={{ ...st.footVal, color: "#10b981" }}>{H.gol}G {H.asist}A</span>
          <span style={st.footLbl}>Ev Toplam</span>
        </div>
        <div style={st.footDivider} />
        <div style={st.footItem}>
          <span style={{ ...st.footVal, color: "#38bdf8" }}>{A.gol}G {A.asist}A</span>
          <span style={st.footLbl}>Deplasman Toplam</span>
        </div>
        <div style={st.footDivider} />
        <div style={st.footItem}>
          <span style={{
            ...st.footVal,
            color: H.xg90 > A.xg90 ? "#10b981" : H.xg90 < A.xg90 ? "#38bdf8" : "#f59e0b",
          }}>
            {H.xg90 > A.xg90 ? "Ev'de ↑" : H.xg90 < A.xg90 ? "Dep.'da ↑" : "Eşit"}
          </span>
          <span style={st.footLbl}>xG Üstünlük</span>
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
  neutralNote: { color: "#d1d5db", fontSize: 10 },
  edgeBadge: { fontSize: 11, fontWeight: 700, padding: "3px 12px", borderRadius: 7, border: "1px solid" },

  colHeaders: { display: "flex", padding: "8px 16px 4px", gap: 12 },
  colHead: { flex: 1, fontSize: 10, fontWeight: 800, textAlign: "center", letterSpacing: ".04em" },

  rows: { display: "flex", flexDirection: "column" },
  row: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "8px 16px",
    borderTop: "1px solid #f1f5f9",
  },
  rowLabel: { width: 130, flexShrink: 0, display: "flex", flexDirection: "column", gap: 2 },
  metricLabel: { color: "#64748b", fontSize: 11, fontWeight: 600 },
  edgeLabel:   { fontSize: 9, fontWeight: 700 },

  valCell: { flex: 1, display: "flex", flexDirection: "column", gap: 4, alignItems: "center" },
  val:     { fontSize: 14, fontWeight: 800 },

  footer: {
    display: "flex", padding: "10px 16px",
    borderTop: "1px solid #f1f5f9",
  },
  footItem:    { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 },
  footVal:     { fontSize: 16, fontWeight: 900 },
  footLbl:     { fontSize: 9, color: "#94a3b8", fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" },
  footDivider: { width: 1, background: "#e8eef4", flexShrink: 0, margin: "4px 0" },
  empty: { color: "#94a3b8", fontSize: 13, padding: "30px 20px", textAlign: "center" },
};
