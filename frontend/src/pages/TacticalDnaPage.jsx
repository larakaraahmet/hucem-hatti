/**
 * Taktiksel DNA — WC 2026 takımlarının oyun stili analizi
 * Premium dark analytics design
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

// ─── Radar SVG ────────────────────────────────────────────────────
function MiniRadar({ scores, color, size = 80 }) {
  const keys = DIMS.map(d => d.key);
  const n = keys.length;
  const cx = size / 2, cy = size / 2;
  const r = size * 0.38;
  const polar = (a, radius) => [cx + Math.cos(a - Math.PI/2)*radius, cy + Math.sin(a - Math.PI/2)*radius];
  const angles = keys.map((_, i) => 2*Math.PI*i/n);
  const data   = keys.map((k, i) => polar(angles[i], r * ((scores[k] ?? 0) / 10)));
  const bg     = keys.map((_, i) => polar(angles[i], r));
  const path   = pts => pts.map((p,i) => `${i?"L":"M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")+" Z";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <polygon points={bg.map(p=>p.join(",")).join(" ")} fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.1)" strokeWidth={0.8}/>
      <path d={path(data)} fill={color+"30"} stroke={color} strokeWidth={1.5}/>
    </svg>
  );
}

function FullRadar({ scores, color, size = 220 }) {
  const keys   = DIMS.map(d => d.key);
  const labels = DIMS.map(d => d.label);
  const n = keys.length;
  const cx = size/2, cy = size/2;
  const r = size*0.34;
  const lr = size*0.47;
  const polar = (a, radius) => [cx + Math.cos(a - Math.PI/2)*radius, cy + Math.sin(a - Math.PI/2)*radius];
  const angles = keys.map((_, i) => 2*Math.PI*i/n);
  const data  = keys.map((k, i) => polar(angles[i], r*((scores[k]??0)/10)));
  const bg    = keys.map((_, i) => polar(angles[i], r));
  const lbls  = angles.map(a => polar(a, lr));
  const path  = pts => pts.map((p,i)=>`${i?"L":"M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")+" Z";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow:"visible" }}>
      {[0.25,0.5,0.75,1].map(s => (
        <polygon key={s}
          points={bg.map(([bx,by])=>[cx+(bx-cx)*s, cy+(by-cy)*s].join(",")).join(" ")}
          fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={0.8}/>
      ))}
      {angles.map((a,i) => {
        const [x,y] = polar(a,r);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,.07)" strokeWidth={0.8}/>;
      })}
      <path d={path(data)} fill={color+"25"} stroke={color} strokeWidth={2}/>
      {lbls.map(([lx,ly],i) => (
        <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
          fontSize={10} fill="#4d6380" fontFamily="Inter,sans-serif">{labels[i]}</text>
      ))}
    </svg>
  );
}

// ─── Components ───────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div style={{
      background:"linear-gradient(160deg,#162840 0%,#0f2035 100%)",
      border:"1px solid rgba(255,255,255,.07)",
      borderRadius:14,
      padding:"18px 20px",
      boxShadow:"0 4px 20px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.04)",
      ...style,
    }}>
      {children}
    </div>
  );
}

function CardTitle({ accent = "#00d65c", children }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:14 }}>
      <div style={{ width:2, height:12, borderRadius:99, background:accent, flexShrink:0 }}/>
      <span style={{ fontSize:9, fontWeight:800, color:"#4d6380", letterSpacing:".12em", textTransform:"uppercase" }}>
        {children}
      </span>
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{
        width:"100%", boxSizing:"border-box",
        background:"rgba(255,255,255,.05)",
        border:"1px solid rgba(255,255,255,.09)",
        borderRadius:8, padding:"9px 12px",
        color:"#eef2f7", fontSize:13, outline:"none",
        marginBottom:10,
        transition:"border-color .15s",
      }}
      onFocus={e => { e.target.style.borderColor = "rgba(245,166,35,.4)"; }}
      onBlur={e =>  { e.target.style.borderColor = "rgba(255,255,255,.09)"; }}
    />
  );
}

function TeamPickRow({ team, onClick }) {
  return (
    <div onClick={onClick} style={{
      display:"flex", alignItems:"center", gap:8,
      padding:"8px 10px", borderRadius:8, cursor:"pointer",
      background:"rgba(255,255,255,.03)",
      border:"1px solid rgba(255,255,255,.06)",
      marginBottom:4, transition:"all .12s",
    }}
    onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,.1)"; }}
    onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,.06)"; }}
    >
      <span style={{ fontSize:18 }}>{fl(team.milliyet)}</span>
      <span style={{ fontSize:12, color:"#eef2f7", flex:1 }}>{team.milliyet}</span>
      <span style={{
        fontSize:9, color:team.renk, fontWeight:800,
        background:team.renk+"18", borderRadius:99, padding:"2px 7px",
      }}>{team.arketip}</span>
    </div>
  );
}

function TeamPanel({ title, accentColor, search, onSearch, selTeam, onClear, candidates }) {
  return (
    <Card>
      <CardTitle accent={accentColor}>{title}</CardTitle>
      <SearchInput
        value={search}
        onChange={e => onSearch(e.target.value)}
        placeholder="Ülke ara…"
      />
      {!selTeam
        ? candidates.slice(0,5).map(t => (
            <TeamPickRow key={t.milliyet} team={t} onClick={() => onClear(t)} />
          ))
        : (
          <div style={{ textAlign:"center" }}>
            <button onClick={() => onClear(null)} style={{
              float:"right",
              background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)",
              borderRadius:6, color:"#4d6380", fontSize:10, padding:"3px 8px", cursor:"pointer",
            }}>✕ Değiştir</button>
            <div style={{ fontSize:36, marginBottom:4 }}>{fl(selTeam.milliyet)}</div>
            <div style={{ fontSize:13, fontWeight:700, color:"#eef2f7", marginBottom:2 }}>{selTeam.milliyet}</div>
            <div style={{
              display:"inline-flex", alignItems:"center", gap:4,
              fontSize:10, fontWeight:800, color:selTeam.renk,
              background:selTeam.renk+"18", borderRadius:99,
              padding:"3px 10px", marginBottom:12,
            }}>{selTeam.arketip}</div>
            <div style={{ display:"flex", justifyContent:"center" }}>
              <FullRadar scores={selTeam.scores} color={selTeam.renk} size={200} />
            </div>
          </div>
        )
      }
    </Card>
  );
}

function CompatibilityScore({ teamA, teamB }) {
  const keys = DIMS.map(d => d.key);
  const diff = keys.reduce((acc, k) => acc + Math.abs((teamA.scores[k]??0)-(teamB.scores[k]??0)), 0);
  const clash = Math.round(diff / (keys.length * 10) * 100);
  let label, color;
  if (clash >= 60) { label = "⚡ Patlayıcı Çatışma"; color = "#f97316"; }
  else if (clash >= 35) { label = "🔥 Taktiksel Savaş"; color = "#f5a623"; }
  else { label = "🧩 Dengeli Mücadele"; color = "#00d65c"; }

  return (
    <div style={{
      textAlign:"center", padding:"20px 16px",
      background:`linear-gradient(160deg,${color}0a 0%,rgba(15,32,53,.6) 100%)`,
      borderRadius:14, border:`1px solid ${color}22`,
      boxShadow:`inset 0 0 30px ${color}08`,
    }}>
      <div style={{ fontSize:9, fontWeight:800, color:"#4d6380", letterSpacing:".14em", marginBottom:8 }}>
        TAKTİKSEL ÇATIŞMA SKORU
      </div>
      <div style={{
        fontSize:"clamp(40px,8vw,60px)", fontWeight:900,
        color, lineHeight:1, letterSpacing:"-2px",
        textShadow:`0 0 30px ${color}50`,
      }}>%{clash}</div>
      <div style={{ fontSize:14, color, fontWeight:700, marginTop:6 }}>{label}</div>
    </div>
  );
}

function DimBar({ dim, va, vb, colorA, colorB }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5,
      }}>
        <span style={{ fontSize:12, fontWeight:600, color:"#7a9bb8" }}>{dim.label}</span>
        <span style={{ fontSize:9, color:"#3d5a78", letterSpacing:".04em" }}>{dim.desc}</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 28px 1fr", gap:6, alignItems:"center" }}>
        {/* A bar (RTL) */}
        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
          <span style={{ fontSize:11, fontWeight:700, color:colorA, minWidth:18, textAlign:"right" }}>{va}</span>
          <div style={{ flex:1, height:5, borderRadius:99, background:"rgba(255,255,255,.05)", overflow:"hidden", transform:"scaleX(-1)" }}>
            <div style={{ width:`${va*10}%`, height:"100%", background:colorA, borderRadius:99,
              boxShadow:`0 0 4px ${colorA}60`, transition:"width .5s" }} />
          </div>
        </div>
        <div style={{ height:14, width:1, background:"rgba(255,255,255,.1)", margin:"0 auto" }} />
        {/* B bar */}
        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
          <div style={{ flex:1, height:5, borderRadius:99, background:"rgba(255,255,255,.05)", overflow:"hidden" }}>
            <div style={{ width:`${vb*10}%`, height:"100%", background:colorB, borderRadius:99,
              boxShadow:`0 0 4px ${colorB}60`, transition:"width .5s" }} />
          </div>
          <span style={{ fontSize:11, fontWeight:700, color:colorB, minWidth:18 }}>{vb}</span>
        </div>
      </div>
    </div>
  );
}

function TeamCard({ team, isSelected, onClick }) {
  return (
    <div onClick={onClick} style={{
      padding:"12px 10px", borderRadius:10,
      background: isSelected ? `${team.renk}18` : "rgba(255,255,255,.03)",
      border:`1px solid ${isSelected ? team.renk + "50" : "rgba(255,255,255,.07)"}`,
      cursor:"pointer", transition:"all .18s",
      display:"flex", flexDirection:"column", alignItems:"center", gap:6,
    }}
    onMouseEnter={e => {
      if (!isSelected) { e.currentTarget.style.background = "rgba(255,255,255,.05)"; e.currentTarget.style.borderColor = "rgba(255,255,255,.12)"; }
    }}
    onMouseLeave={e => {
      if (!isSelected) { e.currentTarget.style.background = "rgba(255,255,255,.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,.07)"; }
    }}>
      <span style={{ fontSize:22 }}>{fl(team.milliyet)}</span>
      <MiniRadar scores={team.scores} color={team.renk} size={68}/>
      <div style={{
        fontSize:10, color:"#eef2f7", fontWeight:600,
        textAlign:"center", lineHeight:1.3,
        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
        maxWidth:"100%",
      }}>{team.milliyet}</div>
      <div style={{
        fontSize:9, color:team.renk, fontWeight:800,
        background:team.renk+"18", borderRadius:99,
        padding:"2px 8px", letterSpacing:".04em",
      }}>{team.arketip}</div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────
export default function TacticalDnaPage() {
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [selA, setSelA] = useState(null);
  const [selB, setSelB] = useState(null);
  const [tab, setTab] = useState("compare");

  const { data: allTeams = [], isLoading } = useQuery({
    queryKey: ["tactical-dna"],
    queryFn: () => fetch(`${API}/tactical-dna`).then(r => r.json()),
  });

  const filteredA = useMemo(() =>
    allTeams.filter(t => t.milliyet.toLowerCase().includes(searchA.toLowerCase())),
    [allTeams, searchA]);

  const filteredB = useMemo(() =>
    allTeams.filter(t => t.milliyet.toLowerCase().includes(searchB.toLowerCase())),
    [allTeams, searchB]);

  const archetypeCounts = useMemo(() => {
    const counts = {};
    allTeams.forEach(t => { counts[t.arketip] = (counts[t.arketip] || 0) + 1; });
    return Object.entries(counts).sort((a,b) => b[1]-a[1]);
  }, [allTeams]);

  return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h2 style={{
          fontSize:"clamp(20px,4vw,28px)", fontWeight:900,
          color:"#eef2f7", letterSpacing:"-.5px", marginBottom:4,
        }}>🧬 Taktiksel DNA</h2>
        <p style={{ fontSize:12, color:"#4d6380", letterSpacing:".02em" }}>
          Oyuncu verileriyle türetilmiş milli takım oyun stilleri · xG · xA · progressive pass
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:20 }}>
        {[
          { key:"compare", label:"⚔️ Karşılaştır" },
          { key:"all",     label:"🌍 Tüm Takımlar" },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding:"8px 16px", borderRadius:99, cursor:"pointer",
            border:`1px solid ${tab===key ? "rgba(245,166,35,.35)" : "rgba(255,255,255,.08)"}`,
            background: tab===key
              ? "linear-gradient(135deg,rgba(245,166,35,.15) 0%,rgba(245,166,35,.07) 100%)"
              : "rgba(255,255,255,.03)",
            color: tab===key ? "#f5a623" : "#4d6380",
            fontSize:12, fontWeight:700,
            boxShadow: tab===key ? "0 0 10px rgba(245,166,35,.12)" : "none",
            transition:"all .18s",
          }}>{label}</button>
        ))}
      </div>

      {/* Compare tab */}
      {tab === "compare" && (
        <>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <TeamPanel
              title="Takım A"
              accentColor="#f5a623"
              search={searchA}
              onSearch={v => { setSearchA(v); setSelA(null); }}
              selTeam={selA}
              onClear={t => { setSelA(t); if (t) setSearchA(t.milliyet); }}
              candidates={filteredA}
            />
            <TeamPanel
              title="Takım B"
              accentColor="#38b2ff"
              search={searchB}
              onSearch={v => { setSearchB(v); setSelB(null); }}
              selTeam={selB}
              onClear={t => { setSelB(t); if (t) setSearchB(t.milliyet); }}
              candidates={filteredB}
            />
          </div>

          {selA && selB && (
            <div style={{ animation:"hh-fadein .3s ease" }}>
              <div style={{ marginBottom:12 }}>
                <CompatibilityScore teamA={selA} teamB={selB} />
              </div>

              <Card>
                <div style={{
                  display:"flex", justifyContent:"space-between", marginBottom:14,
                }}>
                  <CardTitle accent="#00d65c">Boyut Karşılaştırması</CardTitle>
                  <div style={{ display:"flex", gap:16, alignItems:"center" }}>
                    <span style={{ fontSize:11, color:selA.renk, fontWeight:700 }}>
                      {fl(selA.milliyet)} {selA.milliyet}
                    </span>
                    <span style={{ fontSize:11, color:"#3d5a78" }}>vs</span>
                    <span style={{ fontSize:11, color:selB.renk, fontWeight:700 }}>
                      {selB.milliyet} {fl(selB.milliyet)}
                    </span>
                  </div>
                </div>
                {DIMS.map(dim => (
                  <DimBar
                    key={dim.key} dim={dim}
                    va={selA.scores[dim.key] ?? 0}
                    vb={selB.scores[dim.key] ?? 0}
                    colorA={selA.renk}
                    colorB={selB.renk}
                  />
                ))}
              </Card>
            </div>
          )}

          {!selA && !selB && (
            <div style={{ textAlign:"center", padding:"56px 20px", color:"#3d5a78" }}>
              <div style={{ fontSize:52, marginBottom:12,
                animation:"hh-float 3s ease-in-out infinite", display:"inline-block" }}>🧬</div>
              <div style={{ fontSize:16, color:"#4d6380", fontWeight:600, marginBottom:6 }}>
                İki takım seç ve taktik DNA'larını karşılaştır
              </div>
              <div style={{ fontSize:12, color:"#3d5a78", maxWidth:280, margin:"0 auto" }}>
                Saldırı · Yaratıcılık · İlerleme · Şut Kalitesi · Şut Hacmi
              </div>
            </div>
          )}
        </>
      )}

      {/* All teams tab */}
      {tab === "all" && (
        <>
          {/* Archetype distribution */}
          <Card style={{ marginBottom:12 }}>
            <CardTitle accent="#f5a623">Oyun Stili Dağılımı</CardTitle>
            <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
              {archetypeCounts.map(([ark, cnt]) => (
                <div key={ark} style={{
                  display:"flex", alignItems:"center", gap:5,
                  padding:"5px 12px", borderRadius:99,
                  background:"rgba(255,255,255,.04)",
                  border:"1px solid rgba(255,255,255,.07)",
                  fontSize:12, color:"#7a9bb8",
                }}>
                  {ark}
                  <span style={{
                    fontSize:11, fontWeight:800, color:"#f5a623",
                  }}>×{cnt}</span>
                </div>
              ))}
            </div>
          </Card>

          {isLoading ? (
            <div style={{ textAlign:"center", padding:40, color:"#4d6380", fontSize:13 }}>
              <div style={{ fontSize:32, marginBottom:10,
                animation:"spin 1.2s linear infinite", display:"inline-block" }}>⚽</div>
              <div>Yükleniyor…</div>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : (
            <div style={{
              display:"grid",
              gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))",
              gap:8,
            }}>
              {allTeams.map(t => (
                <TeamCard
                  key={t.milliyet}
                  team={t}
                  isSelected={selA?.milliyet===t.milliyet || selB?.milliyet===t.milliyet}
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
