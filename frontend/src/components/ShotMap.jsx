/**
 * ShotMap — oyuncunun turnuva boyunca attığı şutları saha yarısı üzerinde gösterir.
 * StatsBomb koordinat sistemi: x ∈ [0,120], y ∈ [0,80]; rakip kale x=120.
 * Bu bileşen yalnızca hücum yarısını (x=60..120) çizer.
 */

import { useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// ─── SVG boyutları ────────────────────────────────────────────────────────────
const W = 540;
const H = 380;
const PAD = 28;
const PW = W - 2 * PAD; // saha genişliği piksel cinsinden
const PH = H - 2 * PAD; // saha yüksekliği piksel cinsinden

// ─── StatsBomb → SVG dönüşümleri ─────────────────────────────────────────────
// SVG x ekseni = StatsBomb y (0→80),  sol-sağ
// SVG y ekseni = StatsBomb x (60→120), kale aşağıda
const tx = (sbY) => PAD + (sbY / 80) * PW;
const ty = (sbX) => PAD + ((sbX - 60) / 60) * PH;

// xG değerinden nokta yarıçapı: min 3.5, max 16 px
const xgToR = (xg) => (xg != null ? Math.max(3.5, Math.min(16, xg * 50)) : 4);

// ─── Renk paleti (koyu tema) ──────────────────────────────────────────────────
const C = {
  bg:       "#0f1923",
  pitchFill:"#0c1f31",
  line:     "rgba(255,255,255,0.20)",
  lineBold: "rgba(255,255,255,0.40)",
  goal:     "#f97316",        // turuncu — gol
  goalGlow: "rgba(251,146,60,0.35)",
  miss:     "rgba(96,165,250,0.65)", // mavi — gol değil
  missBorder:"rgba(96,165,250,0.25)",
  text:     "#94a3b8",
  tooltipBg:"#1a2e42",
};

// ─── Saha çizimleri ───────────────────────────────────────────────────────────
function Pitch() {
  const ls = { stroke: C.line,     strokeWidth: 1,   fill: "none" };
  const lb = { stroke: C.lineBold, strokeWidth: 1.5, fill: "none" };

  // Ceza sahası:   x=102..120, y=18..62
  // 6 yard kutusu: x=114..120, y=30..50
  // Penaltı noktası: x=108, y=40
  // Kale:          x=120, y=36..44  (saha dışına taşan kutu)
  // Merkez yay:    merkez (60,40), r=10 → sadece görünen yay

  const [paX, paY, paW, paH] = [tx(18), ty(102), tx(62) - tx(18), ty(120) - ty(102)];
  const [sbX, sbY, sbW, sbH] = [tx(30), ty(114), tx(50) - tx(30), ty(120) - ty(114)];
  const goalX = tx(36);
  const goalW = tx(44) - tx(36);
  const goalDepth = 9;

  // Merkez yay yarıçapı (10 yard, StatsBomb y eksenine göre ölçeklendi)
  const arcR = (10 / 80) * PW;
  const arcCX = tx(40);
  const arcCY = ty(60); // = PAD (yarı çizgisi)
  const arcD = `M ${arcCX - arcR} ${arcCY} A ${arcR} ${arcR} 0 0 1 ${arcCX + arcR} ${arcCY}`;

  return (
    <g>
      {/* Saha zemin */}
      <rect x={PAD} y={PAD} width={PW} height={PH} fill={C.pitchFill} stroke={C.lineBold} strokeWidth={1.5} />

      {/* Yarı çizgisi etiketi */}
      <line x1={PAD} y1={PAD} x2={W - PAD} y2={PAD} {...lb} strokeDasharray="6 4" />
      <text x={PAD + 4} y={PAD - 8} fill={C.text} fontSize={10} fontFamily="sans-serif">
        Yarı çizgisi
      </text>

      {/* Merkez yay */}
      <path d={arcD} {...ls} />

      {/* Ceza sahası */}
      <rect x={paX} y={paY} width={paW} height={paH} {...ls} />

      {/* 6 yard kutusu */}
      <rect x={sbX} y={sbY} width={sbW} height={sbH} {...ls} />

      {/* Penaltı noktası */}
      <circle cx={tx(40)} cy={ty(108)} r={2.5} fill={C.line} />

      {/* Kale kutusu (saha altına taşar) */}
      <rect
        x={goalX}
        y={ty(120)}
        width={goalW}
        height={goalDepth}
        fill="rgba(255,255,255,0.04)"
        stroke={C.lineBold}
        strokeWidth={1.5}
      />
      {/* Kale çizgisi vurgu */}
      <line x1={PAD} y1={ty(120)} x2={W - PAD} y2={ty(120)} stroke={C.lineBold} strokeWidth={1.5} />
    </g>
  );
}

// ─── Tooltip (saf SVG) ────────────────────────────────────────────────────────
function Tooltip({ shot }) {
  const rawX = tx(shot.y_konum) + 16;
  const rawY = ty(shot.x_konum) - 58;
  const x = Math.min(rawX, W - 148);
  const y = Math.max(rawY, PAD);

  return (
    <g transform={`translate(${x},${y})`} style={{ pointerEvents: "none" }}>
      <rect width={136} height={56} rx={7} fill={C.tooltipBg} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
      <text x={12} y={22} fill="#e2e8f0" fontSize={12} fontFamily="sans-serif" fontWeight={500}>
        xG:{" "}
        <tspan fontWeight={700}>{shot.xg != null ? shot.xg.toFixed(3) : "—"}</tspan>
      </text>
      <text
        x={12}
        y={42}
        fill={shot.gol_mu ? C.goal : C.miss}
        fontSize={12}
        fontFamily="sans-serif"
        fontWeight={600}
      >
        {shot.gol_mu ? "⚽  Gol" : "Gol değil"}
      </text>
    </g>
  );
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────
export default function ShotMap({ playerId, playerName, competition }) {
  const [shots, setShots]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    if (!playerId) return;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/player/${playerId}/shots${competition ? `?turnuva=${encodeURIComponent(competition)}` : ""}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Sunucu hatası: ${r.status}`);
        return r.json();
      })
      .then(setShots)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [playerId, competition]);

  // ── Yükleme / hata durumları ─────────────────────────────────────────────
  if (loading)
    return (
      <div style={styles.placeholder}>
        <span style={styles.dim}>Şut verisi yükleniyor…</span>
      </div>
    );

  if (error)
    return (
      <div style={styles.placeholder}>
        <span style={{ color: "#f87171" }}>Hata: {error}</span>
      </div>
    );

  // ── Özet istatistikler ───────────────────────────────────────────────────
  const goalCount = shots.filter((s) => s.gol_mu).length;
  const totalXg   = shots.reduce((acc, s) => acc + (s.xg ?? 0), 0);
  const conversion = shots.length ? ((goalCount / shots.length) * 100).toFixed(0) : 0;

  return (
    <div style={styles.card}>
      {/* Başlık */}
      <div style={styles.header}>
        <span style={styles.title}>{playerName ?? `Oyuncu #${playerId}`} — Şut Haritası</span>
      </div>

      {/* İstatistik çipleri */}
      <div style={styles.chips}>
        <Chip label="Şut"      value={shots.length}              />
        <Chip label="Gol"      value={goalCount} accent={C.goal}  />
        <Chip label="xG"       value={totalXg.toFixed(2)}         />
        <Chip label="Dönüşüm"  value={`%${conversion}`}           />
      </div>

      {/* SVG Saha */}
      <svg
        width={W}
        height={H + goalDepthConst()}
        viewBox={`0 0 ${W} ${H + goalDepthConst()}`}
        style={{ display: "block" }}
      >
        <rect width={W} height={H + goalDepthConst()} fill={C.bg} />
        <Pitch />

        {shots.map((shot) => (
          <circle
            key={shot.id}
            cx={tx(shot.y_konum)}
            cy={ty(shot.x_konum)}
            r={xgToR(shot.xg)}
            fill={shot.gol_mu ? C.goal : C.miss}
            stroke={shot.gol_mu ? C.goalGlow : C.missBorder}
            strokeWidth={shot.gol_mu ? 2.5 : 1}
            opacity={hovered && hovered.id !== shot.id ? 0.35 : 0.88}
            style={{ cursor: "pointer", transition: "opacity 0.15s, r 0.12s" }}
            onMouseEnter={() => setHovered(shot)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}

        {hovered && <Tooltip shot={hovered} />}
      </svg>

      {/* Lejant */}
      <div style={styles.legend}>
        <LegendDot color={C.goal} label="Gol" />
        <LegendDot color={C.miss} label="Gol değil" />
        <span style={styles.dim}>Daire büyüklüğü = xG</span>
      </div>
    </div>
  );
}

// Kale kutusunun saha dışına taşan miktarı (SVG toplam yüksekliğine eklenir)
function goalDepthConst() { return 9 + PAD / 2; }

// ─── Küçük yardımcı bileşenler ───────────────────────────────────────────────
function Chip({ label, value, accent }) {
  return (
    <div style={styles.chip}>
      <span style={styles.chipLabel}>{label}</span>
      <span style={{ ...styles.chipValue, ...(accent ? { color: accent } : {}) }}>{value}</span>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <svg width={12} height={12}>
        <circle cx={6} cy={6} r={5} fill={color} />
      </svg>
      <span style={styles.dim}>{label}</span>
    </span>
  );
}

// ─── Inline stiller ───────────────────────────────────────────────────────────
const styles = {
  card: {
    background:   "#ffffff",
    border:       "1px solid #e2e8f0",
    boxShadow:    "0 4px 32px rgba(0,0,0,0.5)",
    borderRadius: 14,
    padding:      "20px 20px 16px",
    display:      "inline-block",
    fontFamily:   "'Inter', 'Segoe UI', sans-serif",
  },
  header: {
    marginBottom: 12,
  },
  title: {
    color:      "#0f172a",
    fontSize:   15,
    fontWeight: 600,
  },
  chips: {
    display:      "flex",
    gap:          10,
    marginBottom: 14,
  },
  chip: {
    background:   "#f1f5f9",
    borderRadius: 8,
    padding:      "5px 12px",
    display:      "flex",
    flexDirection:"column",
    alignItems:   "center",
    minWidth:     54,
  },
  chipLabel: {
    color:    "#64748b",
    fontSize: 10,
  },
  chipValue: {
    color:      "#0f172a",
    fontSize:   16,
    fontWeight: 700,
  },
  legend: {
    display:    "flex",
    gap:        18,
    marginTop:  10,
    alignItems: "center",
  },
  dim: {
    color:    "#64748b",
    fontSize: 12,
  },
  placeholder: {
    background:    C.bg,
    borderRadius:  14,
    padding:       "40px 60px",
    display:       "flex",
    alignItems:    "center",
    justifyContent:"center",
  },
};
