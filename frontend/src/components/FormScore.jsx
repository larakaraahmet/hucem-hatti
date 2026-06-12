/**
 * Form Skoru — son 5 maç xG trendi
 */
import { useQuery } from "@tanstack/react-query";

const API = import.meta.env.VITE_API_URL ?? "";

function TrendLine({ values, color = "#f59e0b", width = 120, height = 32 }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 0.01);
  const xs = values.map((_, i) => (i / (values.length - 1)) * width);
  const ys = values.map(v => height - (v / max) * (height - 4) - 2);
  const d  = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");

  return (
    <svg width={width} height={height} style={{ display:"block" }}>
      <path d={d} stroke={color} strokeWidth={2} fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]} r={3} fill={color} />
    </svg>
  );
}

export default function FormScore({ playerId }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["form", playerId],
    queryFn: () =>
      fetch(`${API}/player-extras/${playerId}/form`).then(r => {
        if (!r.ok) throw new Error("no data");
        return r.json();
      }),
    retry: false,
  });

  if (isLoading || isError || !data || data.skor === 0) return null;

  const trendColor = data.trend?.length >= 2 && data.trend[data.trend.length - 1] > data.trend[0]
    ? "#22c55e" : "#f97316";

  return (
    <div style={{
      display:"flex", alignItems:"center", gap:12,
      padding:"12px 16px",
      background:"rgba(255,255,255,.03)",
      border:"1px solid rgba(255,255,255,.08)",
      borderRadius:12,
      marginTop:12,
    }}>
      {/* Emoji */}
      <span style={{ fontSize:28, lineHeight:1 }}>{data.emoji}</span>

      {/* Info */}
      <div style={{ flex:1 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:15, fontWeight:700, color:"#f1f5f9" }}>Son Form</span>
          <span style={{
            fontSize:11, fontWeight:700, color:"#0f172a",
            background: data.skor >= 6 ? "#22c55e" : data.skor >= 3 ? "#f59e0b" : "#94a3b8",
            borderRadius:99, padding:"2px 8px",
          }}>
            {data.label}
          </span>
        </div>
        <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>
          Son {data.maclar.length} maç · Ort. katki: {data.maclar.length > 0
            ? (data.maclar.reduce((a, m) => a + m.katki, 0) / data.maclar.length).toFixed(2)
            : "—"}
        </div>
      </div>

      {/* Mini trend çizgisi */}
      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
        <TrendLine values={data.trend} color={trendColor} width={80} height={28} />
        <div style={{ fontSize:18, fontWeight:900, color:"#f59e0b" }}>
          {data.skor}<span style={{ fontSize:11, color:"#64748b" }}>/10</span>
        </div>
      </div>
    </div>
  );
}
