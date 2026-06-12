/**
 * FixtureList — WC2026 fikstür takvimi
 * - TR saati gösterimi (Europe/Istanbul, tarih_tr API'den geliyor)
 * - Her maç için canlı geri sayım
 * - Takım adına tıklayınca oyuncu kadrosu açılır
 */
import { useEffect, useState, useRef } from "react";
import { api } from "../services/api.js";
import H2HPanel from "./H2HPanel.jsx";

// ─── Stadyum mini kartı (fikstür satırı genişlediğinde) ────────────────────
function VenuePanel({ f }) {
  if (!f.stadyum_isim) return (
    <div style={{ padding: "10px 14px", color: "#94a3b8", fontSize: 11 }}>
      🏟️ Stadyum bilgisi henüz mevcut değil.
    </div>
  );

  const rakim = f.stadyum_rakim;
  const altColor = rakim >= 2000 ? "#dc2626" : rakim >= 1000 ? "#ea580c" : rakim >= 400 ? "#f59e0b" : "#10b981";
  const altLabel = rakim >= 2000 ? "⚡ EKSTrem" : rakim >= 1000 ? "🏔️ Yüksek" : rakim >= 400 ? "⛰️ Orta" : "🌊 Deniz seviyesi";
  const irtifaOxygen = rakim ? Math.max(0, 100 - Math.round(rakim / 1000 * 10)) : null;

  return (
    <div style={{ padding: "10px 14px 14px" }}>
      {/* Stadyum başlık */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>🏟️</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>{f.stadyum_isim}</div>
          <div style={{ fontSize: 10, color: "#64748b" }}>
            📍 {f.stadyum_sehir} · {f.stadyum_ulke}
          </div>
        </div>
      </div>

      {/* Metrikler grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
        {/* Kapasite */}
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Kapasite</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a" }}>
            {f.stadyum_kapasite ? f.stadyum_kapasite.toLocaleString("tr-TR") : "—"}
          </div>
          <div style={{ height: 3, background: "#f1f5f9", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100,(f.stadyum_kapasite/92000)*100)}%`, height: "100%", background: "#3b82f6", borderRadius: 2 }} />
          </div>
        </div>

        {/* Rakım */}
        <div style={{ background: rakim >= 1000 ? "#fff7ed" : "#f8fafc", border: `1px solid ${rakim >= 1000 ? "#fed7aa" : "#e2e8f0"}`, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Rakım</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: altColor }}>
            {rakim != null ? `${rakim} m` : "—"}
          </div>
          <div style={{ fontSize: 9, color: altColor, fontWeight: 700 }}>{altLabel}</div>
        </div>

        {/* Zemin */}
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Zemin</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
            {f.stadyum_cim_turu === "Doğal" ? "🌿" : f.stadyum_cim_turu === "Yapay" ? "🟩" : "🍀"}
          </div>
          <div style={{ fontSize: 10, color: "#475569", fontWeight: 600 }}>{f.stadyum_cim_turu ?? "—"}</div>
        </div>
      </div>

      {/* İkinci satır: boyut + çerçeve + kuruluş */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: rakim >= 1000 ? 10 : 0 }}>
        {f.stadyum_cerceve && (
          <span style={chip}>{f.stadyum_cerceve === "Açık" ? "☀️" : "🏛️"} {f.stadyum_cerceve}</span>
        )}
        {f.stadyum_boyut && (
          <span style={chip}>📐 {f.stadyum_boyut}</span>
        )}
        {f.stadyum_acilis_yili && (
          <span style={chip}>🏗️ {f.stadyum_acilis_yili}</span>
        )}
        {irtifaOxygen !== null && rakim >= 500 && (
          <span style={{ ...chip, background: "#fff7ed", color: "#ea580c", borderColor: "#fed7aa" }}>
            💨 Oksijen ~{irtifaOxygen}%
          </span>
        )}
      </div>

      {/* Yüksek irtifa uyarı */}
      {rakim >= 1000 && (
        <div style={{
          padding: "8px 10px",
          background: "#fff7ed", border: "1px solid #fed7aa",
          borderRadius: 8, fontSize: 11, color: "#92400e", lineHeight: 1.5,
        }}>
          {rakim >= 2000
            ? "⚡ Ekstrem irtifa! Oksijen yaklaşık %22 daha az. İrtifaya alışık olmayan takımlar büyük dezavantajla karşılaşır."
            : "⛰️ Yüksek irtifa etkisi var. İrtifaya adapte millî takımlar avantajlı olabilir."}
        </div>
      )}

      {/* Harita linki */}
      {f.stadyum_lat && f.stadyum_lon && (
        <a
          href={`https://www.google.com/maps?q=${f.stadyum_lat},${f.stadyum_lon}`}
          target="_blank" rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            marginTop: 8, fontSize: 10, color: "#38bdf8", textDecoration: "none", fontWeight: 600,
          }}
        >🗺️ Haritada gör →</a>
      )}
    </div>
  );
}

const chip = {
  display: "inline-flex", alignItems: "center", gap: 3,
  fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 5,
  background: "#f1f5f9", color: "#475569",
  border: "1px solid #e2e8f0",
};

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
  const [fixtures,   setFixtures]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [grupFilter, setGrp]        = useState(null);
  const [showAll,    setShowAll]    = useState(false);
  const [openH2H,    setOpenH2H]   = useState(null);
  const [openVenue,  setOpenVenue]  = useState(null); // fixture id
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
              // Biten maç: durum "programlı"/"TIMED" değilse VEYA skor girilmişse
              const hasScore  = f.ev_gol !== null && f.ev_gol !== undefined && f.dep_gol !== null && f.dep_gol !== undefined;
              const played    = hasScore || (f.durum && f.durum !== "programlı" && f.durum !== "TIMED" && f.durum !== "");
              const cdStr     = !played ? countdownStr(f.tarih_utc, now) : null;
              const h2hKey    = `${f.ev_takim}|${f.dep_takim}`;
              const h2hOpen   = openH2H === h2hKey;
              const venueOpen = openVenue === f.id;
              // Canlı: oynamaya başlamış ama durum henüz "bitti" değil, skor girilmemiş
              const isLive    = !played && cdStr === null && f.tarih_utc;

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
                          fontSize:16, fontWeight:900, color:"var(--text)",
                          background:"var(--surface-2)", padding:"3px 10px", borderRadius:6,
                          border:"1px solid var(--border)",
                        }}>
                          {f.ev_gol} – {f.dep_gol}
                        </span>
                      ) : (
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                          <span style={{ fontSize:12, fontWeight:800, color:"var(--text)" }}>
                            {time || "–:–"}
                          </span>
                          {cdStr && (
                            <span style={{
                              fontSize:10, fontWeight:700, color:"var(--gold)",
                              background:"rgba(245,166,35,.12)", padding:"2px 6px", borderRadius:4,
                              border:"1px solid rgba(245,166,35,.25)",
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

                    {/* Stadyum + H2H ikonları */}
                    <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
                      {/* Stadyum ikonu */}
                      <span
                        onClick={() => {
                          setOpenVenue(venueOpen ? null : f.id);
                          if (!venueOpen) setOpenH2H(null);
                        }}
                        style={{
                          fontSize: 13,
                          cursor: "pointer",
                          opacity: f.stadyum_isim ? 1 : 0.3,
                          filter: venueOpen ? "none" : "grayscale(60%)",
                          title: "Stadyum detayı",
                        }}
                        title="Stadyum detayı"
                      >🏟️</span>
                      {/* H2H */}
                      <span
                        onClick={() => {
                          setOpenH2H(h2hOpen ? null : h2hKey);
                          if (!h2hOpen) setOpenVenue(null);
                        }}
                        style={{ fontSize:10, color: h2hOpen ? "#d97706" : "#cbd5e1", cursor:"pointer" }}
                        title="H2H geçmiş"
                      >⚔️</span>
                    </div>
                  </div>

                  {/* Venue paneli */}
                  {venueOpen && (
                    <div style={{
                      background: "#fff8f0",
                      borderBottom: i < matches.length - 1 ? "1px solid #f1f5f9" : "none",
                      borderTop: "1px solid #fed7aa",
                    }}>
                      <VenuePanel f={f} />
                    </div>
                  )}

                  {/* H2H paneli */}
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
