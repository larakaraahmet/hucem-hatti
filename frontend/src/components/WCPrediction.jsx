/**
 * WCPrediction — WC 2026 Performans Tahmin Kartı
 * Props: xg90, asist90, mevki, playerName
 */
import { useState } from "react";

const SCENARIOS = [
  { label:"Grup (3 maç)",   value:3  },
  { label:"Son 16 (5 maç)", value:5  },
  { label:"Çeyrek (6 maç)", value:6  },
  { label:"Yarı (7 maç)",   value:7  },
  { label:"Final (8 maç)",  value:8  },
];

export default function WCPrediction({ xg90 = 0, asist90 = 0, playerName = "" }) {
  const [scenario, setScenario] = useState(3);

  const totalMin       = scenario * 90;
  const beklenenGol    = ((xg90 / 90) * totalMin);
  const beklenenAsist  = ((asist90 / 90) * totalMin);

  const golColor   = beklenenGol   >= 3 ? "#16a34a" : beklenenGol   >= 1.5 ? "#d97706" : "#64748b";
  const asistColor = beklenenAsist >= 2 ? "#0284c7" : beklenenAsist >= 1   ? "#7c3aed" : "#64748b";

  return (
    <div style={{
      background:"#ffffff", border:"1px solid #e2e8f0",
      borderRadius:12, overflow:"hidden",
      boxShadow:"0 1px 3px rgba(0,0,0,.06)",
    }}>
      {/* Başlık */}
      <div style={{
        background:"linear-gradient(135deg,#0f172a,#1e3a5f)",
        padding:"10px 14px",
        display:"flex", alignItems:"center", gap:8,
      }}>
        <span style={{ fontSize:16 }}>🏆</span>
        <div>
          <div style={{ fontSize:11, fontWeight:800, color:"#f59e0b", letterSpacing:".06em" }}>
            WC 2026 TAHMİN
          </div>
          <div style={{ fontSize:9, color:"rgba(255,255,255,.5)", marginTop:1 }}>
            {playerName || "Oyuncu"} · xG/90 bazlı projeksiyon
          </div>
        </div>
      </div>

      <div style={{ padding:"12px 14px" }}>
        {/* Senaryo seçici */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:9, fontWeight:700, color:"#94a3b8", letterSpacing:".08em", marginBottom:6 }}>
            SENARYO SEÇ
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
            {SCENARIOS.map(s => (
              <button key={s.value} onClick={() => setScenario(s.value)} style={{
                padding:"4px 10px", borderRadius:20, fontSize:10, fontWeight:700, cursor:"pointer",
                background: scenario === s.value ? "#0f172a" : "#f8fafc",
                border: `1px solid ${scenario === s.value ? "#0f172a" : "#e2e8f0"}`,
                color: scenario === s.value ? "#f59e0b" : "#64748b",
                transition:"all .15s",
              }}>{s.label}</button>
            ))}
          </div>
        </div>

        {/* Sonuçlar */}
        <div style={{
          background:"linear-gradient(135deg,#f0fdf4,#f0f9ff)",
          border:"1px solid #bbf7d0",
          borderRadius:10, padding:"14px 16px",
          display:"flex", gap:20, flexWrap:"wrap",
        }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:28, fontWeight:900, color:golColor, lineHeight:1 }}>
              ~{beklenenGol.toFixed(1)}
            </div>
            <div style={{ fontSize:10, color:"#64748b", fontWeight:600, marginTop:3 }}>⚽ beklenen gol</div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:28, fontWeight:900, color:asistColor, lineHeight:1 }}>
              ~{beklenenAsist.toFixed(1)}
            </div>
            <div style={{ fontSize:10, color:"#64748b", fontWeight:600, marginTop:3 }}>🅰️ beklenen asist</div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:28, fontWeight:900, color:"#7c3aed", lineHeight:1 }}>
              ~{(beklenenGol + beklenenAsist).toFixed(1)}
            </div>
            <div style={{ fontSize:10, color:"#64748b", fontWeight:600, marginTop:3 }}>🎯 toplam katkı</div>
          </div>
        </div>

        {/* Alt not */}
        <div style={{ marginTop:8, fontSize:9, color:"#94a3b8" }}>
          Hesap: xG/90 = {xg90?.toFixed(3) ?? "–"} · Asist/90 = {asist90?.toFixed(3) ?? "–"} · {scenario} maç × 90dk
        </div>
      </div>
    </div>
  );
}
