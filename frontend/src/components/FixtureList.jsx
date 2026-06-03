/**
 * FixtureList — WC2026 fikstür takvimi
 * /fixtures endpoint'inden veri çeker, tarihe göre gruplar.
 */
import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import H2HPanel from "./H2HPanel.jsx";

const GRP_COLOR = {
  A:"#f97316", B:"#38bdf8", C:"#10b981", D:"#a78bfa",
  E:"#f59e0b", F:"#ef4444", G:"#06b6d4", H:"#84cc16",
  I:"#ec4899", J:"#6366f1", K:"#14b8a6", L:"#fb923c",
};

const FLAGS = {
  // İngilizce
  "Argentina":"🇦🇷","Australia":"🇦🇺","Belgium":"🇧🇪","Brazil":"🇧🇷",
  "Canada":"🇨🇦","Chile":"🇨🇱","China":"🇨🇳","Colombia":"🇨🇴",
  "Croatia":"🇭🇷","Denmark":"🇩🇰","Ecuador":"🇪🇨","England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "France":"🇫🇷","Germany":"🇩🇪","Hungary":"🇭🇺","Iran":"🇮🇷",
  "Iraq":"🇮🇶","Ireland":"🇮🇪","Italy":"🇮🇹","Japan":"🇯🇵",
  "Kazakhstan":"🇰🇿","Mexico":"🇲🇽","Morocco":"🇲🇦","Netherlands":"🇳🇱",
  "New Zealand":"🇳🇿","Nigeria":"🇳🇬","Panama":"🇵🇦","Poland":"🇵🇱",
  "Portugal":"🇵🇹","Romania":"🇷🇴","Saudi Arabia":"🇸🇦","Scotland":"🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "Senegal":"🇸🇳","Serbia":"🇷🇸","Slovenia":"🇸🇮","South Africa":"🇿🇦",
  "South Korea":"🇰🇷","Spain":"🇪🇸","Switzerland":"🇨🇭","Turkey":"🇹🇷",
  "Ukraine":"🇺🇦","United States":"🇺🇸","Uruguay":"🇺🇾","Venezuela":"🇻🇪",
  "Algeria":"🇩🇿","Cameroon":"🇨🇲","Bolivia":"🇧🇴","Finland":"🇫🇮",
  // Türkçe
  "ABD":"🇺🇸","Almanya":"🇩🇪","Arjantin":"🇦🇷","Avustralya":"🇦🇺",
  "Avusturya":"🇦🇹","Belçika":"🇧🇪","Bolivya":"🇧🇴","Brezilya":"🇧🇷",
  "Cezayir":"🇩🇿","Çin":"🇨🇳","Danimarka":"🇩🇰","Ekvador":"🇪🇨",
  "Fas":"🇲🇦","Finlandiya":"🇫🇮","Fransa":"🇫🇷","Güney Afrika":"🇿🇦",
  "Güney Kore":"🇰🇷","Hollanda":"🇳🇱","Hırvatistan":"🇭🇷","Irak":"🇮🇶",
  "İngiltere":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","İran":"🇮🇷","İrlanda":"🇮🇪","İskoçya":"🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "İspanya":"🇪🇸","İsviçre":"🇨🇭","İtalya":"🇮🇹","Japonya":"🇯🇵",
  "Kamerun":"🇨🇲","Kanada":"🇨🇦","Kazakistan":"🇰🇿","Kolombiya":"🇨🇴",
  "Meksika":"🇲🇽","Mısır":"🇪🇬","Nijerya":"🇳🇬",
  "Polonya":"🇵🇱","Portekiz":"🇵🇹","S. Arabistan":"🇸🇦",
  "Slovenya":"🇸🇮","Sırbistan":"🇷🇸","Şili":"🇨🇱","Türkiye":"🇹🇷",
  "Ukrayna":"🇺🇦","Yeni Zelanda":"🇳🇿",
  "Arnavutluk":"🇦🇱","Gürcistan":"🇬🇪","Macaristan":"🇭🇺","Romanya":"🇷🇴",
};
const flag = t => FLAGS[t] ?? "🏳️";

// DD.MM.YYYY → "11 Haz · Perşembe"
const TR_MONTHS = ["","Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
const TR_DAYS   = ["Paz","Pzt","Sal","Çar","Per","Cum","Cmt"];
function formatDate(ddmmyyyy) {
  if (!ddmmyyyy) return ddmmyyyy;
  const [dd, mm, yyyy] = ddmmyyyy.split(".");
  const d = new Date(+yyyy, +mm - 1, +dd);
  return `${+dd} ${TR_MONTHS[+mm]} · ${TR_DAYS[d.getDay()]}`;
}

// Türkçe takım isimlerini İngilizce'ye eşle (H2H API İngilizce takım ismi bekler)
const TR_TO_EN = {
  "ABD":"United States","Almanya":"Germany","Arjantin":"Argentina",
  "Avustralya":"Australia","Avusturya":"Austria","Belçika":"Belgium",
  "Bolivya":"Bolivia","Bosna Hersek":"Bosnia-Herzegovina","Brezilya":"Brazil",
  "Cezayir":"Algeria","Çekya":"Czech Republic","Çin":"China",
  "Danimarka":"Denmark","Ekvador":"Ecuador","Fas":"Morocco",
  "Finlandiya":"Finland","Fransa":"France","G.Kore":"South Korea",
  "Gana":"Ghana","Güney Afrika":"South Africa","Güney Kore":"South Korea",
  "Hollanda":"Netherlands","Hırvatistan":"Croatia","Irak":"Iraq",
  "İngiltere":"England","İran":"Iran","İrlanda":"Ireland","İskoçya":"Scotland",
  "İspanya":"Spain","İsviçre":"Switzerland","İtalya":"Italy","Japonya":"Japan",
  "Kamerun":"Cameroon","Kanada":"Canada","Katar":"Qatar",
  "Kazakistan":"Kazakhstan","Kolombiya":"Colombia","Kongo":"DR Congo",
  "Meksika":"Mexico","Mısır":"Egypt","Nijerya":"Nigeria","Norveç":"Norway",
  "Panama":"Panama","Paraguay":"Paraguay","Polonya":"Poland",
  "Portekiz":"Portugal","Romanya":"Romania","S. Arabistan":"Saudi Arabia",
  "Senegal":"Senegal","Slovenya":"Slovenia","Sırbistan":"Serbia",
  "Şili":"Chile","Türkiye":"Turkey","Ukrayna":"Ukraine","Uruguay":"Uruguay",
  "Venezuela":"Venezuela","Yeni Zelanda":"New Zealand","Ürdün":"Jordan",
  "Özbekistan":"Uzbekistan","Curaçao":"Curacao","Fildişi Sahili":"Ivory Coast",
  "Haiti":"Haiti","İsveç":"Sweden","Tunus":"Tunisia","Yeşil Burun":"Cape Verde",
};
const toEn = name => TR_TO_EN[name] || name;

export default function FixtureList() {
  const [fixtures, setFixtures]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [grupFilter, setGrp]      = useState(null); // null = tümü
  const [showAll,  setShowAll]    = useState(false);
  const [openH2H,  setOpenH2H]   = useState(null);  // "ev_takim|dep_takim" key

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

  const displayed = showAll ? filtered : filtered.slice(0, 14);

  // Tarihe göre grupla
  const byDate = {};
  displayed.forEach(f => {
    const d = (f.tarih_tr || "").split(" ")[0] || "—";
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(f);
  });

  return (
    <div style={{ marginBottom: 20 }}>
      {/* ── Başlık ── */}
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
      </div>

      {/* ── Grup filtresi ── */}
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
                cursor:"pointer", transition:"all .15s",
              }}
            >{g ? `Grup ${g}` : "Tümü"}</button>
          );
        })}
      </div>

      {/* ── Fikstür listesi ── */}
      <div style={{
        background:"#ffffff", borderRadius:12,
        border:"1px solid #e2e8f0", overflow:"hidden",
        boxShadow:"0 1px 3px rgba(0,0,0,.06)",
      }}>
        {Object.entries(byDate).map(([date, matches], di) => (
          <div key={date}>
            {/* Tarih başlığı */}
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
              const gc     = GRP_COLOR[f.grup] ?? "#38bdf8";
              const time   = (f.tarih_tr || "").split(" ")[1] ?? "";
              const played = f.ev_gol !== null && f.dep_gol !== null;
              const h2hKey = `${f.ev_takim}|${f.dep_takim}`;
              const h2hOpen = openH2H === h2hKey;

              return (
                <div key={f.id}>
                  {/* Maç satırı */}
                  <div
                    onClick={() => setOpenH2H(h2hOpen ? null : h2hKey)}
                    style={{
                      display:"flex", alignItems:"center", gap:8,
                      padding:"9px 14px",
                      borderBottom: (!h2hOpen && i < matches.length - 1) ? "1px solid #f1f5f9" : "none",
                      borderLeft: `3px solid ${gc}`,
                      cursor:"pointer",
                      background: h2hOpen ? "#fefce8" : "transparent",
                      transition:"background .15s",
                    }}
                  >
                    {/* Grup etiketi */}
                    {f.grup && (
                      <span style={{
                        fontSize:9, fontWeight:900, minWidth:28, textAlign:"center",
                        padding:"2px 4px", borderRadius:4,
                        background: gc + "15", color: gc,
                        border:`1px solid ${gc}30`, flexShrink:0,
                      }}>G{f.grup}</span>
                    )}

                    {/* Ev sahibi */}
                    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"flex-end", gap:5, minWidth:0 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:"#0f172a", textAlign:"right",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {f.ev_takim}
                      </span>
                      <span style={{ fontSize:18, flexShrink:0 }}>{flag(f.ev_takim)}</span>
                    </div>

                    {/* Skor / saat */}
                    <div style={{ textAlign:"center", minWidth:58, flexShrink:0 }}>
                      {played ? (
                        <span style={{
                          fontSize:15, fontWeight:900, color:"#0f172a",
                          background:"#f1f5f9", padding:"2px 8px", borderRadius:6,
                        }}>
                          {f.ev_gol} – {f.dep_gol}
                        </span>
                      ) : (
                        <span style={{ fontSize:11, fontWeight:700, color:"#94a3b8" }}>
                          {time || "vs"}
                        </span>
                      )}
                    </div>

                    {/* Deplasman */}
                    <div style={{ flex:1, display:"flex", alignItems:"center", gap:5, minWidth:0 }}>
                      <span style={{ fontSize:18, flexShrink:0 }}>{flag(f.dep_takim)}</span>
                      <span style={{ fontSize:12, fontWeight:600, color:"#0f172a",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {f.dep_takim}
                      </span>
                    </div>

                    {/* Stadyum + H2H toggle */}
                    <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                      {f.stadyum_sehir && (
                        <span style={{
                          fontSize:9, color:"#94a3b8",
                          textAlign:"right", maxWidth:76,
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                          display: "none",
                        }}
                        className="hh-fixture-stadium">
                          📍{f.stadyum_sehir}
                        </span>
                      )}
                      <span style={{
                        fontSize:9, color: h2hOpen ? "#d97706" : "#94a3b8",
                        fontWeight:700, flexShrink:0,
                      }}>⚔️</span>
                    </div>
                  </div>

                  {/* H2H genişletme paneli */}
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

      {/* Daha fazla göster */}
      {!showAll && filtered.length > 14 && (
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
          + {filtered.length - 14} maç daha ▼
        </button>
      )}

      <style>{`
        @media(min-width:520px){ .hh-fixture-stadium{ display:block !important; } }
      `}</style>
    </div>
  );
}
