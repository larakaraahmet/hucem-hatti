/**
 * Kariyer Yayı — oyuncunun yaşa göre xG/90 eğrisi
 */
import { useQuery } from "@tanstack/react-query";

const API = import.meta.env.VITE_API_URL ?? "";

function SparkLine({ points, color = "#f59e0b", width = 240, height = 60 }) {
  if (!points || points.length < 2) return null;

  const maxV = Math.max(...points.map(p => p.xg90), 0.01);
  const xs = points.map((_, i) => (i / (points.length - 1)) * width);
  const ys = points.map(p => height - (p.xg90 / maxV) * (height - 10) - 4);

  const pathD = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const areaD = pathD + ` L${(width).toFixed(1)},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} style={{ overflow:"visible" }}>
      <defs>
        <linearGradient id="arc-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#arc-grad)" />
      <path d={pathD} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={xs[i]} cy={ys[i]} r={3} fill={color} />
          <title>{p.yas} yaş · xG/90: {p.xg90}</title>
        </g>
      ))}
    </svg>
  );
}

export default function CareerArc({ playerId }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["career-arc", playerId],
    queryFn: () =>
      fetch(`${API}/player-extras/${playerId}/career-arc`).then(r => {
        if (!r.ok) throw new Error("no data");
        return r.json();
      }),
    retry: false,
  });

  if (isLoading) return (
    <div style={{ padding:16, color:"#475569", fontSize:13 }}>Kariyer verisi yükleniyor…</div>
  );
  if (isError || !data?.noktalar?.length) return null;

  const { noktalar, zirve, trend } = data;

  const trendColor = trend === "rising" ? "#22c55e" : trend === "falling" ? "#ef4444" : "#94a3b8";
  const trendIcon  = trend === "rising" ? "📈" : trend === "falling" ? "📉" : "➡️";
  const trendLabel = trend === "rising" ? "Yükselen Form" : trend === "falling" ? "Düşüş" : "Stabil";

  return (
    <div style={{
      background:"rgba(255,255,255,.03)",
      border:"1px solid rgba(255,255,255,.08)",
      borderRadius:14, padding:20,
      marginTop:16,
    }}>
      {/* Başlık */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        marginBottom:16,
      }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#64748b", letterSpacing:1, textTransform:"uppercase" }}>
          📈 Kariyer Yayı
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <span style={{ fontSize:13, color:trendColor, fontWeight:700 }}>{trendIcon} {trendLabel}</span>
        </div>
      </div>

      {/* Çizgi grafik */}
      <div style={{ overflowX:"auto" }}>
        <SparkLine points={noktalar} width={Math.max(240, noktalar.length * 48)} height={80} />
      </div>

      {/* Yıl etiketleri */}
      <div style={{
        display:"flex", justifyContent:"space-between",
        marginTop:4, paddingTop:4,
        borderTop:"1px solid rgba(255,255,255,.06)",
      }}>
        {noktalar.map((p, i) => (
          <div key={i} style={{ textAlign:"center", fontSize:10, color:"#475569" }}>
            <div>{p.yas}</div>
            <div style={{ color:"#64748b" }}>{p.yil}</div>
          </div>
        ))}
      </div>

      {/* Zirve bilgisi */}
      <div style={{
        marginTop:14, padding:"10px 14px",
        background:"rgba(245,158,11,.08)",
        border:"1px solid rgba(245,158,11,.2)",
        borderRadius:8,
        display:"flex", gap:16, alignItems:"center",
      }}>
        <span style={{ fontSize:20 }}>🏆</span>
        <div>
          <div style={{ fontSize:12, color:"#94a3b8" }}>Kariyer Zirvesi</div>
          <div style={{ fontSize:14, fontWeight:700, color:"#f59e0b" }}>
            {zirve.yas} Yaş ({zirve.yil}) — xG/90: {zirve.xg90}
          </div>
        </div>
      </div>
    </div>
  );
}
