/**
 * BettingPanel — İddaa ve bahis tahmini için olasılık göstergesi.
 * Oyuncu için gol, asist, şut prop bet ihtimalleri hesaplar.
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// Güven rengi
function confColor(pct) {
  if (pct >= 65) return "#10b981";
  if (pct >= 45) return "#f59e0b";
  if (pct >= 30) return "#f97316";
  return "#ef4444";
}

// Bahis tavsiyesi
function betAdvice(pct) {
  if (pct >= 70) return { label: "Güçlü Oyna", bg: "rgba(16,185,129,.15)", border: "rgba(16,185,129,.35)", color: "#10b981" };
  if (pct >= 55) return { label: "Oyna",        bg: "rgba(245,158,11,.12)", border: "rgba(245,158,11,.3)",  color: "#f59e0b" };
  if (pct >= 40) return { label: "Riskli",       bg: "rgba(249,115,22,.1)",  border: "rgba(249,115,22,.28)", color: "#f97316" };
  return              { label: "Geç",           bg: "rgba(239,68,68,.1)",   border: "rgba(239,68,68,.28)",  color: "#ef4444" };
}

// Poisson olasılığı — P(X >= 1 | lambda)
function poissonAtLeastOne(lambda) {
  if (lambda <= 0) return 0;
  return (1 - Math.exp(-lambda)) * 100;
}

export default function BettingPanel({ playerId, competition }) {
  const [matches, setMatches] = useState([]);
  const [shots,   setShots]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/player/${playerId}/matches${competition ? `?turnuva=${encodeURIComponent(competition)}` : ""}`).then(r => r.ok ? r.json() : []),
      fetch(`${API_BASE}/player/${playerId}/shots`).then(r => r.ok ? r.json() : []),
    ])
    .then(([m, s]) => { setMatches(m); setShots(s); setLoading(false); })
    .catch(() => setLoading(false));
  }, [playerId, competition]);

  if (loading) return <Wrap><div style={st.empty}>Yükleniyor…</div></Wrap>;
  if (!matches.length) return <Wrap><div style={st.empty}>Yeterli veri yok</div></Wrap>;

  const n    = matches.length;
  const n5   = Math.min(5, n);
  const last5 = matches.slice(0, n5);

  // ── Temel istatistikler ──────────────────────────────────────
  const totalG   = matches.reduce((a, m) => a + m.gol,   0);
  const totalA   = matches.reduce((a, m) => a + m.asist, 0);
  const totalS   = matches.reduce((a, m) => a + m.sut,   0);
  const totalXg  = matches.reduce((a, m) => a + (m.xg ?? 0), 0);

  const totalG5  = last5.reduce((a, m) => a + m.gol,   0);
  const totalA5  = last5.reduce((a, m) => a + m.asist, 0);
  const totalS5  = last5.reduce((a, m) => a + m.sut,   0);
  const totalXg5 = last5.reduce((a, m) => a + (m.xg ?? 0), 0);

  // Ortalamalar (per-match)
  const avgG   = totalG  / n;
  const avgA   = totalA  / n;
  const avgS   = totalS  / n;
  const avgXg  = totalXg / n;
  const avgG5  = totalG5  / n5;
  const avgA5  = totalA5  / n5;
  const avgS5  = totalS5  / n5;
  const avgXg5 = totalXg5 / n5;

  // Form trendi için ağırlıklı ortalama (son 5 maç 60%, genel 40%)
  const weightedXg = avgXg5 * 0.6 + avgXg * 0.4;
  const weightedS  = avgS5  * 0.6 + avgS  * 0.4;
  const weightedA  = avgA5  * 0.6 + avgA  * 0.4;

  // ── Olasılıklar ──────────────────────────────────────────────
  // Poisson tabanlı "en az 1 gol" ihtimali
  const pGoal   = Math.round(poissonAtLeastOne(weightedXg));
  // Simple rate tabanlı asist ihtimali (xA varsa kullan)
  const pAssist = Math.round(Math.min(poissonAtLeastOne(weightedA), 95));
  // Şut prop bets
  const p1shot  = Math.round(Math.min(100 - Math.exp(-weightedS) * 100, 99));
  const p2shot  = Math.round(Math.min(poissonAtLeastOne(weightedS - 0.8) * (weightedS > 1 ? 1 : 0.5), 95));
  const p3shot  = Math.round(Math.min(poissonAtLeastOne(weightedS - 1.5) * (weightedS > 1.5 ? 0.85 : 0.3), 90));
  // G+A kombinasyonu
  const pGA     = Math.min(pGoal + pAssist - Math.round(pGoal * pAssist / 100), 95);
  // Anytime scorer (geçmiş oran + Poisson ortalaması)
  const histRate = matches.filter(m => m.gol > 0).length / n * 100;
  const pAnytime = Math.round((histRate * 0.45 + pGoal * 0.55));

  // Form durumu
  const formMult = avgXg5 / (avgXg > 0 ? avgXg : 1);
  const formState = formMult >= 1.25 ? { label: "🔥 Sıcak Form", color: "#10b981", bg: "rgba(16,185,129,.1)" }
                 : formMult <= 0.65  ? { label: "❄️ Soğuk Form",  color: "#38bdf8", bg: "rgba(56,189,248,.08)" }
                 :                     { label: "⚖️ Normal Form", color: "#f59e0b", bg: "rgba(245,158,11,.08)" };

  // ── Kart verileri ─────────────────────────────────────────────
  const mainBets = [
    { id: "anytime",   label: "Anytime Gol Atar",    pct: pAnytime, sub: `${totalG} gol / ${n} maç` },
    { id: "assist",    label: "Asist Yapar",          pct: pAssist,  sub: `${totalA} asist / ${n} maç` },
    { id: "ga",        label: "Gol Veya Asist (G/A)", pct: pGA,      sub: `son 5: ${totalG5}G ${totalA5}A` },
  ];

  const shotBets = [
    { id: "s1", label: "1+ Şut",  pct: p1shot, sub: `ort. ${avgS.toFixed(1)} şut/maç` },
    { id: "s2", label: "2+ Şut",  pct: p2shot, sub: `son5 ort. ${avgS5.toFixed(1)}` },
    { id: "s3", label: "3+ Şut",  pct: p3shot, sub: `max: ${Math.max(...matches.map(m=>m.sut))} şut` },
  ];

  return (
    <Wrap>
      {/* Başlık */}
      <div style={st.header}>
        <span style={st.title}>💰 Bahis Analizi</span>
        <div style={{ ...st.formBadge, background: formState.bg, borderColor: formState.color + "40" }}>
          <span style={{ color: formState.color, fontSize: 11, fontWeight: 800 }}>{formState.label}</span>
        </div>
      </div>

      {/* Özet metrikler */}
      <div style={st.summary}>
        {[
          { l: "Tahmini xG/Maç", v: weightedXg.toFixed(2), c: "#f59e0b" },
          { l: "Ort. Şut/Maç",   v: weightedS.toFixed(1),  c: "#38bdf8" },
          { l: "Son 5 xG",       v: totalXg5.toFixed(2),   c: "#10b981" },
          { l: "Genel Dönüşüm",  v: avgXg > 0 ? `%${Math.round(totalG / (totalXg || 1) * 100)}` : "—", c: "#a78bfa" },
        ].map(({ l, v, c }) => (
          <div key={l} style={st.sumItem}>
            <span style={{ ...st.sumVal, color: c }}>{v}</span>
            <span style={st.sumLbl}>{l}</span>
          </div>
        ))}
      </div>

      {/* Ana bahis kartları */}
      <div style={st.section}>
        <div style={st.sectionTitle}>GOL & KATKI BAHİSLERİ</div>
        <div style={st.cards}>
          {mainBets.map(b => {
            const adv = betAdvice(b.pct);
            return (
              <div key={b.id} style={{ ...st.card, borderColor: adv.border, background: adv.bg }}>
                <div style={st.cardTop}>
                  <span style={st.cardLabel}>{b.label}</span>
                  <span style={{ ...st.advBadge, color: adv.color, borderColor: adv.border, background: adv.bg }}>
                    {adv.label}
                  </span>
                </div>
                {/* İhtimal barı */}
                <div style={st.barTrack}>
                  <div style={{
                    ...st.barFill,
                    width: `${b.pct}%`,
                    background: `linear-gradient(90deg, ${adv.color}88, ${adv.color})`,
                    boxShadow: b.pct > 55 ? `0 0 8px ${adv.color}44` : "none",
                  }} />
                  {/* 50% çizgisi */}
                  <div style={st.halfLine} title="50%" />
                </div>
                <div style={st.cardBottom}>
                  <span style={{ ...st.pctBig, color: adv.color }}>{b.pct}%</span>
                  <span style={st.subText}>{b.sub}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Şut prop bets */}
      <div style={{ ...st.section, paddingTop: 0 }}>
        <div style={st.sectionTitle}>ŞUT PROP BAHİSLERİ</div>
        <div style={st.shotRow}>
          {shotBets.map(b => {
            const adv = betAdvice(b.pct);
            return (
              <div key={b.id} style={{ ...st.shotCard, borderColor: adv.border, background: adv.bg }}>
                <div style={st.shotTop}>
                  <span style={{ ...st.pctMid, color: adv.color }}>{b.pct}%</span>
                  <span style={{ ...st.advMini, color: adv.color }}>{adv.label}</span>
                </div>
                <div style={st.shotBarTrack}>
                  <div style={{ ...st.shotBarFill, height: `${b.pct}%`, background: adv.color }} />
                </div>
                <span style={st.shotLabel}>{b.label}</span>
                <span style={st.shotSub}>{b.sub}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Uyarı notu */}
      <div style={st.note}>
        ⚠️ Bu tahminler istatistiksel olasılıklara dayalıdır. Kesin sonuç garantisi vermez.
        Son {n} maç verisi kullanılmıştır.
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
  formBadge: {
    padding: "4px 12px", borderRadius: 8, border: "1px solid",
  },

  summary: { display: "flex", borderBottom: "1px solid #f1f5f9" },
  sumItem: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0", gap: 3 },
  sumVal:  { fontSize: 18, fontWeight: 900, lineHeight: 1 },
  sumLbl:  { fontSize: 8, color: "#94a3b8", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", textAlign: "center" },

  section:      { padding: "12px 14px 8px" },
  sectionTitle: { color: "#94a3b8", fontSize: 9, fontWeight: 800, letterSpacing: ".1em", marginBottom: 10 },

  cards: { display: "flex", flexDirection: "column", gap: 8 },
  card: {
    padding: "10px 14px", borderRadius: 10, border: "1px solid",
  },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  cardLabel: { color: "#0f172a", fontSize: 12, fontWeight: 700 },
  advBadge: {
    fontSize: 9, fontWeight: 800, padding: "2px 9px",
    borderRadius: 5, border: "1px solid", letterSpacing: ".06em",
  },
  barTrack: {
    height: 8, background: "#e2e8f0",
    borderRadius: 4, overflow: "hidden", position: "relative", marginBottom: 8,
  },
  barFill: {
    height: "100%", borderRadius: 4,
    transition: "width .7s cubic-bezier(.4,0,.2,1)", minWidth: 4,
  },
  halfLine: {
    position: "absolute", top: 0, bottom: 0,
    left: "50%", width: 1,
    background: "rgba(255,255,255,0.15)",
  },
  cardBottom: { display: "flex", alignItems: "baseline", gap: 10 },
  pctBig: { fontSize: 22, fontWeight: 900, lineHeight: 1 },
  subText: { color: "#94a3b8", fontSize: 10 },

  shotRow: { display: "flex", gap: 8 },
  shotCard: {
    flex: 1, padding: "10px 10px 8px",
    borderRadius: 10, border: "1px solid",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
  },
  shotTop:     { display: "flex", flexDirection: "column", alignItems: "center", gap: 1 },
  pctMid:      { fontSize: 20, fontWeight: 900, lineHeight: 1 },
  advMini:     { fontSize: 8, fontWeight: 800, letterSpacing: ".06em" },
  shotBarTrack:{ width: "55%", height: 36, background: "#e8eef4", borderRadius: 3, display: "flex", alignItems: "flex-end", overflow: "hidden" },
  shotBarFill: { width: "100%", borderRadius: "3px 3px 0 0", transition: "height .7s ease" },
  shotLabel:   { color: "#64748b", fontSize: 10, fontWeight: 700, textAlign: "center" },
  shotSub:     { color: "#94a3b8", fontSize: 8, textAlign: "center" },

  note: {
    padding: "8px 16px 10px",
    borderTop: "1px solid #f1f5f9",
    color: "#d1d5db", fontSize: 9, lineHeight: 1.5,
  },
  empty: { color: "#94a3b8", fontSize: 13, padding: "30px 20px", textAlign: "center" },
};
