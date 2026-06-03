/**
 * ScoringPattern — Gol serisi, susma serisi, maçlar arası ortalama gol aralığı.
 * "Bu oyuncu ne zaman gol atar?" sorusunu yanıtlar.
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export default function ScoringPattern({ playerId, competition }) {
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

  // Kronolojik sıra (en eskiden yeniye)
  const chron = [...matches].reverse();

  // ── Gol serileri ──────────────────────────────────────────────
  let curScoringStreak = 0, curDryStreak = 0;
  let maxScoringStreak = 0, maxDryStreak = 0;
  let tempScoring = 0, tempDry = 0;

  for (const m of chron) {
    if (m.gol > 0) {
      tempScoring++; tempDry = 0;
      maxScoringStreak = Math.max(maxScoringStreak, tempScoring);
    } else {
      tempDry++; tempScoring = 0;
      maxDryStreak = Math.max(maxDryStreak, tempDry);
    }
  }

  // Güncel seriler (en son maçtan geriye)
  for (const m of matches) {
    if (m.gol > 0) { curScoringStreak++; if (curDryStreak > 0) break; }
    else { if (curScoringStreak > 0) break; curDryStreak++; }
  }
  // Gerçek güncel seri
  let streak = 0; let streakIsScoring = false;
  for (const m of matches) {
    if (streak === 0) { streakIsScoring = m.gol > 0; streak = 1; }
    else if ((streakIsScoring && m.gol > 0) || (!streakIsScoring && m.gol === 0)) streak++;
    else break;
  }

  // ── Gol aralıkları ────────────────────────────────────────────
  const goalIntervals = [];
  let gapSinceLast = 0;
  for (const m of chron) {
    gapSinceLast++;
    if (m.gol > 0) {
      goalIntervals.push(gapSinceLast);
      gapSinceLast = 0;
    }
  }
  const avgInterval = goalIntervals.length > 1
    ? goalIntervals.reduce((a, b) => a + b, 0) / goalIntervals.length
    : null;

  // ── Çoklu gol maçları ─────────────────────────────────────────
  const multiGoal = matches.filter(m => m.gol >= 2).length;
  const hattrick  = matches.filter(m => m.gol >= 3).length;

  // ── Maç tipi dağılımı ─────────────────────────────────────────
  const n = matches.length;
  const goalMatches   = matches.filter(m => m.gol   > 0).length;
  const assistMatches = matches.filter(m => m.asist > 0).length;
  const blankMatches  = matches.filter(m => m.gol === 0 && m.asist === 0).length;

  // ── Gol dağılım mini grafiği ─────────────────────────────────
  // Son 20 maç gol sayısını timeline olarak göster
  const timeline = matches.slice(0, 20);

  // ── Tahmin: Sıradaki maçta gol atar mı? ─────────────────────
  // Maçlar arası gol siklüsüne bakarak yorumlama
  let nextGamePrediction = "";
  let predColor = "#94a3b8";
  if (streakIsScoring && streak >= 2) {
    nextGamePrediction = "Serisi devam edebilir 🔥";
    predColor = "#10b981";
  } else if (!streakIsScoring && streak >= 3) {
    nextGamePrediction = `${streak} maçtır suskunluk — patlama yakın 💥`;
    predColor = "#f59e0b";
  } else if (!streakIsScoring && avgInterval && gapSinceLast >= avgInterval) {
    nextGamePrediction = `Ortalama aralığa ulaşıldı (${avgInterval.toFixed(1)} maç) 🎯`;
    predColor = "#f59e0b";
  } else if (streakIsScoring) {
    nextGamePrediction = "Son maçta gol var, form iyi";
    predColor = "#22c55e";
  } else {
    nextGamePrediction = "Yakın formda katkı yok, belirsiz";
    predColor = "#ef4444";
  }

  return (
    <Wrap>
      {/* Başlık */}
      <div style={st.header}>
        <span style={st.title}>📊 Gol Deseni</span>
        <div style={{ ...st.predBadge, borderColor: predColor + "44", background: predColor + "10" }}>
          <span style={{ color: predColor, fontSize: 10, fontWeight: 700 }}>{nextGamePrediction}</span>
        </div>
      </div>

      {/* Ana seri bilgisi */}
      <div style={st.streakRow}>
        {/* Güncel seri */}
        <div style={st.streakCard}>
          <span style={st.streakCardLabel}>GÜNCEL SERİ</span>
          <span style={{
            ...st.streakBig,
            color: streakIsScoring ? "#10b981" : "#ef4444",
          }}>{streak}</span>
          <span style={{ ...st.streakSub, color: streakIsScoring ? "#10b981" : "#ef4444" }}>
            {streakIsScoring ? "gollü maç" : "golsüz maç"}
          </span>
        </div>
        <div style={st.streakDivider} />
        {/* En uzun gol serisi */}
        <div style={st.streakCard}>
          <span style={st.streakCardLabel}>EN UZUN GOL SERİSİ</span>
          <span style={{ ...st.streakBig, color: "#10b981" }}>{maxScoringStreak}</span>
          <span style={{ ...st.streakSub, color: "#10b981" }}>maç üst üste</span>
        </div>
        <div style={st.streakDivider} />
        {/* En uzun susma */}
        <div style={st.streakCard}>
          <span style={st.streakCardLabel}>EN UZUN KURAKLIK</span>
          <span style={{ ...st.streakBig, color: "#ef4444" }}>{maxDryStreak}</span>
          <span style={{ ...st.streakSub, color: "#ef4444" }}>maç golsüz</span>
        </div>
      </div>

      {/* Gol aralığı ve dağılım */}
      <div style={st.statsRow}>
        <div style={st.statBlock}>
          <span style={st.statBig}>{avgInterval ? avgInterval.toFixed(1) : "—"}</span>
          <span style={st.statLabel}>Maç / Gol Ortalaması</span>
        </div>
        <div style={st.statBlock}>
          <span style={{ ...st.statBig, color: "#f59e0b" }}>{multiGoal}</span>
          <span style={st.statLabel}>Çoklu Gol Maçı</span>
        </div>
        <div style={st.statBlock}>
          <span style={{ ...st.statBig, color: "#a78bfa" }}>{hattrick}</span>
          <span style={st.statLabel}>Hat-trick / Üzeri</span>
        </div>
        <div style={st.statBlock}>
          <span style={{ ...st.statBig, color: "#ef4444" }}>{blankMatches}</span>
          <span style={st.statLabel}>Boş Maç</span>
        </div>
      </div>

      {/* Son 20 maç mini timeline */}
      <div style={st.timelineWrap}>
        <div style={st.timelineLabel}>SON {timeline.length} MAÇ GOL DAĞILIMI</div>
        <div style={st.timeline}>
          {timeline.map((m, i) => {
            const h = m.gol === 0 ? 4 : m.gol === 1 ? 28 : m.gol === 2 ? 46 : 60;
            const c = m.gol === 0 ? "#1e293b"
                    : m.gol === 1 ? "#22c55e"
                    : m.gol === 2 ? "#f59e0b"
                    : "#ef4444";
            return (
              <div key={m.mac_id} style={st.tlCol} title={`${m.tarih}: ${m.gol} gol`}>
                <div style={st.tlTrack}>
                  <div style={{ ...st.tlBar, height: h, background: c, boxShadow: m.gol > 0 ? `0 0 6px ${c}55` : "none" }} />
                </div>
                {m.gol > 0 && <span style={{ ...st.tlNum, color: c }}>{m.gol}</span>}
              </div>
            );
          })}
        </div>
        <div style={st.tlLegend}>
          {[
            { c: "#1e293b", label: "0 gol" },
            { c: "#22c55e", label: "1 gol" },
            { c: "#f59e0b", label: "2 gol" },
            { c: "#ef4444", label: "3+" },
          ].map(({ c, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
              <span style={st.legText}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Maç tipi özet */}
      <div style={st.typesRow}>
        {[
          { n: goalMatches,   pct: Math.round(goalMatches   / n * 100), label: "Gollü Maç",    c: "#22c55e" },
          { n: assistMatches, pct: Math.round(assistMatches / n * 100), label: "Asistli Maç",  c: "#38bdf8" },
          { n: blankMatches,  pct: Math.round(blankMatches  / n * 100), label: "Katkısız Maç", c: "#334155" },
        ].map(({ n: cnt, pct, label, c }) => (
          <div key={label} style={st.typeItem}>
            <span style={{ ...st.typePct, color: c }}>%{pct}</span>
            <span style={st.typeCount}>{cnt} maç</span>
            <span style={st.typeLabel}>{label}</span>
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
  predBadge: { padding: "4px 12px", borderRadius: 8, border: "1px solid", maxWidth: 260 },

  streakRow: { display: "flex", borderBottom: "1px solid #f1f5f9" },
  streakCard: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 8px", gap: 3 },
  streakCardLabel: { color: "#94a3b8", fontSize: 8, fontWeight: 800, letterSpacing: ".08em", textAlign: "center" },
  streakBig: { fontSize: 32, fontWeight: 900, lineHeight: 1 },
  streakSub: { fontSize: 9, fontWeight: 700 },
  streakDivider: { width: 1, background: "#f1f5f9", flexShrink: 0, margin: "8px 0" },

  statsRow: {
    display: "flex",
    borderBottom: "1px solid #f1f5f9",
  },
  statBlock: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 4px", gap: 3 },
  statBig:   { fontSize: 20, fontWeight: 900, color: "#38bdf8", lineHeight: 1 },
  statLabel: { fontSize: 8, color: "#94a3b8", fontWeight: 700, letterSpacing: ".07em", textAlign: "center", textTransform: "uppercase" },

  timelineWrap:  { padding: "10px 14px 6px" },
  timelineLabel: { color: "#94a3b8", fontSize: 9, fontWeight: 700, letterSpacing: ".1em", marginBottom: 8 },
  timeline:      { display: "flex", gap: 3, alignItems: "flex-end" },
  tlCol:         { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  tlTrack:       { width: "100%", height: 60, display: "flex", alignItems: "flex-end" },
  tlBar:         { width: "100%", borderRadius: "2px 2px 0 0", transition: "height .4s ease", minHeight: 4 },
  tlNum:         { fontSize: 8, fontWeight: 800 },
  tlLegend:      { display: "flex", gap: 10, marginTop: 6 },
  legText:       { color: "#94a3b8", fontSize: 9 },

  typesRow: {
    display: "flex",
    borderTop: "1px solid #f1f5f9",
  },
  typeItem:  { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 4px", gap: 2 },
  typePct:   { fontSize: 18, fontWeight: 900, lineHeight: 1 },
  typeCount: { fontSize: 10, color: "#94a3b8", fontWeight: 600 },
  typeLabel: { fontSize: 8, color: "#94a3b8", fontWeight: 700, letterSpacing: ".07em" },

  empty: { color: "#94a3b8", fontSize: 13, padding: "30px 20px", textAlign: "center" },
};
