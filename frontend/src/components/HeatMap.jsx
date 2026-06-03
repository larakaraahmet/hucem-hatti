/**
 * HeatMap — oyuncunun şut konumlarını tam saha üzerinde ısı yoğunluğu olarak gösterir.
 * Canvas katmanı (ısı blobları) + SVG katmanı (saha çizgileri) üst üste bindirilir.
 * Koordinat sistemi: standart yön — StatsBomb x (0→120) yatay, y (0→80) dikey.
 */

import { useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// ─── Boyutlar ─────────────────────────────────────────────────────────────────
const W   = 540;
const PAD = 24;
const PW  = W - 2 * PAD;        // 492 px — saha genişliği (120 yard)
const PH  = PW * (80 / 120);    // 328 px — saha yüksekliği (80 yard), tam oran
const H   = PH + 2 * PAD;       // 376 px — toplam SVG/canvas yüksekliği

// ─── Koordinat dönüşümleri (tam saha, atak sağda) ────────────────────────────
const tx = (sbX) => PAD + (sbX / 120) * PW;
const ty = (sbY) => PAD + (sbY / 80)  * PH;

// ─── Renk paleti ─────────────────────────────────────────────────────────────
const C = {
  bg:        "#0f1923",
  pitchFill: "#0c1f31",
  line:      "rgba(255,255,255,0.14)",
  lineBold:  "rgba(255,255,255,0.30)",
  text:      "#94a3b8",
  title:     "#e2e8f0",
};

// ─── Canvas: zemin + ısı blobları ────────────────────────────────────────────
function drawHeat(canvas, shots) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  // Saha zemini (pitch fill)
  ctx.fillStyle = C.pitchFill;
  ctx.fillRect(PAD, PAD, PW, PH);

  for (const s of shots) {
    const cx = tx(s.x_konum);
    const cy = ty(s.y_konum);
    // xG yüksekse şutun tehlikesi daha büyük → yayılma yarıçapı genişler
    const r  = 24 + (s.xg ?? 0.08) * 52;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0.00, "rgba(251,113,40,0.72)");
    grad.addColorStop(0.38, "rgba(251,113,40,0.26)");
    grad.addColorStop(1.00, "rgba(251,113,40,0.00)");

    ctx.beginPath();
    ctx.fillStyle = grad;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── SVG: saha çizgileri (fill'siz — canvas katamanı gözükür) ────────────────
function FullPitch() {
  const ls = { stroke: C.line,     strokeWidth: 0.8,  fill: "none" };
  const lb = { stroke: C.lineBold, strokeWidth: 1.3,  fill: "none" };

  const circleR = (10 / 120) * PW; // 10 yard merkez çemberi
  const cr      = (1  / 120) * PW; // 1 yard köşe yayı

  return (
    <g>
      {/* Saha sınırı (sadece çizgi, dolgu yok) */}
      <rect x={PAD} y={PAD} width={PW} height={PH} {...lb} />

      {/* Orta çizgi */}
      <line x1={tx(60)} y1={PAD} x2={tx(60)} y2={PAD + PH} {...lb} />

      {/* Orta nokta + çember */}
      <circle cx={tx(60)} cy={ty(40)} r={2.5} fill={C.line} />
      <circle cx={tx(60)} cy={ty(40)} r={circleR} {...ls} />

      {/* Sol ceza sahası (x 0–18, y 18–62) */}
      <rect x={tx(0)} y={ty(18)} width={tx(18) - tx(0)} height={ty(62) - ty(18)} {...ls} />
      {/* Sol 6 yard kutusu (x 0–6, y 30–50) */}
      <rect x={tx(0)} y={ty(30)} width={tx(6)  - tx(0)} height={ty(50) - ty(30)} {...ls} />

      {/* Sağ ceza sahası (x 102–120, y 18–62) */}
      <rect x={tx(102)} y={ty(18)} width={tx(120) - tx(102)} height={ty(62) - ty(18)} {...ls} />
      {/* Sağ 6 yard kutusu (x 114–120, y 30–50) */}
      <rect x={tx(114)} y={ty(30)} width={tx(120) - tx(114)} height={ty(50) - ty(30)} {...ls} />

      {/* Penaltı noktaları */}
      <circle cx={tx(12)}  cy={ty(40)} r={2} fill={C.line} />
      <circle cx={tx(108)} cy={ty(40)} r={2} fill={C.line} />

      {/* Köşe yayları (r = 1 yard, içe doğru kıvrılır) */}
      <path d={`M ${tx(0)+cr} ${ty(0)} A ${cr} ${cr} 0 0 1 ${tx(0)} ${ty(0)+cr}`} {...ls} />
      <path d={`M ${tx(120)-cr} ${ty(0)} A ${cr} ${cr} 0 0 0 ${tx(120)} ${ty(0)+cr}`} {...ls} />
      <path d={`M ${tx(0)} ${ty(80)-cr} A ${cr} ${cr} 0 0 0 ${tx(0)+cr} ${ty(80)}`} {...ls} />
      <path d={`M ${tx(120)-cr} ${ty(80)} A ${cr} ${cr} 0 0 1 ${tx(120)} ${ty(80)-cr}`} {...ls} />

      {/* Kale kutuları */}
      <rect
        x={tx(0) - (tx(2) - tx(0))} y={ty(36)}
        width={tx(2) - tx(0)} height={ty(44) - ty(36)}
        fill="rgba(255,255,255,0.04)" {...lb}
      />
      <rect
        x={tx(120)} y={ty(36)}
        width={tx(2) - tx(0)} height={ty(44) - ty(36)}
        fill="rgba(255,255,255,0.04)" {...lb}
      />

      {/* Etiketler */}
      <text x={tx(90)} y={PAD - 7} fill={C.text} fontSize={10} fontFamily="sans-serif" textAnchor="middle">
        Atak yönü →
      </text>
      <text x={tx(30)} y={PAD - 7} fill={C.text} fontSize={10} fontFamily="sans-serif" textAnchor="middle">
        Savunma
      </text>
    </g>
  );
}

// ─── Renk lejantı ─────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div style={styles.legend}>
      <span style={styles.dim}>Düşük yoğunluk</span>
      <div style={styles.gradBar} />
      <span style={styles.dim}>Yüksek yoğunluk</span>
    </div>
  );
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────
export default function HeatMap({ playerId, playerName, competition }) {
  const [shots, setShots]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const canvasRef             = useRef(null);

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

  // Shots değişince canvas'ı yeniden çiz
  useEffect(() => {
    drawHeat(canvasRef.current, shots);
  }, [shots]);

  if (loading)
    return (
      <div style={styles.placeholder}>
        <span style={styles.dim}>Isı haritası yükleniyor…</span>
      </div>
    );

  if (error)
    return (
      <div style={styles.placeholder}>
        <span style={{ color: "#f87171" }}>Hata: {error}</span>
      </div>
    );

  const goalCount = shots.filter((s) => s.gol_mu).length;
  const totalXg   = shots.reduce((acc, s) => acc + (s.xg ?? 0), 0);
  const avgXg     = shots.length ? (totalXg / shots.length).toFixed(3) : "—";

  return (
    <div style={styles.card}>
      {/* Başlık */}
      <div style={styles.header}>
        <span style={styles.title}>{playerName ?? `Oyuncu #${playerId}`} — Şut Isı Haritası</span>
      </div>

      {/* Canvas (ısı) + SVG (çizgiler) katmanları */}
      <div style={{ position: "relative", width: W, height: H }}>
        <div style={{ position: "absolute", width: W, height: H, background: C.bg, borderRadius: 6 }} />
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ position: "absolute", top: 0, left: 0 }}
        />
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          <FullPitch />
        </svg>
      </div>

      {/* Lejant */}
      <Legend />

      {/* İstatistik çipler */}
      <div style={styles.chips}>
        <Chip label="Şut"      value={shots.length}           />
        <Chip label="Gol"      value={goalCount}               />
        <Chip label="xG"       value={totalXg.toFixed(2)}      />
        <Chip label="xG/Şut"   value={avgXg}                   />
      </div>
    </div>
  );
}

// ─── Yardımcı bileşenler ──────────────────────────────────────────────────────
function Chip({ label, value }) {
  return (
    <div style={styles.chip}>
      <span style={styles.chipLabel}>{label}</span>
      <span style={styles.chipValue}>{value}</span>
    </div>
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
  header:  { marginBottom: 12 },
  title:   { color: C.title, fontSize: 15, fontWeight: 600 },
  legend: {
    display:    "flex",
    alignItems: "center",
    gap:        10,
    marginTop:  10,
  },
  gradBar: {
    flex:         1,
    height:       6,
    borderRadius: 3,
    background:   "linear-gradient(to right, rgba(251,113,40,0.12), rgba(251,113,40,0.55), rgba(251,113,40,1))",
  },
  chips: {
    display:   "flex",
    gap:       10,
    marginTop: 12,
  },
  chip: {
    background:    "#f1f5f9",
    borderRadius:  8,
    padding:       "5px 12px",
    display:       "flex",
    flexDirection: "column",
    alignItems:    "center",
    minWidth:      60,
  },
  chipLabel: { color: C.text, fontSize: 10 },
  chipValue: { color: C.title, fontSize: 16, fontWeight: 700 },
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
