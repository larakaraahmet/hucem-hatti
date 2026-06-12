/**
 * Taktiksel DNA — WC 2026 takımlarının oyun stili analizi
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

const API = import.meta.env.VITE_API_URL ?? "";

const FLAGS = {
  Algeria:"🇩🇿",Argentina:"🇦🇷",Australia:"🇦🇺",Austria:"🇦🇹",
  Belgium:"🇧🇪","Bosnia and Herzegovina":"🇧🇦",Brazil:"🇧🇷",
  Canada:"🇨🇦","Cape Verde Islands":"🇨🇻",Colombia:"🇨🇴",
  "Congo DR":"🇨🇩",Croatia:"🇭🇷","Curaçao":"🇨🇼",
  "Czech Republic":"🇨🇿",Ecuador:"🇪🇨",Egypt:"🇪🇬",
  England:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",France:"🇫🇷",Germany:"🇩🇪",Ghana:"🇬🇭",
  Haiti:"🇭🇹",Iran:"🇮🇷",Iraq:"🇮🇶","Ivory Coast":"🇨🇮",
  Japan:"🇯🇵",Jordan:"🇯🇴",Mexico:"🇲🇽",Morocco:"🇲🇦",
  Netherlands:"🇳🇱","New Zealand":"🇳🇿",Norway:"🇳🇴",
  Panama:"🇵🇦",Paraguay:"🇵🇾",Portugal:"🇵🇹",Qatar:"🇶🇦",
  "Saudi Arabia":"🇸🇦",Scotland:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",Senegal:"🇸🇳",
  "South Africa":"🇿🇦","South Korea":"🇰🇷",Spain:"🇪🇸",
  Sweden:"🇸🇪",Switzerland:"🇨🇭",Tunisia:"🇹🇳",Turkey:"🇹🇷",
  "United States":"🇺🇸",Uruguay:"🇺🇾",Uzbekistan:"🇺🇿",
  Georgia:"🇬🇪",Italy:"🇮🇹",
};
const fl = c => FLAGS[c] ?? "🏳️";

const DIMS = [
  { key:"saldiri",     label:"Saldırı",     desc:"xG/90" },
  { key:"yaraticilik", label:"Yaratıcılık",  desc:"xA/90" },
  { key:"ilerleme",    label:"İlerleme",     desc:"prog/90" },
  { key:"kal_sut",     label:"Şut Kalitesi", desc:"xG/şut" },
  { key:"hacim",       label:"Şut Hacmi",    desc:"şut/90" },
];

// Mini radar SVG (pentagon)
function MiniRadar({ scores, color, size = 80 }) {
  const keys = DIMS.map(d => d.key);
  const n = keys.length;
  const cx = size / 2, cy = size / 2;
  const r = size * 0.38;

  function polar(angle, radius) {
    return [
      cx + Math.cos(angle - Math.PI / 2) * radius,
      cy + Math.sin(angle - Math.PI / 2) * radius,
    ];
  }

  const angles = keys.map((_, i) => (2 * Math.PI * i) / n);
  const dataPoints = keys.map((k, i) => polar(angles[i], r * ((scores[k] ?? 0) / 10)));
  const bgPoints   = keys.map((_, i) => polar(angles[i], r));

  const toPath = pts => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + " Z";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* background */}
      <polygon points={bgPoints.map(p => p.join(",")).join(" ")}
        fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.12)" strokeWidth={0.8} />
      {/* data */}
      <path d={toPath(dataPoints)}
        fill={color + "33"} stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

// Full radar
function FullRadar({ scores, color, size = 240 }) {
  const keys = DIMS.map(d => d.key);
  const labels = DIMS.map(d => d.label);
  const n = keys.length;
  const cx = size / 2, cy = size / 2;
  const r = size * 0.36;
  const labelR = size * 0.48;

  function polar(angle, radius) {
    return [
      cx + Math.cos(angle - Math.PI / 2) * radius,
      cy + Math.sin(angle - Math.PI / 2) * radius,
    ];
  }

  const angles = keys.map((_, i) => (2 * Math.PI * i) / n);
  const dataPoints = keys.map((k, i) => polar(angles[i], r * ((scores[k] ?? 0) / 10)));
  const bgPoints   = keys.map((_, i) => polar(angles[i], r));
  const labelPoints = angles.map((a) => polar(a, labelR));

  const toPath = pts => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + " Z";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow:"visible" }}>
      {[0.25, 0.5, 0.75, 1].map(scale => (
        <polygon key={scale}
          points={bgPoints.map(p => {
            const [bx, by] = p;
            return [cx + (bx - cx) * scale, cy + (by - cy) * scale].join(",");
          }).join(" ")}
          fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={0.8} />
      ))}
      {angles.map((a, i) => {
        const [x, y] = polar(a, r);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,.08)" strokeWidth={0.8} />;
      })}
      <path d={toPath(dataPoints)} fill={color + "28"} stroke={color} strokeWidth={2} />
      {labelPoints.map(([lx, ly], i) => (
        <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
          fontSize={10} fill="#94a3b8">{labels[i]}</text>
      ))}
    </svg>
  );
}

function TeamCard({ team, isSelected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding:"12px", borderRadius:10,
        background: isSelected ? `${team.renk}18` : "rgba(255,255,255,.03)",
        border: `2px solid ${isSelected ? team.renk : "rgba(255,255,255,.08)"}`,
        cursor:"pointer", transition:"all .2s",
        display:"flex", flexDirection:"column", alignItems:"center", gap:8,
      }}
    >
      <div style={{ fontSize:24 }}>{fl(team.milliyet)}</div>
      <MiniRadar scores={team.scores} color={team.renk} size={70} />
      <div style={{ fontSize:11, color:"#e2e8f0", fontWeight:600, textAlign:"center", lineHeight:1.3 }}>
        {team.milliyet}
      </div>
      <div style={{
        fontSize:10, color: team.renk, fontWeight:700,
        background: team.renk + "22", borderRadius:99,
        padding:"2px 8px",
      }}>
        {team.arketip}
      </div>
    </div>
  );
}

function CompatibilityScore({ teamA, teamB }) {
  // Uyumluluk: zıt stiller → ilginç maç, benzer → sıkıcı maç olabilir
  // Basit: norm farkı
  const keys = DIMS.map(d => d.key);
  const diff = keys.reduce((acc, k) => acc + Math.abs((teamA.scores[k]??0) - (teamB.scores[k]??0)), 0);
  const maxDiff = keys.length * 10;
  const clash = Math.round(diff / maxDiff * 100);

  let label, color;
  if (clash >= 60) { label = "⚡ Patlayıcı Çatışma"; color = "#f97316"; }
  else if (clash >= 35) { label = "🔥 Taktiksel Savaş"; color = "#f59e0b"; }
  else { label = "🧩 Dengeli Mücadele"; color = "#22c55e"; }

  return (
    <div style={{
      textAlign:"center", padding:"16px",
      background:"rgba(255,255,255,.04)", borderRadius:12,
      border:"1px solid rgba(255,255,255,.08)",
    }}>
      <div style={{ fontSize:12, color:"#64748b", letterSpacing:1, marginBottom:8 }}>TAKTİKSEL ÇATIŞMA SKORU</div>
      <div style={{ fontSize:36, fontWeight:900, color }}>%{clash}</div>
      <div style={{ fontSize:13, color, fontWeight:700, marginTop:4 }}>{label}</div>
    </div>
  );
}

export default function TacticalDnaPage() {
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [selA, setSelA] = useState(null);
  const [selB, setSelB] = useState(null);
  const [tab, setTab] = useState("compare"); // "compare" | "all"

  const { data: allTeams = [], isLoading } = useQuery({
    queryKey: ["tactical-dna"],
    queryFn: () => fetch(`${API}/tactical-dna`).then(r => r.json()),
  });

  const filtered = useMemo(() => {
    const q = tab === "compare" ? "" : "";
    return allTeams;
  }, [allTeams]);

  const filteredA = useMemo(() =>
    allTeams.filter(t => t.milliyet.toLowerCase().includes(searchA.toLowerCase())),
    [allTeams, searchA]);

  const filteredB = useMemo(() =>
    allTeams.filter(t => t.milliyet.toLowerCase().includes(searchB.toLowerCase())),
    [allTeams, searchB]);

  const S = {
    page: { minHeight:"100vh", padding:"24px 16px 100px", maxWidth:800, margin:"0 auto" },
    h1:   { fontSize:26, fontWeight:800, color:"#f1f5f9", marginBottom:6 },
    sub:  { fontSize:14, color:"#64748b", marginBottom:28 },
    tabs: { display:"flex", gap:8, marginBottom:24 },
    tab:  (active) => ({
      padding:"8px 18px", borderRadius:99, border:"none", cursor:"pointer",
      background: active ? "#f59e0b" : "rgba(255,255,255,.06)",
      color: active ? "#0f172a" : "#94a3b8",
      fontWeight:700, fontSize:13,
    }),
    card: { background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.08)", borderRadius:14, padding:20, marginBottom:20 },
    cardTitle: { fontSize:13, fontWeight:700, color:"#64748b", letterSpacing:1, textTransform:"uppercase", marginBottom:14 },
    input: {
      width:"100%", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)",
      borderRadius:8, padding:"8px 12px", color:"#f1f5f9", fontSize:13, outline:"none",
      marginBottom:10,
    },
  };

  const archetypeCounts = useMemo(() => {
    const counts = {};
    allTeams.forEach(t => {
      counts[t.arketip] = (counts[t.arketip] || 0) + 1;
    });
    return Object.entries(counts).sort((a,b) => b[1]-a[1]);
  }, [allTeams]);

  return (
    <div style={S.page}>
      <div style={S.h1}>🧬 Taktiksel DNA</div>
      <div style={S.sub}>Oyuncu verilerinden türetilmiş milli takım oyun stilleri</div>

      <div style={S.tabs}>
        <button style={S.tab(tab==="compare")} onClick={() => setTab("compare")}>⚔️ Karşılaştır</button>
        <button style={S.tab(tab==="all")}     onClick={() => setTab("all")}>🌍 Tüm Takımlar</button>
      </div>

      {tab === "compare" && (
        <>
          {/* İki takım seç */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
            {/* Takım A */}
            <div style={S.card}>
              <div style={S.cardTitle}>Takım A</div>
              <input
                style={S.input}
                placeholder="Ülke ara…"
                value={searchA}
                onChange={e => { setSearchA(e.target.value); setSelA(null); }}
              />
              {!selA && filteredA.slice(0,6).map(t => (
                <div key={t.milliyet}
                  onClick={() => { setSelA(t); setSearchA(t.milliyet); }}
                  style={{
                    padding:"8px 10px", borderRadius:8, cursor:"pointer",
                    background:"rgba(255,255,255,.04)", marginBottom:4,
                    display:"flex", alignItems:"center", gap:8,
                    border:"1px solid rgba(255,255,255,.07)",
                  }}>
                  <span style={{ fontSize:18 }}>{fl(t.milliyet)}</span>
                  <span style={{ fontSize:13, color:"#e2e8f0" }}>{t.milliyet}</span>
                  <span style={{ fontSize:10, color:t.renk, marginLeft:"auto" }}>{t.arketip}</span>
                </div>
              ))}
              {selA && (
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:32 }}>{fl(selA.milliyet)}</div>
                  <FullRadar scores={selA.scores} color={selA.renk} size={200} />
                  <div style={{ fontSize:13, color:selA.renk, fontWeight:700, marginTop:8 }}>{selA.arketip}</div>
                </div>
              )}
            </div>

            {/* Takım B */}
            <div style={S.card}>
              <div style={S.cardTitle}>Takım B</div>
              <input
                style={S.input}
                placeholder="Ülke ara…"
                value={searchB}
                onChange={e => { setSearchB(e.target.value); setSelB(null); }}
              />
              {!selB && filteredB.slice(0,6).map(t => (
                <div key={t.milliyet}
                  onClick={() => { setSelB(t); setSearchB(t.milliyet); }}
                  style={{
                    padding:"8px 10px", borderRadius:8, cursor:"pointer",
                    background:"rgba(255,255,255,.04)", marginBottom:4,
                    display:"flex", alignItems:"center", gap:8,
                    border:"1px solid rgba(255,255,255,.07)",
                  }}>
                  <span style={{ fontSize:18 }}>{fl(t.milliyet)}</span>
                  <span style={{ fontSize:13, color:"#e2e8f0" }}>{t.milliyet}</span>
                  <span style={{ fontSize:10, color:t.renk, marginLeft:"auto" }}>{t.arketip}</span>
                </div>
              ))}
              {selB && (
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:32 }}>{fl(selB.milliyet)}</div>
                  <FullRadar scores={selB.scores} color={selB.renk} size={200} />
                  <div style={{ fontSize:13, color:selB.renk, fontWeight:700, marginTop:8 }}>{selB.arketip}</div>
                </div>
              )}
            </div>
          </div>

          {selA && selB && (
            <>
              <CompatibilityScore teamA={selA} teamB={selB} />
              <div style={{ ...S.card, marginTop:16 }}>
                <div style={S.cardTitle}>📊 Boyut Karşılaştırması</div>
                {DIMS.map(dim => {
                  const va = selA.scores[dim.key] ?? 0;
                  const vb = selB.scores[dim.key] ?? 0;
                  const maxV = Math.max(va, vb, 1);
                  return (
                    <div key={dim.key} style={{ marginBottom:14 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                        <span style={{ fontSize:12, color:"#94a3b8" }}>{dim.label}</span>
                        <span style={{ fontSize:11, color:"#475569" }}>{dim.desc}</span>
                      </div>
                      <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                        {/* A bar (RTL) */}
                        <span style={{ fontSize:11, color:"#94a3b8", minWidth:24, textAlign:"right" }}>{va}</span>
                        <div style={{ flex:1, height:8, borderRadius:99, background:"rgba(255,255,255,.05)", overflow:"hidden", transform:"scaleX(-1)" }}>
                          <div style={{ width:`${va/10*100}%`, height:"100%", background:selA.renk, borderRadius:99 }} />
                        </div>
                        <div style={{ width:2, height:16, background:"rgba(255,255,255,.15)", flexShrink:0 }} />
                        <div style={{ flex:1, height:8, borderRadius:99, background:"rgba(255,255,255,.05)", overflow:"hidden" }}>
                          <div style={{ width:`${vb/10*100}%`, height:"100%", background:selB.renk, borderRadius:99 }} />
                        </div>
                        <span style={{ fontSize:11, color:"#94a3b8", minWidth:24 }}>{vb}</span>
                      </div>
                    </div>
                  );
                })}
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, fontSize:12, color:"#475569" }}>
                  <span style={{ color:selA.renk }}>{fl(selA.milliyet)} {selA.milliyet}</span>
                  <span style={{ color:selB.renk }}>{selB.milliyet} {fl(selB.milliyet)}</span>
                </div>
              </div>
            </>
          )}

          {!selA && !selB && (
            <div style={{ textAlign:"center", padding:"40px 0", color:"#475569" }}>
              <div style={{ fontSize:48, marginBottom:12 }}>🧬</div>
              <div style={{ fontSize:16, color:"#94a3b8" }}>İki takım seç ve taktik DNA'larını karşılaştır</div>
            </div>
          )}
        </>
      )}

      {tab === "all" && (
        <>
          {/* Arketip dağılımı */}
          <div style={{ ...S.card, marginBottom:20 }}>
            <div style={S.cardTitle}>🏷️ Oyun Stili Dağılımı</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {archetypeCounts.map(([ark, cnt]) => (
                <div key={ark} style={{
                  padding:"6px 12px", borderRadius:99,
                  background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)",
                  fontSize:13, color:"#e2e8f0",
                }}>
                  {ark} <span style={{ color:"#f59e0b", fontWeight:700 }}>×{cnt}</span>
                </div>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div style={{ textAlign:"center", padding:40, color:"#64748b" }}>Yükleniyor…</div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))", gap:10 }}>
              {allTeams.map(t => (
                <TeamCard
                  key={t.milliyet}
                  team={t}
                  isSelected={selA?.milliyet === t.milliyet || selB?.milliyet === t.milliyet}
                  onClick={() => {
                    if (!selA) { setSelA(t); setSearchA(t.milliyet); setTab("compare"); }
                    else if (!selB && selA.milliyet !== t.milliyet) { setSelB(t); setSearchB(t.milliyet); setTab("compare"); }
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
