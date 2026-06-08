/**
 * WC2026Venues — 2026 Dünya Kupası saha analiz sayfası
 * Her stadyum için kapasite, rakım, çim türü, iklim, özel notlar.
 */
import { useEffect, useState } from "react";
import { api } from "../services/api.js";

// ─── Statik metadata — API'de olmayan zengin bilgiler ──────────────────────
const VENUE_META = {
  "MetLife Stadium": {
    flag: "🇺🇸",
    role: "🏆 FİNAL",
    roleColor: "#f59e0b",
    city_short: "New York / NJ",
    iklim: "Ilıman, nemli",
    ozel: "WC Final sahnesi. New York / New Jersey metro bölgesi. Açık hava — iklim etkili.",
    takimlar: [],
  },
  "AT&T Stadium": {
    flag: "🇺🇸",
    city_short: "Dallas / Arlington",
    iklim: "Sıcak, nemli",
    ozel: "Kapalı kubbe — iklimden bağımsız. Dallas metro bölgesi. Yapay çim.",
    takimlar: [],
  },
  "Levi's Stadium": {
    flag: "🇺🇸",
    city_short: "San Francisco / Silicon Valley",
    iklim: "Ilıman, serin",
    ozel: "Silikon Vadisi'nin staryumu. Açık hava, Pasifik esintisi.",
    takimlar: [],
  },
  "Hard Rock Stadium": {
    flag: "🇺🇸",
    city_short: "Miami",
    iklim: "Tropikal, çok nemli",
    ozel: "Miami yazı sıcak ve nemli. Oyuncu yorgunluğunu artırır. Copa América 2024 finale ev sahipliği yaptı.",
    takimlar: [],
  },
  "Mercedes-Benz Stadium": {
    flag: "🇺🇸",
    city_short: "Atlanta",
    iklim: "Sıcak, nemli",
    ozel: "Kapalı kubbeli, klimatize. Yapay çim. Dünyanın en modern çok amaçlı stadyumlarından.",
    takimlar: [],
  },
  "Gillette Stadium": {
    flag: "🇺🇸",
    city_short: "Boston / Foxborough",
    iklim: "Ilıman, dört mevsim",
    ozel: "New England Patriots'ın evi. Açık hava, Boston etkisi.",
    takimlar: [],
  },
  "Lincoln Financial Field": {
    flag: "🇺🇸",
    city_short: "Philadelphia",
    iklim: "Ilıman, dört mevsim",
    ozel: "Philly'nin iconic stadı. Yaz aylarında sıcak ve nemli olabilir.",
    takimlar: [],
  },
  "GEHA Field at Arrowhead Stadium": {
    flag: "🇺🇸",
    city_short: "Kansas City",
    iklim: "Kıta ikliimi, rüzgarlı",
    ozel: "NFL'nin en sesli stadyumlarından. Açık hava, rüzgar faktörü.",
    takimlar: [],
  },
  "SoFi Stadium": {
    flag: "🇺🇸",
    city_short: "Los Angeles",
    iklim: "Akdeniz iklimi, ılıman",
    ozel: "LA'nın süper modern arenası. Yarı kapalı — direkt güneş yok. Yapay çim.",
    takimlar: [],
  },
  "NRG Stadium": {
    flag: "🇺🇸",
    city_short: "Houston",
    iklim: "Subtropikal, çok sıcak",
    ozel: "Kapalı kubbeli — Houston yazında aşırı sıcak ve nemli. Yapay çim.",
    takimlar: [],
  },
  "Lumen Field": {
    flag: "🇺🇸",
    city_short: "Seattle",
    iklim: "Serin, yağışlı",
    ozel: "Seattle yağmuru efsanevi. Açık hava. İyi drene zemin kritik.",
    takimlar: [],
  },
  "BC Place": {
    flag: "🇨🇦",
    city_short: "Vancouver",
    iklim: "Okyanus iklimi, ılıman",
    ozel: "Dünyanın en büyük şişirilebilir çatılı stadı. Yapay çim, tamamen kapalı.",
    takimlar: [],
  },
  "BMO Field": {
    flag: "🇨🇦",
    city_short: "Toronto",
    iklim: "Kıta iklimi, dört mevsim",
    ozel: "Toronto'nun futbol arenası. Açık hava. Yaz aylarında sıcak.",
    takimlar: [],
  },
  "Estadio Banorte": {
    flag: "🇲🇽",
    role: "⚡ YÜKSEK İRTİFA",
    roleColor: "#dc2626",
    city_short: "Meksika Şehri",
    iklim: "Dağ iklimi, serin",
    ozel: "2,240m rakımda! Oksijen %26 daha az. Yüksek irtifaya alışkın olmayan takımlar ciddi avantaj kaybeder. Tarihsel olarak Meksika çok güçlü.",
    takimlar: ["Mexico"],
  },
  "Estadio BBVA": {
    flag: "🇲🇽",
    role: "🏔️ ORTA İRTİFA",
    roleColor: "#f59e0b",
    city_short: "Monterrey",
    iklim: "Sıcak çöl, yoğun ısı",
    ozel: "513m rakım + Monterrey yazında 40°C+. Hem irtifa hem ısı stres kombinasyonu.",
    takimlar: [],
  },
  "Estadio Akron": {
    flag: "🇲🇽",
    role: "🏔️ YÜKSEK İRTİFA",
    roleColor: "#ef4444",
    city_short: "Guadalajara",
    iklim: "Ilıman, tropikal",
    ozel: "1,550m rakım. Oksijen yeterince azalmış. Guadalajara'nın stadı Atlas F.C.'ye de ev sahipliği yapar.",
    takimlar: [],
  },
};

const ULKE_COLOR = {
  "USA":    "#3b82f6",
  "Canada": "#ef4444",
  "Mexico": "#10b981",
};

function altBadge(rakim) {
  if (!rakim && rakim !== 0) return null;
  if (rakim >= 2000) return { label: "EKSTrem İrtifa", color: "#dc2626", bg: "#fee2e2", icon: "🏔️" };
  if (rakim >= 1000) return { label: "Yüksek İrtifa",  color: "#ea580c", bg: "#fff7ed", icon: "⛰️" };
  if (rakim >= 400)  return { label: "Orta İrtifa",    color: "#f59e0b", bg: "#fef3c7", icon: "🗻" };
  return              { label: "Deniz Seviyesi",       color: "#10b981", bg: "#d1fae5", icon: "🌊" };
}

function capBar(cap, max = 92000) {
  const pct = Math.min(100, (cap / max) * 100);
  return (
    <div style={{ height: 4, background: "#f1f5f9", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: "#3b82f6", borderRadius: 2, transition: "width .6s" }} />
    </div>
  );
}

function fmtCap(n) {
  return n ? n.toLocaleString("tr-TR") : "—";
}

function VenueCard({ v, matchCount }) {
  const meta = VENUE_META[v.stadyum_isim] || {};
  const alt  = altBadge(v.stadyum_rakim);
  const ulkeColor = ULKE_COLOR[v.stadyum_ulke] || "#64748b";
  const [exp, setExp] = useState(false);

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderRadius: 14,
      overflow: "hidden",
      transition: "box-shadow .2s",
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,.08)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
    >
      {/* Ülke renk şeridi + başlık */}
      <div style={{ height: 4, background: ulkeColor }} />
      <div style={{ padding: "14px 16px 10px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 16 }}>{meta.flag ?? "🏟️"}</span>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#0f172a", lineHeight: 1.3 }}>
                {v.stadyum_isim}
              </div>
            </div>
            <div style={{ fontSize: 10, color: "#64748b" }}>
              📍 {meta.city_short || v.stadyum_sehir} · {v.stadyum_ulke}
            </div>
          </div>
          {meta.role && (
            <span style={{
              fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 5,
              background: meta.roleColor + "15", color: meta.roleColor,
              border: `1px solid ${meta.roleColor}40`, flexShrink: 0, whiteSpace: "nowrap",
            }}>{meta.role}</span>
          )}
        </div>

        {/* İrtifa badge */}
        {alt && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
            background: alt.bg, color: alt.color,
            marginTop: 6,
          }}>
            {alt.icon} {v.stadyum_rakim}m — {alt.label}
          </div>
        )}

        {/* Ana istatistikler */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
          {/* Kapasite */}
          <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Kapasite</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#0f172a" }}>{fmtCap(v.stadyum_kapasite)}</div>
            {capBar(v.stadyum_kapasite)}
          </div>

          {/* Rakım */}
          <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Rakım</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: alt?.color ?? "#0f172a" }}>
              {v.stadyum_rakim != null ? `${v.stadyum_rakim} m` : "—"}
            </div>
          </div>

          {/* Zemin */}
          <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Zemin</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
              {v.stadyum_cim_turu === "Doğal" ? "🌿 Doğal" :
               v.stadyum_cim_turu === "Yapay"  ? "🟩 Yapay" :
               v.stadyum_cim_turu === "Hibrit" ? "🍀 Hibrit" : "—"}
            </div>
          </div>

          {/* Çerçeve */}
          <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Tesis</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
              {v.stadyum_cerceve ?? "—"}
            </div>
          </div>
        </div>

        {/* İklim + ek bilgi (expand) */}
        <button
          onClick={() => setExp(e => !e)}
          style={{
            width: "100%", marginTop: 10, padding: "6px",
            background: "none", border: "1px solid #f1f5f9",
            borderRadius: 7, fontSize: 10, color: "#64748b",
            cursor: "pointer", fontWeight: 600,
          }}
        >
          {exp ? "▲ Kapat" : "▼ Detay"}
          {matchCount ? ` · ${matchCount} maç` : ""}
        </button>

        {exp && (
          <div style={{ marginTop: 8 }}>
            {/* Ölçü + açılış */}
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {v.stadyum_boyut && (
                <span style={{ ...tag, background: "#f1f5f9", color: "#475569" }}>
                  📐 {v.stadyum_boyut}
                </span>
              )}
              {v.stadyum_acilis_yili && (
                <span style={{ ...tag, background: "#f1f5f9", color: "#475569" }}>
                  🏗️ {v.stadyum_acilis_yili}
                </span>
              )}
            </div>

            {/* İklim */}
            {meta.iklim && (
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>
                🌤️ <b>İklim:</b> {meta.iklim}
              </div>
            )}

            {/* Özel not */}
            {meta.ozel && (
              <div style={{
                fontSize: 11, color: "#475569", lineHeight: 1.5,
                padding: "8px 10px",
                background: v.stadyum_rakim >= 1000 ? "#fff7ed" : "#f8fafc",
                borderRadius: 8,
                borderLeft: `3px solid ${v.stadyum_rakim >= 1000 ? "#f59e0b" : "#e2e8f0"}`,
              }}>
                {meta.ozel}
              </div>
            )}

            {/* Harita */}
            {v.stadyum_lat && v.stadyum_lon && (
              <a
                href={`https://www.google.com/maps?q=${v.stadyum_lat},${v.stadyum_lon}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  marginTop: 8, fontSize: 10, color: "#38bdf8",
                  textDecoration: "none", fontWeight: 600,
                }}
              >
                🗺️ Haritada gör →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const tag = {
  display: "inline-flex", alignItems: "center",
  fontSize: 10, fontWeight: 600, padding: "2px 8px",
  borderRadius: 5,
};

export default function WC2026Venues() {
  const [fixtures, setFixtures] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState("all"); // all | USA | Canada | Mexico

  useEffect(() => {
    api.getFixtures({ limit: 200 })
      .then(d => { setFixtures(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: "#94a3b8", fontSize: 13, padding: 20 }}>Sahalar yükleniyor…</div>;

  // Unique venues
  const venueMap = {};
  fixtures.forEach(f => {
    if (!f.stadyum_isim) return;
    if (!venueMap[f.stadyum_isim]) {
      venueMap[f.stadyum_isim] = {
        stadyum_isim:      f.stadyum_isim,
        stadyum_sehir:     f.stadyum_sehir,
        stadyum_ulke:      f.stadyum_ulke,
        stadyum_kapasite:  f.stadyum_kapasite,
        stadyum_rakim:     f.stadyum_rakim,
        stadyum_cim_turu:  f.stadyum_cim_turu,
        stadyum_cerceve:   f.stadyum_cerceve,
        stadyum_lat:       f.stadyum_lat,
        stadyum_lon:       f.stadyum_lon,
        stadyum_acilis_yili: f.stadyum_acilis_yili,
        stadyum_boyut:     f.stadyum_boyut,
        mac_sayisi: 0,
      };
    }
    venueMap[f.stadyum_isim].mac_sayisi++;
  });

  const allVenues = Object.values(venueMap)
    .sort((a, b) => (b.stadyum_rakim ?? 0) - (a.stadyum_rakim ?? 0)); // rakım büyükten küçüğe

  const filtered = filter === "all" ? allVenues : allVenues.filter(v => v.stadyum_ulke === filter);

  // İstatistikler
  const totalMac    = allVenues.reduce((s, v) => s + v.mac_sayisi, 0);
  const maxCap      = Math.max(...allVenues.map(v => v.stadyum_kapasite ?? 0));
  const highAlt     = allVenues.filter(v => (v.stadyum_rakim ?? 0) >= 1000).length;
  const synthetic   = allVenues.filter(v => v.stadyum_cim_turu === "Yapay").length;

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Başlık */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>🏟️</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>WC 2026 Sahalar</div>
          <div style={{ fontSize: 10, color: "#64748b" }}>
            {allVenues.length} stadyum · 3 ülke · ABD–Kanada–Meksika
          </div>
        </div>
      </div>

      {/* Özet istatistikler */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
        marginBottom: 14,
      }}>
        {[
          { label: "Stadyum",    val: allVenues.length, icon: "🏟️" },
          { label: "En büyük",   val: fmtCap(maxCap),   icon: "👥" },
          { label: "Yüks. irtifa",val: highAlt,         icon: "⛰️", warn: highAlt > 0 },
          { label: "Yapay çim",  val: synthetic,        icon: "🟩" },
        ].map(s => (
          <div key={s.label} style={{
            background: s.warn ? "#fff7ed" : "#f8fafc",
            border: `1px solid ${s.warn ? "#fed7aa" : "#e2e8f0"}`,
            borderRadius: 10, padding: "8px 10px", textAlign: "center",
          }}>
            <div style={{ fontSize: 14 }}>{s.icon}</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: s.warn ? "#ea580c" : "#0f172a" }}>{s.val}</div>
            <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Ülke filtresi */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {[["all","Tümü","#0f172a"],["USA","🇺🇸 ABD","#3b82f6"],["Canada","🇨🇦 Kanada","#ef4444"],["Mexico","🇲🇽 Meksika","#10b981"]].map(([val, label, color]) => (
          <button key={val}
            onClick={() => setFilter(val)}
            style={{
              fontSize: 10, fontWeight: 700, padding: "4px 12px", borderRadius: 6,
              background: filter === val ? color : "#f1f5f9",
              color: filter === val ? "#fff" : "#64748b",
              border: `1px solid ${filter === val ? color : "#e2e8f0"}`,
              cursor: "pointer",
            }}
          >{label}</button>
        ))}
      </div>

      {/* Saha kartları */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: 12,
      }}>
        {filtered.map(v => (
          <VenueCard key={v.stadyum_isim} v={v} matchCount={v.mac_sayisi} />
        ))}
      </div>

      {/* İrtifa uyarı notu */}
      {highAlt > 0 && (
        <div style={{
          marginTop: 16, padding: "12px 16px",
          background: "#fff7ed", border: "1px solid #fed7aa",
          borderRadius: 10, fontSize: 12, color: "#92400e", lineHeight: 1.6,
        }}>
          <b>⛰️ İrtifa Etkisi Nedir?</b><br/>
          Her 1,000m yükseltide oksijen yoğunluğu yaklaşık %10 azalır. Meksika Şehri (2,240m) ve Guadalajara (1,550m)'da Avrupalı takımlar ciddi performans düşüşü yaşayabilir. Aklimasyon için en az 2–3 hafta gerekebilir. Meksika, Arjantin, Kolombiya gibi irtifaya alışkın millî takımlar büyük avantaj kazanır.
        </div>
      )}
    </div>
  );
}
