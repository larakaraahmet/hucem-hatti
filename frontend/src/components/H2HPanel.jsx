/**
 * H2HPanel — Gelişmiş H2H: WC + UEFA Euro + gol atanlar
 *
 * Props:
 *   takim1   : string  — İngilizce (API'ye gönderilir)
 *   takim2   : string
 *   takim1Tr : string  — Türkçe görünen isim (opsiyonel)
 *   takim2Tr : string
 */
import { useEffect, useState } from "react";
import { api } from "../services/api.js";

const FLAGS = {
  Algeria:"🇩🇿",Argentina:"🇦🇷",Australia:"🇦🇺",Austria:"🇦🇹",Belgium:"🇧🇪",
  Bolivia:"🇧🇴",Brazil:"🇧🇷","Bosnia-Herzegovina":"🇧🇦",Cameroon:"🇨🇲",
  Canada:"🇨🇦",Chile:"🇨🇱",China:"🇨🇳",Colombia:"🇨🇴",Croatia:"🇭🇷",
  Czechia:"🇨🇿","Czech Republic":"🇨🇿",Denmark:"🇩🇰","DR Congo":"🇨🇩",
  Ecuador:"🇪🇨",Egypt:"🇪🇬",England:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",France:"🇫🇷",Germany:"🇩🇪",
  Ghana:"🇬🇭",Hungary:"🇭🇺",Iran:"🇮🇷",Iraq:"🇮🇶",Ireland:"🇮🇪",
  Italy:"🇮🇹",Japan:"🇯🇵","Ivory Coast":"🇨🇮",Jordan:"🇯🇴",
  Kazakhstan:"🇰🇿",Mexico:"🇲🇽",Morocco:"🇲🇦",Netherlands:"🇳🇱",
  Nigeria:"🇳🇬",Norway:"🇳🇴",Panama:"🇵🇦",Paraguay:"🇵🇾",Poland:"🇵🇱",
  Portugal:"🇵🇹",Qatar:"🇶🇦","Saudi Arabia":"🇸🇦",Scotland:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  Senegal:"🇸🇳",Serbia:"🇷🇸",Slovakia:"🇸🇰",Slovenia:"🇸🇮",
  "South Africa":"🇿🇦","South Korea":"🇰🇷",Spain:"🇪🇸",Sweden:"🇸🇪",
  Switzerland:"🇨🇭",Tunisia:"🇹🇳",Turkey:"🇹🇷",Ukraine:"🇺🇦",
  "United States":"🇺🇸",Uruguay:"🇺🇾",Uzbekistan:"🇺🇿",Venezuela:"🇻🇪",
  "West Germany":"🇩🇪","Soviet Union":"🇷🇺",Yugoslavia:"🇷🇸",
  Czechoslovakia:"🇨🇿","New Zealand":"🇳🇿",
};
const flag = t => FLAGS[t] ?? "🏳️";

// Turnuva kategori rozeti
const TURNUVA_META = {
  "FIFA Dünya Kupası":          { short:"WC",   bg:"#fef3c7", border:"#fde68a", color:"#d97706", icon:"🌍" },
  "UEFA Avrupa Şampiyonası":    { short:"EURO", bg:"#e0f2fe", border:"#bae6fd", color:"#0284c7", icon:"⭐" },
};
function TurnuvaBadge({ kategori }) {
  const m = TURNUVA_META[kategori] || { short:kategori?.slice(0,6), bg:"#f1f5f9", border:"#e2e8f0", color:"#64748b", icon:"🏟️" };
  return (
    <span style={{
      fontSize:8, fontWeight:800, letterSpacing:".06em",
      background:m.bg, border:`1px solid ${m.border}`, color:m.color,
      padding:"1px 5px", borderRadius:4, flexShrink:0,
    }}>{m.icon} {m.short}</span>
  );
}

// Gol atanlar listesi (kompakt)
function GoalList({ goals, color }) {
  if (!goals || !goals.length) return null;
  return (
    <div style={{ marginTop:3 }}>
      {goals.map((g, i) => (
        <span key={i} style={{ fontSize:9, color:"#64748b", marginRight:6 }}>
          <span style={{ color }}>⚽</span> {g.name}
          {g.minute && <span style={{ color:"#94a3b8" }}> {g.minute}'</span>}
          {g.penalty && <span style={{ color:"#f59e0b" }}> (P)</span>}
          {g.owngoal && <span style={{ color:"#ef4444" }}> (KK)</span>}
        </span>
      ))}
    </div>
  );
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// ─── İlk kez karşılaşma paneli — AI yorum ile ──────────────────────────────
function NoH2HPanel({ takim1, takim2, takim1Tr, takim2Tr }) {
  const [yorum,   setYorum]   = useState(null);
  const [loading, setLoading] = useState(false);
  const t1 = takim1Tr || takim1;
  const t2 = takim2Tr || takim2;

  function fetchYorum() {
    setLoading(true);
    const params = new URLSearchParams({
      takim1, takim2,
      takim1Tr: takim1Tr || "",
      takim2Tr: takim2Tr || "",
      ilk_kez: "true",
    });
    fetch(`${API_BASE}/h2h/commentary?${params}`)
      .then(r => r.ok ? r.json() : { yorum: "Yorum alınamadı." })
      .then(d => { setYorum(d.yorum); setLoading(false); })
      .catch(() => { setYorum("Yorum alınamadı."); setLoading(false); });
  }

  return (
    <div style={card}>
      {/* Başlık */}
      <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10 }}>
        <span style={{ fontSize:14 }}>⚔️</span>
        <span style={{ fontSize:12, fontWeight:800, color:"#0f172a" }}>İlk Karşılaşma</span>
      </div>

      {/* Takımlar */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, marginBottom:12 }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:22 }}>{flag(takim1)}</div>
          <div style={{ fontSize:11, fontWeight:700, color:"#0f172a", marginTop:2 }}>{t1}</div>
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:10, color:"#94a3b8", fontWeight:600 }}>WC/EURO'DA</div>
          <div style={{ fontSize:18, fontWeight:900, color:"#e2e8f0", letterSpacing:2 }}>🆚</div>
          <div style={{ fontSize:10, color:"#94a3b8", fontWeight:600 }}>İLK KEZ</div>
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:22 }}>{flag(takim2)}</div>
          <div style={{ fontSize:11, fontWeight:700, color:"#0f172a", marginTop:2 }}>{t2}</div>
        </div>
      </div>

      {/* AI yorum alanı */}
      {!yorum && !loading && (
        <button
          onClick={fetchYorum}
          style={{
            width:"100%", padding:"8px 12px",
            background:"linear-gradient(135deg,#1e293b,#334155)",
            border:"none", borderRadius:8, cursor:"pointer",
            fontSize:11, fontWeight:700, color:"#fff",
            display:"flex", alignItems:"center", justifyContent:"center", gap:6,
          }}
        >
          <span style={{ fontSize:13 }}>✨</span>
          AI Maç Analizi
        </button>
      )}

      {loading && (
        <div style={{
          textAlign:"center", padding:"12px 0",
          fontSize:11, color:"#94a3b8",
        }}>
          <span style={{ animation:"hh-pulse 1s ease-in-out infinite alternate" }}>✨</span>
          {" "}Analiz hazırlanıyor…
        </div>
      )}

      {yorum && (
        <div style={{
          marginTop:4, padding:"12px 14px",
          background:"linear-gradient(135deg,#f8fafc,#f1f5f9)",
          border:"1px solid #e2e8f0",
          borderLeft:"3px solid #f59e0b",
          borderRadius:8, fontSize:12, color:"#1e293b",
          lineHeight:1.65,
        }}>
          <div style={{ fontSize:9, fontWeight:700, color:"#f59e0b", marginBottom:6, textTransform:"uppercase", letterSpacing:".07em" }}>
            ✨ AI Analiz
          </div>
          {yorum}
        </div>
      )}
    </div>
  );
}

export default function H2HPanel({ takim1, takim2, takim1Tr, takim2Tr }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [expand,  setExpand]  = useState(false);

  useEffect(() => {
    if (!takim1 || !takim2) return;
    setData(null); setLoading(true); setExpand(false);
    api.getH2H(takim1, takim2)
      .then(d  => { setData(d);  setLoading(false); })
      .catch(() => setLoading(false));
  }, [takim1, takim2]);

  if (loading) return (
    <div style={card}>
      <div style={{ fontSize:11, color:"#94a3b8", padding:"4px 0" }}>⚔️ H2H yükleniyor…</div>
    </div>
  );
  if (!data || data.toplam_mac === 0) return (
    <NoH2HPanel
      takim1={takim1} takim2={takim2}
      takim1Tr={takim1Tr} takim2Tr={takim2Tr}
    />
  );

  const t1Tr = takim1Tr || takim1;
  const t2Tr = takim2Tr || takim2;

  // Turnuva bazlı istatistik özeti
  const byCat = {};
  for (const m of data.tum_maclar) {
    const c = m.turnuva_kategori || "FIFA Dünya Kupası";
    if (!byCat[c]) byCat[c] = { mac:0, t1W:0, t2W:0, ber:0 };
    byCat[c].mac++;
    if (m.kazanan === takim1) byCat[c].t1W++;
    else if (m.kazanan === takim2) byCat[c].t2W++;
    else if (m.kazanan === "beraberlik") byCat[c].ber++;
  }

  // Kazanma barı
  const total = data.toplam_mac;
  const p1 = total ? Math.round(data.takim1_galibiyet / total * 100) : 0;
  const p2 = total ? Math.round(data.takim2_galibiyet / total * 100) : 0;
  const pB = 100 - p1 - p2;

  const shown = expand ? data.tum_maclar : data.tum_maclar.slice(-5);

  return (
    <div style={card}>
      {/* Başlık */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
          <span style={{ fontSize:14 }}>⚔️</span>
          <span style={{ fontSize:12, fontWeight:800, color:"#0f172a" }}>Karşılaşma Geçmişi</span>
        </div>
        <span style={{ fontSize:9, fontWeight:800, color:"#94a3b8" }}>
          WC + UEFA EURO · {total} maç
        </span>
      </div>

      {/* Skor özeti */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <div style={{ textAlign:"center", flex:1 }}>
          <div style={{ fontSize:24 }}>{flag(takim1)}</div>
          <div style={{ fontSize:11, fontWeight:700, color:"#0f172a", marginTop:3 }}>{t1Tr}</div>
          <div style={{ fontSize:22, fontWeight:900, color:"#22c55e", lineHeight:1.1 }}>{data.takim1_galibiyet}</div>
          <div style={{ fontSize:9, color:"#94a3b8" }}>galibiyet</div>
        </div>

        <div style={{ textAlign:"center", padding:"0 8px" }}>
          <div style={{ fontSize:13, fontWeight:800, color:"#f59e0b" }}>{data.beraberlik}</div>
          <div style={{ fontSize:8, color:"#94a3b8", fontWeight:600 }}>BEG</div>
          <div style={{ fontSize:11, color:"#64748b", margin:"4px 0", fontWeight:600 }}>
            {data.takim1_gol} – {data.takim2_gol}
          </div>
          <div style={{ fontSize:8, color:"#94a3b8" }}>toplam gol</div>
        </div>

        <div style={{ textAlign:"center", flex:1 }}>
          <div style={{ fontSize:24 }}>{flag(takim2)}</div>
          <div style={{ fontSize:11, fontWeight:700, color:"#0f172a", marginTop:3 }}>{t2Tr}</div>
          <div style={{ fontSize:22, fontWeight:900, color:"#ef4444", lineHeight:1.1 }}>{data.takim2_galibiyet}</div>
          <div style={{ fontSize:9, color:"#94a3b8" }}>galibiyet</div>
        </div>
      </div>

      {/* Kazanma barı */}
      <div style={{ marginBottom:12 }}>
        <div style={{ display:"flex", height:6, borderRadius:3, overflow:"hidden", gap:1 }}>
          {p1 > 0 && <div style={{ flex:p1, background:"#22c55e" }} />}
          {pB > 0 && <div style={{ flex:pB, background:"#f59e0b" }} />}
          {p2 > 0 && <div style={{ flex:p2, background:"#ef4444" }} />}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:3 }}>
          <span style={{ fontSize:8, color:"#22c55e", fontWeight:700 }}>%{p1} {t1Tr}</span>
          <span style={{ fontSize:8, color:"#f59e0b", fontWeight:700 }}>%{pB} beraberlik</span>
          <span style={{ fontSize:8, color:"#ef4444", fontWeight:700 }}>{t2Tr} %{p2}</span>
        </div>
      </div>

      {/* Turnuva bazlı özet */}
      {Object.keys(byCat).length > 1 && (
        <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
          {Object.entries(byCat).map(([cat, s]) => {
            const m2 = TURNUVA_META[cat] || { short:cat.slice(0,6), bg:"#f1f5f9", border:"#e2e8f0", color:"#64748b", icon:"🏟️" };
            return (
              <div key={cat} style={{
                flex:1, minWidth:100, padding:"6px 10px",
                background:m2.bg, border:`1px solid ${m2.border}`,
                borderRadius:8, textAlign:"center",
              }}>
                <div style={{ fontSize:9, fontWeight:800, color:m2.color, marginBottom:3 }}>{m2.icon} {cat}</div>
                <div style={{ fontSize:11, fontWeight:700, color:"#0f172a" }}>
                  {s.t1W}–{s.ber}–{s.t2W}
                </div>
                <div style={{ fontSize:8, color:"#94a3b8" }}>{s.mac} maç</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Maç listesi */}
      <div style={{ borderTop:"1px solid #f1f5f9", paddingTop:10 }}>
        <div style={{ fontSize:9, fontWeight:700, color:"#94a3b8", textTransform:"uppercase",
                      letterSpacing:".07em", marginBottom:8 }}>
          {expand ? `Tüm ${total} maç` : "Son 5 maç"}
        </div>
        {shown.map((m, i) => {
          const played = m.gol1 != null && m.gol2 != null;
          let resultColor = "#f59e0b";
          let resultLabel = "B";
          if (played && m.kazanan === takim1) { resultColor = "#22c55e"; resultLabel = "G"; }
          if (played && m.kazanan === takim2) { resultColor = "#ef4444"; resultLabel = "M"; }

          return (
            <div key={i} style={{
              padding:"8px 0",
              borderBottom: i < shown.length - 1 ? "1px solid #f8fafc" : "none",
            }}>
              {/* Üst satır: yıl, turnuva, tur, skor */}
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                {/* Yıl */}
                <span style={{ fontSize:11, fontWeight:800, color:"#0f172a", minWidth:34 }}>{m.yil}</span>
                {/* Turnuva rozeti */}
                <TurnuvaBadge kategori={m.turnuva_kategori} />
                {/* Tur */}
                <span style={{ fontSize:9, color:"#94a3b8", flex:1, overflow:"hidden",
                              textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {m.tur_tr}
                </span>
                {/* Skor */}
                {played && (
                  <span style={{
                    fontSize:13, fontWeight:900, color:"#0f172a",
                    background:"#f1f5f9", padding:"1px 7px", borderRadius:5,
                    minWidth:44, textAlign:"center", flexShrink:0,
                  }}>
                    {m.gol1} – {m.gol2}
                  </span>
                )}
                {/* HT skoru */}
                {played && m.ht_gol1 != null && (
                  <span style={{ fontSize:8, color:"#94a3b8", flexShrink:0 }}>
                    ({m.ht_gol1}–{m.ht_gol2})
                  </span>
                )}
                {/* Sonuç rozeti */}
                {played && (
                  <span style={{
                    fontSize:9, fontWeight:800, minWidth:20, textAlign:"center",
                    color:resultColor, background:resultColor+"18",
                    border:`1px solid ${resultColor}44`, borderRadius:4, padding:"1px 4px",
                    flexShrink:0,
                  }}>{resultLabel}</span>
                )}
              </div>

              {/* Alt satır: goller */}
              {played && (m.goller1?.length > 0 || m.goller2?.length > 0) && (
                <div style={{ marginTop:4, paddingLeft:40, display:"flex", flexWrap:"wrap", gap:4 }}>
                  <GoalList goals={m.goller1} color="#22c55e" />
                  {m.goller2?.length > 0 && (
                    <GoalList goals={m.goller2} color="#ef4444" />
                  )}
                </div>
              )}

              {/* Stadyum */}
              {m.stadyum && (
                <div style={{ fontSize:8, color:"#94a3b8", marginTop:2, paddingLeft:40 }}>
                  📍 {m.stadyum}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tümünü göster */}
      {total > 5 && (
        <button onClick={() => setExpand(e => !e)} style={{
          display:"block", width:"100%", marginTop:8,
          padding:"6px", background:"#f8fafc",
          border:"1px solid #e2e8f0", borderRadius:8,
          fontSize:10, fontWeight:700, color:"#64748b", cursor:"pointer",
        }}>
          {expand ? "▲ Son 5'i göster" : `+ ${total - 5} maç daha ▼`}
        </button>
      )}
    </div>
  );
}

const card = {
  background:"#fff", border:"1px solid #e2e8f0",
  borderRadius:12, padding:"14px 16px",
  boxShadow:"0 1px 3px rgba(0,0,0,.06)",
};
