/**
 * FormStrip — Son 10 maçın form şeridi, güncel seri ve form puanı.
 * Bahis için en hızlı okunabilir gösterge.
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
function shortDate(d) {
  if (!d) return "";
  const [, m, day] = d.split("-");
  return `${parseInt(day)} ${MONTHS[parseInt(m)-1]}`;
}

// Maç sonucunu sınıflandır
function classify(m) {
  if (m.gol > 0 && m.asist > 0) return "ga";   // gol + asist
  if (m.gol > 0)                  return "g";    // sadece gol
  if (m.asist > 0)                return "a";    // sadece asist
  if ((m.xg ?? 0) >= 0.25)        return "xg";  // xG var ama gol yok
  return "none";
}

const BOX = {
  ga:   { bg: "#10b981", border: "#059669", label: "G+A",  emoji: "⭐" },
  g:    { bg: "#22c55e", border: "#16a34a", label: "GOL",  emoji: "⚽" },
  a:    { bg: "#38bdf8", border: "#0284c7", label: "ASİST",emoji: "🅰️" },
  xg:   { bg: "#f59e0b", border: "#d97706", label: "xG",   emoji: "🎯" },
  none: { bg: "#1e293b", border: "#334155", label: "—",    emoji: "·" },
};

// Form puanı (son 5 maç)
function formScore(last5) {
  const score = last5.reduce((s, m) => {
    const c = classify(m);
    return s + (c === "ga" ? 4 : c === "g" ? 3 : c === "a" ? 2 : c === "xg" ? 1 : 0);
  }, 0);
  const max = last5.length * 4;
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.75) return { label: "Çok İyi",  color: "#10b981", grade: "A" };
  if (pct >= 0.50) return { label: "İyi",       color: "#22c55e", grade: "B" };
  if (pct >= 0.30) return { label: "Orta",      color: "#f59e0b", grade: "C" };
  if (pct >= 0.15) return { label: "Zayıf",     color: "#f97316", grade: "D" };
  return               { label: "Kötü",        color: "#ef4444", grade: "F" };
}

export default function FormStrip({ playerId, competition }) {
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

  const last10 = matches.slice(0, 10);
  const last5  = matches.slice(0, 5);
  const form   = formScore(last5);

  // Güncel seri hesapla (en son maçtan geriye)
  let streak = 0, streakType = "";
  for (const m of matches) {
    const hasG = m.gol > 0, hasA = m.asist > 0;
    const active = hasG || hasA;
    if (streak === 0) {
      streakType = active ? "active" : "dry";
      streak = 1;
    } else if ((streakType === "active" && active) || (streakType === "dry" && !active)) {
      streak++;
    } else break;
  }

  // Son 5 vs genel karşılaştırma
  const overall5G   = last5.filter(m => m.gol   > 0).length;
  const overall5A   = last5.filter(m => m.asist > 0).length;
  const overallG    = matches.filter(m => m.gol   > 0).length;
  const overallA    = matches.filter(m => m.asist > 0).length;
  const rateG5      = last5.length  > 0 ? overall5G / last5.length   : 0;
  const rateGAll    = matches.length > 0 ? overallG  / matches.length : 0;
  const trend       = rateG5 > rateGAll * 1.2 ? "↑" : rateG5 < rateGAll * 0.7 ? "↓" : "→";
  const trendColor  = trend === "↑" ? "#10b981" : trend === "↓" ? "#ef4444" : "#f59e0b";

  return (
    <Wrap>
      {/* Başlık */}
      <div style={st.header}>
        <span style={st.title}>📋 Son Form</span>
        <div style={st.headerRight}>
          <div style={{ ...st.gradeBadge, borderColor: form.color + "55", background: form.color + "15" }}>
            <span style={{ ...st.gradeVal, color: form.color }}>{form.grade}</span>
            <span style={{ ...st.gradeLabel, color: form.color + "cc" }}>{form.label}</span>
          </div>
        </div>
      </div>

      {/* Form şeridi — son 10 maç */}
      <div style={st.stripWrap}>
        <div style={st.stripLabel}>SON 10 MAÇ</div>
        <div style={st.strip}>
          {last10.map((m, i) => {
            const cls = classify(m);
            const box = BOX[cls];
            const isRecent = i < 5;
            return (
              <div key={m.mac_id}
                title={`${shortDate(m.tarih)} — ${box.label}${m.gol > 0 ? ` (${m.gol} gol)` : ""}${m.asist > 0 ? ` (${m.asist} ast)` : ""}`}
                style={{
                  ...st.box,
                  background: box.bg + (isRecent ? "ff" : "77"),
                  border: `1px solid ${box.border + (isRecent ? "99" : "44")}`,
                  boxShadow: isRecent && cls !== "none" ? `0 0 8px ${box.bg}55` : "none",
                  transform: i === 0 ? "scale(1.12)" : "none",
                }}>
                <span style={{ fontSize: i === 0 ? 13 : 11, lineHeight: 1 }}>{box.emoji}</span>
              </div>
            );
          })}
        </div>
        <div style={st.timeArrow}>← daha eski &nbsp;&nbsp;&nbsp; daha yeni →</div>
      </div>

      {/* Seri + trend */}
      <div style={st.midRow}>
        {/* Güncel seri */}
        <div style={st.streakBox}>
          <span style={st.streakLabel}>GÜNCEL SERİ</span>
          <div style={st.streakVal}>
            <span style={{
              ...st.streakNum,
              color: streakType === "active" ? "#10b981" : "#ef4444",
            }}>{streak}</span>
            <span style={st.streakText}>
              {streakType === "active"
                ? `maç üst üste\nkatkılı`
                : `maç üst üste\ngolsüz/asistsiz`}
            </span>
          </div>
        </div>

        <div style={st.midDivider} />

        {/* Trend */}
        <div style={st.trendBox}>
          <span style={st.streakLabel}>TREND</span>
          <div style={st.trendRow}>
            <span style={{ ...st.trendArrow, color: trendColor }}>{trend}</span>
            <div style={st.trendStats}>
              <span style={st.trendStat}>Son 5: {overall5G}G {overall5A}A</span>
              <span style={st.trendStat}>Genel: %{Math.round(rateGAll * 100)} gol/maç</span>
            </div>
          </div>
        </div>

        <div style={st.midDivider} />

        {/* Oran */}
        <div style={st.trendBox}>
          <span style={st.streakLabel}>SON 5 ORAN</span>
          <div style={st.trendRow}>
            <span style={{
              ...st.trendArrow, fontSize: 22,
              color: rateG5 >= 0.6 ? "#10b981" : rateG5 >= 0.3 ? "#f59e0b" : "#ef4444",
            }}>%{Math.round(rateG5 * 100)}</span>
            <div style={st.trendStats}>
              <span style={st.trendStat}>gol oranı</span>
              <span style={st.trendStat}>5 maçta {overall5G} gol</span>
            </div>
          </div>
        </div>
      </div>

      {/* Lejand */}
      <div style={st.legend}>
        {Object.entries(BOX).filter(([k]) => k !== "none").map(([k, v]) => (
          <div key={k} style={st.legItem}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: v.bg, flexShrink: 0 }} />
            <span style={st.legLabel}>{v.label}</span>
          </div>
        ))}
        <div style={st.legItem}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: BOX.none.bg, border: `1px solid ${BOX.none.border}` }} />
          <span style={st.legLabel}>Katkısız</span>
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
  headerRight: { display: "flex", gap: 8, alignItems: "center" },
  gradeBadge: {
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "4px 14px", borderRadius: 8, border: "1px solid",
    gap: 1,
  },
  gradeVal:   { fontSize: 18, fontWeight: 900, lineHeight: 1 },
  gradeLabel: { fontSize: 8,  fontWeight: 800, letterSpacing: ".1em" },

  stripWrap:  { padding: "12px 16px 4px" },
  stripLabel: { color: "#94a3b8", fontSize: 9, fontWeight: 700, letterSpacing: ".1em", marginBottom: 8 },
  strip:      { display: "flex", gap: 5, alignItems: "center" },
  box: {
    width: 34, height: 34, borderRadius: 7,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "default", transition: "transform .15s",
    flexShrink: 0,
  },
  timeArrow: {
    color: "#d1d5db", fontSize: 8, fontWeight: 600,
    marginTop: 6, letterSpacing: ".04em",
  },

  midRow: {
    display: "flex", alignItems: "stretch",
    borderTop: "1px solid #f1f5f9",
    borderBottom: "1px solid #f1f5f9",
    margin: "8px 0 0",
  },
  streakBox: { flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 },
  streakLabel: { color: "#94a3b8", fontSize: 8, fontWeight: 800, letterSpacing: ".1em" },
  streakVal: { display: "flex", alignItems: "baseline", gap: 8 },
  streakNum: { fontSize: 32, fontWeight: 900, lineHeight: 1 },
  streakText: { color: "#94a3b8", fontSize: 10, fontWeight: 600, whiteSpace: "pre-line", lineHeight: 1.4 },

  midDivider: { width: 1, background: "#f1f5f9", flexShrink: 0, margin: "8px 0" },

  trendBox:   { flex: 1, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 },
  trendRow:   { display: "flex", alignItems: "center", gap: 10 },
  trendArrow: { fontSize: 28, fontWeight: 900, lineHeight: 1 },
  trendStats: { display: "flex", flexDirection: "column", gap: 3 },
  trendStat:  { color: "#94a3b8", fontSize: 10, fontWeight: 600 },

  legend: {
    display: "flex", gap: 10, padding: "8px 16px",
    flexWrap: "wrap",
  },
  legItem:  { display: "flex", alignItems: "center", gap: 5 },
  legLabel: { color: "#94a3b8", fontSize: 9, fontWeight: 600 },
  empty: { color: "#94a3b8", fontSize: 13, padding: "30px 20px", textAlign: "center" },
};
