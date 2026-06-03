/**
 * ShotQuality — Oyuncunun şutlarını xG kalite bandına göre dağıtır.
 * Düşük kaliteli (tapa) şutlardan yüksek kalitelilere profil çıkarır.
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const BUCKETS = [
  { id: "tap",    label: "0–0.05",  range: [0,    0.05],  color: "#94a3b8", tag: "Tapa"    },
  { id: "low",    label: "0.05–0.10",range:[0.05,  0.10],  color: "#6366f1", tag: "Düşük"  },
  { id: "mid",    label: "0.10–0.20",range:[0.10,  0.20],  color: "#38bdf8", tag: "Orta"   },
  { id: "good",   label: "0.20–0.35",range:[0.20,  0.35],  color: "#f59e0b", tag: "İyi"    },
  { id: "great",  label: "0.35+",   range: [0.35, 999],   color: "#10b981", tag: "Büyük"  },
];

export default function ShotQuality({ playerId, competition }) {
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

  // Bucket hesapla
  const buckets = BUCKETS.map(b => {
    const inRange = shots.filter(s => {
      const xg = s.xg ?? 0;
      return xg >= b.range[0] && xg < b.range[1];
    });
    return {
      ...b,
      count: inRange.length,
      goals: inRange.filter(s => s.gol_mu).length,
      xg:    inRange.reduce((a, s) => a + (s.xg ?? 0), 0),
    };
  });

  const total      = shots.length;
  const totalXg    = shots.reduce((a, s) => a + (s.xg ?? 0), 0);
  const totalGoals = shots.filter(s => s.gol_mu).length;
  const maxCount   = Math.max(...buckets.map(b => b.count), 1);

  // Ağırlıklı ortalama xG kalitesi (yüksek = daha iyi şut seçimi)
  const avgXg   = total > 0 ? totalXg / total : 0;
  const qualityLabel =
    avgXg >= 0.18 ? "Yüksek" : avgXg >= 0.12 ? "Orta" : "Düşük";
  const qualityColor =
    avgXg >= 0.18 ? "#10b981" : avgXg >= 0.12 ? "#f59e0b" : "#ef4444";

  return (
    <Wrap>
      {/* Başlık */}
      <div style={st.header}>
        <span style={st.title}>💎 Şut Kalitesi</span>
        <div style={st.pills}>
          <span style={{ ...st.pill, color: "#38bdf8", borderColor: "rgba(56,189,248,.25)", background: "rgba(56,189,248,.08)" }}>
            {total} şut
          </span>
          <span style={{ ...st.pill, color: qualityColor, borderColor: qualityColor + "40", background: qualityColor + "10" }}>
            ort. xG {avgXg.toFixed(3)}
          </span>
        </div>
      </div>

      {/* Kalite özeti */}
      <div style={st.summary}>
        <div style={st.sumItem}>
          <span style={{ ...st.sumVal, color: "#38bdf8" }}>{total}</span>
          <span style={st.sumLbl}>Toplam Şut</span>
        </div>
        <div style={st.sumItem}>
          <span style={{ ...st.sumVal, color: "#10b981" }}>{totalGoals}</span>
          <span style={st.sumLbl}>Gol</span>
        </div>
        <div style={st.sumItem}>
          <span style={{ ...st.sumVal, color: "#f59e0b" }}>{totalXg.toFixed(2)}</span>
          <span style={st.sumLbl}>Toplam xG</span>
        </div>
        <div style={st.sumItem}>
          <span style={{ ...st.sumVal, color: qualityColor }}>{qualityLabel}</span>
          <span style={st.sumLbl}>Şut Kalitesi</span>
        </div>
      </div>

      {/* Histogram barları */}
      <div style={st.histWrap}>
        {buckets.map(b => {
          const pctWidth = Math.round(b.count / maxCount * 100);
          const conv     = b.count ? Math.round(b.goals / b.count * 100) : 0;

          return (
            <div key={b.id} style={st.row}>
              {/* Etiket */}
              <div style={st.rowLeft}>
                <span style={{ ...st.bandTag, color: b.color, borderColor: b.color + "40", background: b.color + "12" }}>
                  {b.tag}
                </span>
                <span style={st.bandRange}>{b.label}</span>
              </div>

              {/* Bar */}
              <div style={st.barTrack}>
                <div style={{
                  ...st.barFill,
                  width: `${pctWidth}%`,
                  background: `linear-gradient(90deg, ${b.color}88 0%, ${b.color} 100%)`,
                  boxShadow: pctWidth > 40 ? `0 0 8px ${b.color}44` : "none",
                }} />
              </div>

              {/* Sayı + dönüşüm */}
              <div style={st.rowRight}>
                <span style={{ ...st.countVal, color: b.count > 0 ? "#e2e8f0" : "#1e3a52" }}>
                  {b.count}
                </span>
                {b.count > 0 && (
                  <span style={{ ...st.convVal, color: conv > 25 ? "#10b981" : conv > 10 ? "#f59e0b" : "#475569" }}>
                    %{conv}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Gösterim performansı */}
      <div style={st.footer}>
        <div style={st.footerInner}>
          <span style={st.footerLabel}>xG Performansı</span>
          <span style={{
            ...st.footerValue,
            color: totalGoals > totalXg ? "#10b981" : totalGoals < totalXg * 0.7 ? "#ef4444" : "#94a3b8",
          }}>
            {totalXg > 0
              ? `${totalGoals > totalXg ? "+" : ""}${((totalGoals / totalXg - 1) * 100).toFixed(0)}%`
              : "—"
            }
          </span>
          <span style={st.footerSub}>
            {totalGoals > totalXg ? "Beklentinin üzerinde" : totalGoals < totalXg * 0.7 ? "Beklentinin altında" : "Beklenti doğrultusunda"}
          </span>
        </div>
        <div style={st.footerDivider} />
        <div style={st.footerInner}>
          <span style={st.footerLabel}>İsabetli Şut Oranı</span>
          <span style={{ ...st.footerValue, color: "#a78bfa" }}>
            {total > 0 ? `%${Math.round(totalGoals / total * 100 + (totalXg / total * 100))}` : "—"}
          </span>
          <span style={st.footerSub}>gol + xG karma</span>
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
  pills: { display: "flex", gap: 6 },
  pill: {
    fontSize: 10, fontWeight: 700, padding: "2px 9px",
    borderRadius: 5, border: "1px solid",
  },

  summary: { display: "flex", borderBottom: "1px solid #f1f5f9" },
  sumItem: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0", gap: 3 },
  sumVal:  { fontSize: 20, fontWeight: 900, color: "#38bdf8", lineHeight: 1 },
  sumLbl:  { fontSize: 9, color: "#94a3b8", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" },

  histWrap: { padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 },

  row: { display: "flex", alignItems: "center", gap: 10 },
  rowLeft: { display: "flex", alignItems: "center", gap: 6, width: 120, flexShrink: 0 },
  bandTag: {
    fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 4,
    border: "1px solid", letterSpacing: ".05em",
  },
  bandRange: { color: "#94a3b8", fontSize: 9, fontWeight: 600 },

  barTrack: {
    flex: 1, height: 10,
    background: "#e8eef4",
    borderRadius: 5, overflow: "hidden",
  },
  barFill: {
    height: "100%", borderRadius: 5,
    transition: "width .6s cubic-bezier(.4,0,.2,1)",
    minWidth: 3,
  },

  rowRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", width: 42, flexShrink: 0, gap: 1 },
  countVal: { fontSize: 13, fontWeight: 800, lineHeight: 1 },
  convVal:  { fontSize: 9, fontWeight: 700 },

  footer: {
    display: "flex", alignItems: "stretch",
    padding: "10px 16px",
    borderTop: "1px solid #f1f5f9",
    gap: 0,
  },
  footerInner:  { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "0 8px" },
  footerLabel:  { color: "#94a3b8", fontSize: 9, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" },
  footerValue:  { fontSize: 20, fontWeight: 900, lineHeight: 1 },
  footerSub:    { color: "#d1d5db", fontSize: 9, textAlign: "center" },
  footerDivider:{ width: 1, background: "#e8eef4", flexShrink: 0, margin: "4px 0" },

  empty: { color: "#94a3b8", fontSize: 13, padding: "30px 20px", textAlign: "center" },
};
