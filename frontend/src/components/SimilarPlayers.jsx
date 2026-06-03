/**
 * SimilarPlayers — verilen oyuncuya en benzer oyuncuları kart listesi olarak gösterir.
 * Verisi GET /player/{id}/similar endpoint'inden çekilir.
 */

import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// ─── Renk paleti (ShotMap / RadarChart ile uyumlu koyu tema) ─────────────────
const C = {
  bg:       "#ffffff",
  card:     "#f8fafc",
  border:   "#e2e8f0",
  bar:      "#3b82f6",
  barBg:    "rgba(59,130,246,0.10)",
  text:     "#64748b",
  title:    "#0f172a",
  divider:  "#f1f5f9",
};

// Benzerlik yüzdesine göre renk
const simColor = (pct) => {
  if (pct >= 85) return "#22c55e";   // yeşil
  if (pct >= 70) return "#38bdf8";   // mavi
  if (pct >= 55) return "#eab308";   // sarı
  return "#f97316";                   // turuncu
};

// ─── Tek oyuncu kartı ─────────────────────────────────────────────────────────
function PlayerCard({ player, rank }) {
  const { isim, mevki, benzerlik, per90 } = player;
  const color = simColor(benzerlik);

  return (
    <div style={styles.card}>
      {/* Üst satır: sıra + isim + mevki + benzerlik yüzdesi */}
      <div style={styles.cardTop}>
        <span style={styles.rank}>#{rank}</span>

        <div style={styles.nameBlock}>
          <span style={styles.playerName}>{isim}</span>
          {mevki && <span style={styles.badge}>{mevki}</span>}
        </div>

        <span style={{ ...styles.simPct, color }}>{benzerlik.toFixed(1)}%</span>
      </div>

      {/* Benzerlik çubuğu */}
      <div style={styles.barOuter}>
        <div
          style={{
            ...styles.barInner,
            width:      `${benzerlik}%`,
            background: color,
          }}
        />
      </div>

      {/* Metrik satırı */}
      <div style={styles.metrics}>
        <Metric label="xG/90"        value={per90.xg90?.toFixed(3)}        />
        <div style={styles.metricDiv} />
        <Metric label="xA/90"        value={per90.xa90?.toFixed(3)}        />
        <div style={styles.metricDiv} />
        <Metric label="Gol/90"       value={per90.gol90?.toFixed(3)}       />
        <div style={styles.metricDiv} />
        <Metric label="Prog. Pas/90" value={per90.prog_pass90?.toFixed(1)} />
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div style={styles.metric}>
      <span style={styles.metricLabel}>{label}</span>
      <span style={styles.metricValue}>{value ?? "—"}</span>
    </div>
  );
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────
export default function SimilarPlayers({
  playerId,
  playerName,
  topN             = 5,
  samePositionOnly = false,
  minMinutes       = 90,
}) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!playerId) return;
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams({
      top_n:              topN,
      same_position_only: samePositionOnly,
      min_minutes:        minMinutes,
    }).toString();

    fetch(`${API_BASE}/player/${playerId}/similar?${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Sunucu hatası: ${r.status}`);
        return r.json();
      })
      .then(setPlayers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [playerId, topN, samePositionOnly, minMinutes]);

  // ── Yükleme / hata durumları ─────────────────────────────────────────────
  if (loading)
    return (
      <div style={styles.placeholder}>
        <span style={styles.dim}>Benzer oyuncular yükleniyor…</span>
      </div>
    );

  if (error)
    return (
      <div style={styles.placeholder}>
        <span style={{ color: "#f87171" }}>Hata: {error}</span>
      </div>
    );

  if (!players.length)
    return (
      <div style={styles.placeholder}>
        <span style={styles.dim}>Benzer oyuncu bulunamadı.</span>
      </div>
    );

  return (
    <div style={styles.wrapper}>
      {/* Başlık */}
      <div style={styles.header}>
        <span style={styles.title}>
          {playerName ?? `Oyuncu #${playerId}`} — Benzer Oyuncular
        </span>
        <span style={styles.sub}>
          Cosine similarity · {samePositionOnly ? "Aynı mevki" : "Tüm mevkiler"}
        </span>
      </div>

      {/* Kart listesi */}
      <div style={styles.list}>
        {players.map((p, i) => (
          <PlayerCard key={p.oyuncu_id} player={p} rank={i + 1} />
        ))}
      </div>

      {/* Lejant */}
      <div style={styles.legend}>
        {[
          { label: "≥85%", color: "#22c55e" },
          { label: "70–85%", color: "#38bdf8" },
          { label: "55–70%", color: "#eab308" },
          { label: "<55%",  color: "#f97316" },
        ].map(({ label, color }) => (
          <span key={label} style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: color }} />
            <span style={styles.dim}>{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Inline stiller ───────────────────────────────────────────────────────────
const styles = {
  wrapper: {
    background:   C.bg,
    borderRadius: 14,
    padding:      "20px 20px 16px",
    width:        480,
    fontFamily:   "'Inter', 'Segoe UI', sans-serif",
    boxShadow:    "0 4px 32px rgba(0,0,0,0.5)",
    boxSizing:    "border-box",
  },
  header: {
    marginBottom:  14,
    display:       "flex",
    flexDirection: "column",
    gap:           3,
  },
  title: { color: C.title, fontSize: 15, fontWeight: 600 },
  sub:   { color: C.text,  fontSize: 12 },

  list: { display: "flex", flexDirection: "column", gap: 8 },

  // ── Kart ──
  card: {
    background:   C.card,
    border:       `1px solid ${C.border}`,
    borderRadius: 10,
    padding:      "12px 14px 10px",
  },
  cardTop: {
    display:    "flex",
    alignItems: "center",
    gap:        10,
    marginBottom: 8,
  },
  rank: {
    color:      C.text,
    fontSize:   12,
    fontWeight: 600,
    minWidth:   20,
  },
  nameBlock: {
    flex:       1,
    display:    "flex",
    alignItems: "center",
    gap:        8,
    minWidth:   0,
  },
  playerName: {
    color:        C.title,
    fontSize:     14,
    fontWeight:   600,
    overflow:     "hidden",
    textOverflow: "ellipsis",
    whiteSpace:   "nowrap",
  },
  badge: {
    background:   "#e2e8f0",
    color:        C.text,
    fontSize:     10,
    fontWeight:   500,
    borderRadius: 4,
    padding:      "2px 6px",
    whiteSpace:   "nowrap",
  },
  simPct: {
    fontSize:   16,
    fontWeight: 700,
    minWidth:   54,
    textAlign:  "right",
  },

  // ── Benzerlik çubuğu ──
  barOuter: {
    background:   C.barBg,
    borderRadius: 3,
    height:       4,
    overflow:     "hidden",
    marginBottom: 10,
  },
  barInner: {
    height:       "100%",
    borderRadius: 3,
    transition:   "width 0.4s ease",
    opacity:      0.85,
  },

  // ── Metrikler ──
  metrics: {
    display:    "flex",
    alignItems: "center",
    gap:        0,
  },
  metric: {
    flex:          1,
    display:       "flex",
    flexDirection: "column",
    alignItems:    "center",
    gap:           2,
  },
  metricLabel: { color: C.text, fontSize: 10 },
  metricValue: { color: C.title, fontSize: 13, fontWeight: 700 },
  metricDiv: {
    width:      1,
    height:     28,
    background: C.divider,
    flexShrink: 0,
  },

  // ── Lejant ──
  legend: {
    display:    "flex",
    gap:        14,
    marginTop:  14,
    flexWrap:   "wrap",
  },
  legendItem: {
    display:    "flex",
    alignItems: "center",
    gap:        5,
  },
  legendDot: {
    width:        8,
    height:       8,
    borderRadius: "50%",
    display:      "inline-block",
  },

  placeholder: {
    background:     C.bg,
    borderRadius:   14,
    padding:        "40px 60px",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    fontFamily:     "sans-serif",
  },
  dim: { color: C.text, fontSize: 12 },
};
