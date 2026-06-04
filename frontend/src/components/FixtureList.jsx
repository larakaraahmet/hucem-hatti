/**
 * FixtureList — WC2026 fikstür takvimi
 * - TR saati gösterimi (Europe/Istanbul, tarih_tr API'den geliyor)
 * - Her maç için canlı geri sayım
 * - Takım adına tıklayınca oyuncu kadrosu açılır
 */
import { useEffect, useState, useRef } from "react";
import { api } from "../services/api.js";
import H2HPanel from "./H2HPanel.jsx";

const GRP_COLOR = {
  A:"#f97316", B:"#38bdf8", C:"#10b981", D:"#a78bfa",
  E:"#f59e0b", F:"#ef4444", G:"#06b6d4", H:"#84cc16",
  I:"#ec4899", J:"#6366f1", K:"#14b8a6", L:"#fb923c",
};

const FLAGS = {
  // Türkçe isimler (API'den gelenler)
  "ABD":"🇺🇸","Almanya":"🇩🇪","Arjantin":"🇦🇷","Avustralya":"🇦🇺",
  "Avusturya":"🇦🇹","Belçika":"🇧🇪","Brezilya":"🇧🇷",
  "Cezayir":"🇩🇿","Çekya":"🇨🇿","Ekvador":"🇪🇨",
  "Fas":"🇲🇦","Fransa":"🇫🇷","Gana":"🇬🇭","Güney Afrika":"🇿🇦",
  "G.Kore":"🇰🇷","Güney Kore":"🇰🇷","Hollanda":"🇳🇱","Hırvatistan":"🇭🇷",
  "Irak":"🇮🇶","İngiltere":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","İran":"🇮🇷","İskoçya":"🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "İspanya":"🇪🇸","İsviçre":"🇨🇭","İsveç":"🇸🇪","Japonya":"🇯🇵",
  "Kanada":"🇨🇦","Katar":"🇶🇦","Kolombiya":"🇨🇴","Kongo":"🇨🇩",
  "Meksika":"🇲🇽","Mısır":"🇪🇬","Norveç":"🇳🇴",
  "Panama":"🇵🇦","Paraguay":"🇵🇾","Portekiz":"🇵🇹",
  "S. Arabistan":"🇸🇦","Senegal":"🇸🇳","Tunus":"🇹🇳","Türkiye":"🇹🇷",
  "Uruguay":"🇺🇾","Ürdün":"🇯🇴","Yeni Zelanda":"🇳🇿",
  "Özbekistan":"🇺🇿","Curaçao":"🇨🇼","Fildişi Sahili":"🇨🇮",
  "Haiti":"🇭🇹","İsveç":"🇸🇪","Yeşil Burun":"🇨🇻",
  "Bosna Hersek":"🇧🇦","İskoçya":"🏴󠁧󠁢󠁳󠁣󠁴󠁿","Çekya":"🇨🇿",
  "Kongo DR":"🇨🇩","Kongo D.C.":"🇨🇩",
  // İngilizce isimler
  "Algeria":"🇩🇿","Argentina":"🇦🇷","Australia":"🇦🇺","Austria":"🇦🇹",
  "Belgium":"🇧🇪","Bosnia and Herzegovina":"🇧🇦","Brazil":"🇧🇷",
  "Canada":"🇨🇦","Cape Verde Islands":"🇨🇻","Colombia":"🇨🇴",
  "Congo DR":"🇨🇩","Croatia":"🇭🇷","Curaçao":"🇨🇼",
  "Czech Republic":"🇨🇿","Ecuador":"🇪🇨","Egypt":"🇪🇬",
  "England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","France":"🇫🇷","Germany":"🇩🇪","Ghana":"🇬🇭",
  "Haiti":"🇭🇹","Iran":"🇮🇷","Iraq":"🇮🇶","Ivory Coast":"🇨🇮",
  "Japan":"🇯🇵","Jordan":"🇯🇴","Mexico":"🇲🇽","Morocco":"🇲🇦",
  "Netherlands":"🇳🇱","New Zealand":"🇳🇿","Norway":"🇳🇴",
  "Panama":"🇵🇦","Paraguay":"🇵🇾","Portugal":"🇵🇹","Qatar":"🇶🇦",
  "Saudi Arabia":"🇸🇦","Scotland":"🏴󠁧󠁢󠁳󠁣󠁴󠁿","Senegal":"🇸🇳",
  "South Africa":"🇿🇦","South Korea":"🇰🇷","Spain":"🇪🇸",
  "Sweden":"🇸🇪","Switzerland":"🇨🇭","Tunisia":"🇹🇳","Turkey":"🇹🇷",
  "United States":"🇺🇸","Uruguay":"🇺🇾","Uzbekistan":"🇺🇿",
};
const flag = t => FLAGS[t] ?? "🏳️";

// Türkçe addan İngilizce ada (DB'deki milliyet alanı için)
const TR_TO_EN = {
  "ABD":"United States","Almanya":"Germany","Arjantin":"Argentina",
  "Avustralya":"Australia","Avusturya":"Austria","Belçika":"Belgium",
  "Bosna Hersek":"Bosnia and Herzegovina","Brezilya":"Brazil",
  "Cezayir":"Algeria","Çekya":"Czech Republic","Curaçao":"Curaçao",
  "Ekvador":"Ecuador","Fas":"Morocco","Fildişi Sahili":"Ivory Coast",
  "Fransa":"France","Gana":"Ghana","G.Kore":"South Korea",
  "Güney Afrika":"South Africa","Güney Kore":"South Korea",
  "Haiti":"Haiti","Hollanda":"Netherlands","Hırvatistan":"Croatia",
  "Irak":"Iraq","İngiltere":"England","İran":"Iran",
  "İskoçya":"Scotland","İspanya":"Spain","İsveç":"Sweden","İsviçre":"Switzerland",
  "Japonya":"Japan","Kanada":"Canada","Katar":"Qatar",
  "Kolombiya":"Colombia","Kongo DR":"Congo DR",
  "Meksika":"Mexico","Mısır":"Egypt","Norveç":"Norway",
  "Panama":"Panama","Paraguay":"Paraguay","Portekiz":"Portugal",
  "S. Arabistan":"Saudi Arabia","Senegal":"Senegal","Tunus":"Tunisia",
  "Türkiye":"Turkey","Uruguay":"Uruguay","Ürdün":"Jordan",
  "Yeni Zelanda":"New Zealand","Özbekistan":"Uzbekistan",
  "Yeşil Burun":"Cape Verde Islands",
};
const toEn = name => TR_TO_EN[name] || name;

const TR_MONTHS = ["","Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
const TR_DAYS   = ["Paz","Pzt","Sal","Çar","Per","Cum","Cmt"];

function formatDate(ddmmyyyy) {
  if (!ddmmyyyy) return ddmmyyyy;
  const [dd, mm, yyyy] = ddmmyyyy.split(".");
  const d = new Date(+yyyy, +mm - 1, +dd);
  return `${+dd} ${TR_MONTHS[+mm]} · ${TR_DAYS[d.getDay()]}`;
}

function useCountdown() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function countdownStr(tarih_utc, now) {
  if (!tarih_utc) return null;
  const match = new Date(tarih_utc);
  const diff = match - now;
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (d > 0) return `${d}g ${h}s`;
  if (h > 0) return `${h}s ${m}d`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function FixtureList({ onTeamClick }) {
  const [fixtures, setFixtures] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [grupFilter, setGrp]    = useState(null);
  const [showAll,  setShowAll]  = useState(false);
  const [openH2H,  setOpenH2H] = useState(null);
  const now = useCountdown();

  useEffect(() => {
    api.getFixtures({ limit: 200 })
      .then(d => { setFixtures(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !fixtures.length) return null;

  const uniqueGroups = [...new Set(fixtures.map(f => f.grup).filter(Boolean))].sort();

  const filtered = grupFilter
    ? fixtures.filter(f => f.grup === grupFilter)
    : fixtures;

  const displayed = showAll ? filtered : filtered.slice(0, 18);

  const byDate = {};
  displayed.forEach(f => {
    const d = (f.tarih_tr || "").split(" ")[0] || "—";
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(f);
  });

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Başlık */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:16 }}>📅</span>
          <span style={{ fontSize:14, fontWeight:800, color:"#0f172a" }}>WC 2026 Fikstür</span>
          <span style={{
            fontSize:10, fontWeight:800,
            background:"#fef3c7", border:"1px solid #fde68a",
            color:"#d97706", padding:"1px 8px", borderRadius:5,
          }}>{fixtures.length} maç</span>
        </div>
        <span style={{ fontSize:10, color:"#94a3b8" }}>🕐 Türkiye saati</span>
      </div>

      {/* Grup filtresi */}
      <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:10 }}>
        {[null, ...uniqueGroups].map(g => {
          const active = grupFilter === g;
          const color  = g ? GRP_COLOR[g] ?? "#38bdf8" : "#0f172a";
          return (
            <button key={g ?? "all"}
              onClick={() => { setGrp(g); setShowAll(false); }}
              style={{
                fontSize:10, fontWeight:800, padding:"3px 9px", borderRadius:5,
                background: active ? color : "#f1f5f9",
                color: active ? "#fff" : "#64748b",
                border:`1px solid ${active ? color : "#e2e8f0"}`,
                cursor:"pointer",
              }}
            >{g ? `Grup ${g}` : "Tümü"}</button>
          );
        })}
      </div>

      {/* Fikstür listesi */}
      <div style={{
        background:"#ffffff", borderRadius:12,
        border:"1px solid #e2e8f0", overflow:"hidden",
        boxShadow:"0 1px 3px rgba(0,0,0,.06)",
      }}>
        {Object.entries(byDate).map(([date, matches], di) => (
          <div key={date}>
            <div style={{
              padding:"6px 14px",
              background:"#f8fafc",
              borderTop: di > 0 ? "1px solid #e2e8f0" : "none",
              borderBottom:"1px solid #e2e8f0",
              fontSize:10, fontWeight:800, color:"#64748b",
              letterSpacing:".07em", textTransform:"uppercase",
            }}>
              {formatDate(date)}
            </div>

            {matches.map((f, i) => {
              const gc      = GRP_COLOR[f.grup] ?? "#38bdf8";
              const time    = (f.tarih_tr || "").split(" ")[1] ?? "";
              const played  = f.durum && f.durum !== "programlı" && f.durum !== "TIMED";
              const cdStr   = !played ? countdownStr(f.tarih_utc, now) : null;
              const h2hKey  = `${f.ev_takim}|${f.dep_takim}`;
              const h2hOpen = openH2H === h2hKey;
              const isLive  = !played && cdStr === null && f.tarih_utc;

              return (
                <div key={f.id}>
                  <div style={{
                    display:"flex", alignItems:"center", gap:8,
                    padding:"10px 14px",
                    borderBottom: (!h2hOpen && i < matches.length - 1) ? "1px solid #f1f5f9" : "none",
                    borderLeft: `3px solid ${gc}`,
                    background: h2hOpen ? "#fefce8" : isLive ? "#fff7ed" : "transparent",
                  }}>
                    {/* Grup */}
                    {f.grup && (
                      <span style={{
                        fontSize:9, fontWeight:900, minWidth:28, textAlign:"center",
                        padding:"2px 4px", borderRadius:4,
                        background: gc + "15", color: gc,
                        border:`1px solid ${gc}30`, flexShrink:0,
                      }}>G{f.grup}</span>
                    )}

                    {/* Ev sahibi */}
                    <div
                      onClick={() => onTeamClick && onTeamClick(toEn(f.ev_takim))}
                      style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"flex-end", gap:5, minWidth:0, cursor: onTeamClick ? "pointer" : "default" }}
                      title={onTeamClick ? `${f.ev_takim} kadrosunu gör` : ""}
                    >
                      <span style={{
                        fontSize:12, fontWeight:700, color:"#0f172a", textAlign:"right",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                      }}>
                        {f.ev_takim}
                      </span>
                      <span style={{ fontSize:20, flexShrink:0, lineHeight:1 }}>{flag(f.ev_takim)}</span>
                    </div>

                    {/* Skor / saat / geri sayım */}
                    <div
                      onClick={() => setOpenH2H(h2hOpen ? null : h2hKey)}
                      style={{ textAlign:"center", minWidth:70, flexShrink:0, cursor:"pointer" }}
                    >
                      {played ? (
                        <span style={{
                          fontSize:16, fontWeight:900, color:"#0f172a",
                          background:"#f1f5f9", padding:"3px 10px", borderRadius:6,
                        }}>
                          {f.ev_gol} – {f.dep_gol}
                        </span>
                      ) : (
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
                          <span style={{ fontSize:12, fontWeight:800, color:"#0f172a" }}>
                            {time || "–:–"}
                          </span>
                          {cdStr && (
                            <span style={{
                              fontSize:9, fontWeight:700, color:"#f59e0b",
                              background:"#fef3c7", padding:"1px 5px", borderRadius:4,
                            }}>⏱ {cdStr}</span>
                          )}
                          {isLive && (
                            <span style={{
                              fontSize:9, fontWeight:800, color:"#ef4444",
                              background:"#fee2e2", padding:"1px 5px", borderRadius:4,
                              animation: "hh-pulse 1s ease-in-out infinite alternate",
                            }}>● CANLI</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Deplasman */}
                    <div
                      onClick={() => onTeamClick && onTeamClick(toEn(f.dep_takim))}
                      style={{ flex:1, display:"flex", alignItems:"center", gap:5, minWidth:0, cursor: onTeamClick ? "pointer" : "default" }}
                      title={onTeamClick ? `${f.dep_takim} kadrosunu gör` : ""}
                    >
                      <span style={{ fontSize:20, flexShrink:0, lineHeight:1 }}>{flag(f.dep_takim)}</span>
                      <span style={{
                        fontSize:12, fontWeight:700, color:"#0f172a",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                      }}>
                        {f.dep_takim}
                      </span>
                    </div>

                    {/* Şehir + H2H */}
                    <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
                      {f.stadyum_sehir && (
                        <span className="hh-fixture-stadium" style={{
                          fontSize:9, color:"#94a3b8", maxWidth:72,
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                          display:"none",
                        }}>📍{f.stadyum_sehir}</span>
                      )}
                      <span
                        onClick={() => setOpenH2H(h2hOpen ? null : h2hKey)}
                        style={{ fontSize:10, color: h2hOpen ? "#d97706" : "#cbd5e1", cursor:"pointer" }}
                        title="H2H geçmiş"
                      >⚔️</span>
                    </div>
                  </div>

                  {h2hOpen && (
                    <div style={{
                      padding:"12px 14px 14px",
                      background:"#fefce8",
                      borderBottom: i < matches.length - 1 ? "1px solid #f1f5f9" : "none",
                    }}>
                      <H2HPanel
                        takim1={toEn(f.ev_takim)}
                        takim2={toEn(f.dep_takim)}
                        takim1Tr={f.ev_takim}
                        takim2Tr={f.dep_takim}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {!showAll && filtered.length > 18 && (
        <button
          onClick={() => setShowAll(true)}
          style={{
            display:"block", width:"100%", marginTop:8,
            padding:"9px", background:"#f8fafc",
            border:"1px solid #e2e8f0", borderRadius:8,
            fontSize:11, fontWeight:700, color:"#64748b",
            cursor:"pointer",
          }}
        >
          + {filtered.length - 18} maç daha ▼
        </button>
      )}

      <style>{`
        @media(min-width:520px){ .hh-fixture-stadium{ display:block !important; } }
        @keyframes hh-pulse { from{opacity:1} to{opacity:.4} }
      `}</style>
    </div>
  );
}
