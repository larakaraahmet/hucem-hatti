/**
 * RadarChart — oyuncunun 7 metriğini yüzdelik dilim bazında polar grafikte gösterir.
 * Verisi GET /player/{id}/percentiles endpoint'inden çekilir.
 */

import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// ─── SVG boyutları ────────────────────────────────────────────────────────────
const SIZE   = 420;
const CX     = SIZE / 2;
const CY     = SIZE / 2;
const R      = 145;   // 100. yüzdeliğin yarıçapı (piksel)
const LEVELS = 4;     // arka plan halka sayısı → %25 / %50 / %75 / %100

// ─── Metrik tanımları (metrics.py RADAR_METRICS ile sıra eşleşiyor) ───────────
const METRICS = [
  { key: "xg90",        label: "xG/90"        },
  { key: "xa90",        label: "xA/90"         },
  { key: "gol90",       label: "Gol/90"        },
  { key: "asist90",     label: "Asist/90"      },
  { key: "sut90",       label: "Şut/90"        },
  { key: "isabetli90",  label: "İsab. Şut/90"  },
  { key: "prog_pass90", label: "Prog. Pas/90"  },
];
const N = METRICS.length;

// ─── Renk paleti (ShotMap.jsx ile uyumlu koyu tema) ──────────────────────────
const C = {
  bg:        "#ffffff",
  grid:      "rgba(0,0,0,0.07)",
  gridBold:  "rgba(0,0,0,0.15)",
  axis:      "rgba(0,0,0,0.12)",
  fill:      "rgba(59,130,246,0.12)",
  stroke:    "#3b82f6",
  dot:       "#3b82f6",
  label:     "#64748b",
  labelHl:   "#0f172a",
  levelText: "rgba(100,116,139,0.45)",
  title:     "#0f172a",
  sub:       "#94a3b8",
};

// ─── Geometri yardımcıları ────────────────────────────────────────────────────
// 12 saat konumundan başla, saat yönünde (CSS koordinat sistemi)
const angle     = (i) => (2 * Math.PI * i) / N - Math.PI / 2;
const polarPt   = (pct, i) => ({
  x: CX + (pct / 100) * R * Math.cos(angle(i)),
  y: CY + (pct / 100) * R * Math.sin(angle(i)),
});
const polyPath  = (pts) =>
  pts.map((p, j) => `${j === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ") + "Z";

// Eksen etiketi için yarıçapı biraz aşan nokta
const labelPt = (i, extra = 24) => ({
  x: CX + (R + extra) * Math.cos(angle(i)),
  y: CY + (R + extra) * Math.sin(angle(i)),
});

// ─── Arka plan ızgarası ───────────────────────────────────────────────────────
function Grid() {
  const rings = Array.from({ length: LEVELS }, (_, k) => ((k + 1) / LEVELS) * 100);

  return (
    <g>
      {/* Halka çokgenleri */}
      {rings.map((pct) => (
        <polygon
          key={pct}
          points={METRICS.map((_, i) => { const p = polarPt(pct, i); return `${p.x},${p.y}`; }).join(" ")}
          fill="none"
          stroke={pct === 100 ? C.gridBold : C.grid}
          strokeWidth={pct === 100 ? 1.2 : 0.7}
        />
      ))}

      {/* Yüzde değerleri — ilk eksenin solunda */}
      {rings.map((pct) => {
        const p = polarPt(pct, 0);
        return (
          <text key={pct} x={p.x - 5} y={p.y - 3}
            textAnchor="end" fill={C.levelText} fontSize={9} fontFamily="sans-serif">
            {pct}
          </text>
        );
      })}

      {/* Eksen çizgileri (merkezden dışa) */}
      {METRICS.map((_, i) => {
        const end = polarPt(100, i);
        return (
          <line key={i} x1={CX} y1={CY} x2={end.x} y2={end.y}
            stroke={C.axis} strokeWidth={0.8} />
        );
      })}
    </g>
  );
}

// ─── Eksen etiketleri + yüzdelik değerler ────────────────────────────────────
function AxisLabels({ percentile }) {
  return (
    <g>
      {METRICS.map((m, i) => {
        const lp  = labelPt(i);
        const pct = percentile?.[m.key] ?? 0;
        const hl  = pct >= 75;

        return (
          <g key={m.key}>
            <text
              x={lp.x} y={lp.y - 5}
              textAnchor="middle"
              fill={hl ? C.labelHl : C.label}
              fontSize={11} fontFamily="sans-serif" fontWeight={hl ? 600 : 400}
            >
              {m.label}
            </text>
            <text
              x={lp.x} y={lp.y + 11}
              textAnchor="middle"
              fill={hl ? C.stroke : C.levelText}
              fontSize={10} fontFamily="sans-serif" fontWeight={700}
            >
              %{pct.toFixed(0)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ─── Oyuncu değer çokgeni ─────────────────────────────────────────────────────
function PlayerShape({ percentile }) {
  const pts = METRICS.map((m, i) => polarPt(percentile?.[m.key] ?? 0, i));

  return (
    <g>
      <path d={polyPath(pts)} fill={C.fill} stroke={C.stroke} strokeWidth={2} strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.5}
          fill={C.dot} stroke={C.bg} strokeWidth={1.5} />
      ))}
    </g>
  );
}

// ─── Özet çip ─────────────────────────────────────────────────────────────────
function Chip({ label, value }) {
  return (
    <div style={styles.chip}>
      <span style={styles.chipLabel}>{label}</span>
      <span style={styles.chipValue}>{value ?? "—"}</span>
    </div>
  );
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────
export default function RadarChart({ playerId, playerName, minMinutes }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!playerId) return;
    setLoading(true);
    setError(null);

    const qs = minMinutes ? `?min_minutes=${minMinutes}` : "";
    fetch(`${API_BASE}/player/${playerId}/percentiles${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Sunucu hatası: ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [playerId, minMinutes]);

  // ── Yükleme / hata ───────────────────────────────────────────────────────
  if (loading)
    return (
      <div style={styles.placeholder}>
        <span style={styles.dim}>Metrik verisi yükleniyor…</span>
      </div>
    );

  if (error)
    return (
      <div style={styles.placeholder}>
        <span style={{ color: "#f87171" }}>Hata: {error}</span>
      </div>
    );

  const pct  = data?.percentile ?? {};
  const p90  = data?.per90      ?? {};
  const name = playerName ?? data?.isim ?? `Oyuncu #${playerId}`;

  // Tüm metriklerin ortalama yüzdeliği
  const avgPct = Math.round(METRICS.reduce((s, m) => s + (pct[m.key] ?? 0), 0) / N);

  return (
    <div style={styles.card}>
      {/* Başlık */}
      <div style={styles.header}>
        <span style={styles.title}>{name} — Performans Profili</span>
        <span style={styles.sub}>{data?.mac_sayisi} maç · {data?.toplam_dakika} dk</span>
      </div>

      {/* Radar SVG */}
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: "block" }}>
        <rect width={SIZE} height={SIZE} fill={C.bg} />
        <Grid />
        <PlayerShape percentile={pct} />
        <AxisLabels percentile={pct} />
      </svg>

      {/* Özet çipler */}
      <div style={styles.chips}>
        <Chip label="Ort. Yüzdelik"  value={`%${avgPct}`}                    />
        <Chip label="xG/90"          value={p90.xg90?.toFixed(3)}            />
        <Chip label="xA/90"          value={p90.xa90?.toFixed(3)}            />
        <Chip label="Prog. Pas/90"   value={p90.prog_pass90?.toFixed(1)}     />
      </div>
    </div>
  );
}

// ─── Inline stiller ───────────────────────────────────────────────────────────
const styles = {
  card: {
    background:   C.bg,
    borderRadius: 14,
    padding:      "20px 20px 16px",
    display:      "inline-block",
    fontFamily:   "'Inter', 'Segoe UI', sans-serif",
    boxShadow:    "0 4px 32px rgba(0,0,0,0.5)",
  },
  header: {
    marginBottom:  12,
    display:       "flex",
    flexDirection: "column",
    gap:           3,
  },
  title: {
    color:      C.title,
    fontSize:   15,
    fontWeight: 600,
  },
  sub: {
    color:    C.sub,
    fontSize: 12,
  },
  chips: {
    display:   "flex",
    gap:       10,
    marginTop: 14,
  },
  chip: {
    background:    "#f1f5f9",
    borderRadius:  8,
    padding:       "5px 12px",
    display:       "flex",
    flexDirection: "column",
    alignItems:    "center",
    minWidth:      66,
  },
  chipLabel: {
    color:    C.sub,
    fontSize: 10,
  },
  chipValue: {
    color:      C.title,
    fontSize:   15,
    fontWeight: 700,
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
  dim: {
    color:    C.sub,
    fontSize: 13,
  },
};
