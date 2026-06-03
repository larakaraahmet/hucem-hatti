/**
 * Yardımetre — Oyuncunun takıma katkı değeri (xT / action value)
 * /player/{id}/advanced-value endpoint'inden veri çeker.
 * Veri yoksa bileşen render edilmez.
 */
import { useEffect, useState } from "react";
import { api } from "../services/api.js";

// Meter bar — renk, değer ve etiketle
function MeterBar({ label, value, max, color, unit = "", sublabel = "" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5, alignItems:"baseline" }}>
        <span style={{ fontSize:11, fontWeight:700, color:"#0f172a" }}>{label}</span>
        <span style={{ fontSize:13, fontWeight:900, color }}>
          {typeof value === "number" ? value.toFixed(2) : value}{unit}
        </span>
      </div>
      <div style={{ height:8, background:"#f1f5f9", borderRadius:4, overflow:"hidden" }}>
        <div style={{
          height:"100%", width:`${pct}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          borderRadius:4, transition:"width .6s ease",
        }} />
      </div>
      {sublabel && <div style={{ fontSize:9, color:"#94a3b8", marginTop:3 }}>{sublabel}</div>}
    </div>
  );
}

export default function Yardimetre({ playerId }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerId) return;
    setData(null); setLoading(true);
    api.getPlayerAdvancedValue(playerId)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [playerId]);

  if (loading || !data) return null;

  // Hangi metrikler var?
  const metrics = [
    { key:"xt_toplam",   label:"Toplam xT Katkısı",      unit:"",   color:"#10b981", desc:"Saha üzerindeki tüm aksiyon xT değeri" },
    { key:"xt_tasima",   label:"Topla İlerleme (xT)",     unit:"",   color:"#38bdf8", desc:"Top taşımayla üretilen tehdit değeri" },
    { key:"xt_pas",      label:"Pas Katkısı (xT)",        unit:"",   color:"#8b5cf6", desc:"Paslarla üretilen tehdit değeri" },
    { key:"xt_sut",      label:"Şut Tehdit Değeri",       unit:"",   color:"#f59e0b", desc:"Şutlarla üretilen xT" },
    { key:"xt_per90",    label:"xT / 90 dk",              unit:"",   color:"#ef4444", desc:"90 dakika başına katkı değeri" },
    { key:"obv_toplam",  label:"OBV (Top Davranış Değ.)", unit:"",   color:"#6366f1", desc:"On-Ball Value — beklentinin üzerinde katkı" },
    { key:"ppda",        label:"PPDA (Baskı)",             unit:"",   color:"#f97316", desc:"İzin verilen geçiş başına uygulanan baskı" },
  ].filter(m => data[m.key] !== undefined && data[m.key] !== null);

  if (!metrics.length) return null;

  const maxVals = {};
  metrics.forEach(m => { maxVals[m.key] = Math.abs(data[m.key]) * 1.4 || 1; });

  return (
    <div style={{
      background:"#ffffff", border:"1px solid #e2e8f0",
      borderRadius:12, padding:"16px 18px",
      boxShadow:"0 1px 3px rgba(0,0,0,.06)",
    }}>
      {/* Başlık */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:16 }}>📏</span>
          <span style={{ fontSize:13, fontWeight:800, color:"#0f172a" }}>Yardımetre</span>
        </div>
        <span style={{
          fontSize:9, fontWeight:800, letterSpacing:".07em", textTransform:"uppercase",
          background:"#f0fdf4", border:"1px solid #86efac",
          color:"#16a34a", padding:"2px 8px", borderRadius:5,
        }}>xT · Katkı Değeri</span>
      </div>

      {/* Metrikler */}
      {metrics.map(m => (
        <MeterBar key={m.key}
          label={m.label}
          value={data[m.key]}
          max={maxVals[m.key]}
          color={m.color}
          sublabel={m.desc}
        />
      ))}

      {/* Özet kutusu */}
      {(data.xt_per90 !== undefined || data.xt_toplam !== undefined) && (
        <div style={{
          marginTop:14, padding:"10px 14px",
          background:"#f0fdf4", borderRadius:8, border:"1px solid #86efac",
          display:"flex", gap:20, flexWrap:"wrap",
        }}>
          {data.xt_toplam !== undefined && (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:900, color:"#16a34a" }}>{data.xt_toplam.toFixed(2)}</div>
              <div style={{ fontSize:9, color:"#64748b", fontWeight:700, textTransform:"uppercase" }}>Toplam xT</div>
            </div>
          )}
          {data.xt_per90 !== undefined && (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:900, color:"#0891b2" }}>{data.xt_per90.toFixed(3)}</div>
              <div style={{ fontSize:9, color:"#64748b", fontWeight:700, textTransform:"uppercase" }}>xT/90</div>
            </div>
          )}
          {data.percentile !== undefined && (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:900, color:"#7c3aed" }}>%{Math.round(data.percentile)}</div>
              <div style={{ fontSize:9, color:"#64748b", fontWeight:700, textTransform:"uppercase" }}>Yüzdelik</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
