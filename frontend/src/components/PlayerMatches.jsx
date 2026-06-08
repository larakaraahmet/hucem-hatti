/**
 * PlayerMatches — Oyuncunun analiz edilen tüm maçlarını listeler.
 * Her maç satırına tıklayınca detaylı stadyum kartı açılır.
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${parseInt(day)} ${MONTHS[parseInt(m) - 1]} ${y}`;
}

function shortTournament(t) {
  return t
    .replace("FIFA World Cup", "WC")
    .replace("UEFA Euro", "Euro")
    .replace("Copa América", "Copa")
    .replace("Premier League", "PL")
    .replace("Bundesliga", "BL")
    .replace("La Liga", "LaLiga")
    .replace("Serie A", "SerieA")
    .replace("Ligue 1", "L1")
    .replace("Champions League", "UCL")
    .replace("Europa League", "UEL");
}

const TOURN_COLOR = {
  "FIFA World Cup":   "#fbbf24",
  "UEFA Euro":        "#38bdf8",
  "Copa América":     "#34d399",
  "Premier League":   "#7c3aed",
  "Bundesliga":       "#dc2626",
  "La Liga":          "#ea580c",
  "Serie A":          "#0284c7",
  "Ligue 1":          "#059669",
  "Champions League": "#1d4ed8",
  "Europa League":    "#f97316",
};

function tournColor(t) {
  for (const [k, v] of Object.entries(TOURN_COLOR)) {
    if (t.includes(k)) return v;
  }
  return "#94a3b8";
}

// Çim türüne göre ikon
function grassIcon(tip) {
  if (!tip) return "—";
  if (tip === "Doğal")  return "🌿 Doğal";
  if (tip === "Yapay")  return "🟩 Yapay";
  if (tip === "Hibrit") return "🍀 Hibrit";
  return tip;
}

// Rakıma göre etiket
function altitudeLabel(m) {
  if (m == null) return null;
  if (m >= 2000) return { label: "Yüksek İrtifa", color: "#dc2626" };
  if (m >= 1000) return { label: "Orta İrtifa",   color: "#f59e0b" };
  if (m >= 500)  return { label: "Yüksek",        color: "#f59e0b" };
  return { label: "Deniz Seviyesi",               color: "#10b981" };
}

// Kapasite formatla
function fmtCap(n) {
  if (!n) return "—";
  return n.toLocaleString("tr-TR");
}

// Stadyum detay kartı
function StadiumCard({ m }) {
  if (!m.saha_isim) {
    return (
      <div style={sst.noData}>
        <span style={{ fontSize: 16 }}>🏟️</span>
        <span>Bu maç için stadyum bilgisi mevcut değil.</span>
      </div>
    );
  }

  const altInfo = altitudeLabel(m.saha_rakim);

  return (
    <div style={sst.wrap}>
      {/* Başlık */}
      <div style={sst.header}>
        <div style={sst.stadName}>
          <span style={{ fontSize: 20 }}>🏟️</span>
          <div>
            <div style={sst.stadTitle}>{m.saha_isim}</div>
            <div style={sst.stadLocation}>
              📍 {m.saha_sehir}{m.saha_ulke ? `, ${m.saha_ulke}` : ""}
            </div>
          </div>
        </div>
        {m.saha_acilis_yili && (
          <div style={sst.openYear}>
            <div style={sst.openYearNum}>{m.saha_acilis_yili}</div>
            <div style={sst.openYearLbl}>kuruluş</div>
          </div>
        )}
      </div>

      {/* Ana istatistikler */}
      <div style={sst.grid}>
        {/* Kapasite */}
        <div style={sst.statBox}>
          <div style={sst.statIcon}>👥</div>
          <div style={sst.statVal}>{fmtCap(m.saha_kapasite)}</div>
          <div style={sst.statLbl}>Kapasite</div>
        </div>

        {/* Rakım */}
        <div style={sst.statBox}>
          <div style={sst.statIcon}>⛰️</div>
          <div style={{ ...sst.statVal, color: altInfo?.color }}>
            {m.saha_rakim != null ? `${m.saha_rakim} m` : "—"}
          </div>
          <div style={sst.statLbl}>
            {altInfo ? altInfo.label : "Rakım"}
          </div>
        </div>

        {/* Çim türü */}
        <div style={sst.statBox}>
          <div style={sst.statIcon}>
            {m.saha_cim_turu === "Doğal" ? "🌿" : m.saha_cim_turu === "Yapay" ? "🟩" : "🍀"}
          </div>
          <div style={sst.statVal}>{m.saha_cim_turu ?? "—"}</div>
          <div style={sst.statLbl}>Zemin</div>
        </div>

        {/* Boyutlar */}
        {m.saha_boyut && (
          <div style={sst.statBox}>
            <div style={sst.statIcon}>📐</div>
            <div style={{ ...sst.statVal, fontSize: 13 }}>{m.saha_boyut}</div>
            <div style={sst.statLbl}>Saha Ölçüsü</div>
          </div>
        )}
      </div>

      {/* Rakım detay banner (yüksek irtifa uyarısı) */}
      {m.saha_rakim >= 1000 && (
        <div style={{ ...sst.banner, background: "rgba(220,38,38,0.07)", borderColor: "rgba(220,38,38,0.2)" }}>
          <span style={{ fontSize: 14 }}>🏔️</span>
          <span style={{ color: "#dc2626", fontWeight: 600, fontSize: 12 }}>
            Yüksek İrtifa — {m.saha_rakim} m
          </span>
          <span style={{ color: "#64748b", fontSize: 11 }}>
            Kondisyon ve nefes kapasitesi maç performansını etkileyebilir.
          </span>
        </div>
      )}

      {/* Kapasiteye göre atmosfer */}
      {m.saha_kapasite >= 60000 && (
        <div style={{ ...sst.banner, background: "rgba(16,185,129,0.07)", borderColor: "rgba(16,185,129,0.2)" }}>
          <span style={{ fontSize: 14 }}>🔥</span>
          <span style={{ color: "#10b981", fontWeight: 600, fontSize: 12 }}>
            Dev Stadyum — {fmtCap(m.saha_kapasite)} kişilik kapasite
          </span>
        </div>
      )}

      {/* Harita linki */}
      {m.saha_lat && m.saha_lon && (
        <a
          href={`https://www.google.com/maps?q=${m.saha_lat},${m.saha_lon}`}
          target="_blank"
          rel="noopener noreferrer"
          style={sst.mapLink}
        >
          🗺️ Haritada gör
        </a>
      )}
    </div>
  );
}

export default function PlayerMatches({ playerId, milliyet, competition }) {
  const [matches,    setMatches]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showAll,    setShowAll]    = useState(false);
  const [openMatch,  setOpenMatch]  = useState(null); // açık mac_id

  useEffect(() => {
    setLoading(true);
    setOpenMatch(null);
    fetch(`${API_BASE}/player/${playerId}/matches${competition ? `?turnuva=${encodeURIComponent(competition)}` : ""}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { setMatches(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [playerId, competition]);

  if (loading) return <div style={st.empty}>Maçlar yükleniyor…</div>;
  if (!matches.length) return (
    <div style={{ ...st.empty, padding:"20px 18px", color:"#94a3b8", fontSize:13, textAlign:"center", lineHeight:1.6 }}>
      {competition ? (
        <>
          <div style={{ fontSize:20, marginBottom:6 }}>📋</div>
          <div style={{ fontWeight:600, color:"#64748b", marginBottom:4 }}>{competition}</div>
          <div>Maç bazlı veri henüz yok.</div>
          <div style={{ fontSize:11, marginTop:4 }}>
            Sezon özet istatistikleri turnuva filtresinde (Σ) görünüyor.<br/>
            Maç listesi için shot ingest + aggregate gerekli.
          </div>
        </>
      ) : (
        <div>Maç verisi bulunamadı.</div>
      )}
    </div>
  );

  const shown = showAll ? matches : matches.slice(0, 6);

  return (
    <div style={st.wrap}>
      <div style={st.header}>
        <h3 style={st.title}>
          <span style={st.titleIcon}>📋</span>
          Analiz Edilen Maçlar
        </h3>
        <span style={st.countBadge}>{matches.length} maç</span>
      </div>

      <div style={st.list}>
        {shown.map((m, idx) => {
          const color   = tournColor(m.turnuva);
          const isHome  = milliyet && m.ev_takim.toLowerCase() === milliyet.toLowerCase();
          const isAway  = milliyet && m.deplasman_takim.toLowerCase() === milliyet.toLowerCase();
          const myTeam  = isHome ? m.ev_takim : isAway ? m.deplasman_takim : null;
          const oppTeam = isHome ? m.deplasman_takim : isAway ? m.ev_takim : null;
          const isOpen  = openMatch === m.mac_id;

          return (
            <div key={m.mac_id}>
              {/* Maç satırı */}
              <div
                onClick={() => setOpenMatch(isOpen ? null : m.mac_id)}
                style={{
                  ...st.row,
                  animationDelay: `${idx * 0.04}s`,
                  background: isOpen ? "#f8fafc" : "#fff",
                  cursor: "pointer",
                }}
                className="hh-match-row"
              >
                {/* Turnuva renk şeridi */}
                <div style={{ ...st.stripe, background: color }} />

                {/* Sol: tarih + turnuva */}
                <div style={st.leftCol}>
                  <span style={st.date}>{fmtDate(m.tarih)}</span>
                  <span style={{ ...st.tourn, color }}>{shortTournament(m.turnuva)}</span>
                </div>

                {/* Orta: maç */}
                <div style={st.midCol}>
                  {myTeam ? (
                    <>
                      <span style={st.myTeam}>{myTeam}</span>
                      <span style={st.vsText}>vs</span>
                      <span style={st.oppTeam}>{oppTeam}</span>
                    </>
                  ) : (
                    <>
                      <span style={st.oppTeam}>{m.ev_takim}</span>
                      <span style={st.vsText}>vs</span>
                      <span style={st.oppTeam}>{m.deplasman_takim}</span>
                    </>
                  )}
                </div>

                {/* Sağ: istatistikler + stadyum mini bilgi */}
                <div style={st.statsCol}>
                  <span style={st.minStat}>{m.dakika ?? "—"}'</span>
                  {m.gol > 0 && (
                    <span style={st.statPill}>⚽ {m.gol}</span>
                  )}
                  {m.asist > 0 && (
                    <span style={{ ...st.statPill, ...st.pillAssist }}>🅰️ {m.asist}</span>
                  )}
                  {m.xg != null && m.xg > 0 && (
                    <span style={{ ...st.statPill, ...st.pillXg }}>xG {m.xg.toFixed(2)}</span>
                  )}
                  {m.isabetli_sut > 0 && (
                    <span style={{ ...st.statPill, ...st.pillShot }}>
                      🎯 {m.isabetli_sut}/{m.sut}
                    </span>
                  )}
                  {/* Stadyum mini chip */}
                  {m.saha_isim && (
                    <span style={{ ...st.statPill, ...st.pillStad }} title={m.saha_isim}>
                      🏟️
                    </span>
                  )}
                  <span style={{ fontSize: 9, color: "#cbd5e1" }}>{isOpen ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* Stadyum detay paneli */}
              {isOpen && (
                <div style={st.stadPanel}>
                  <StadiumCard m={m} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {matches.length > 6 && (
        <button onClick={() => setShowAll(o => !o)} style={st.showMore}>
          {showAll ? "Daha az göster ▲" : `Tümünü göster (${matches.length}) ▼`}
        </button>
      )}
    </div>
  );
}

// ─── Ana bileşen stilleri ────────────────────────────────────────────────────
const st = {
  wrap: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 28,
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 18px 12px",
    borderBottom: "1px solid #f1f5f9",
  },
  title: {
    display: "flex", alignItems: "center", gap: 8,
    fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0,
  },
  titleIcon: { fontSize: 14 },
  countBadge: {
    background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)",
    borderRadius: 6, color: "#38bdf8", fontSize: 11, fontWeight: 700, padding: "2px 10px",
  },
  list: { display: "flex", flexDirection: "column" },
  row: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "10px 18px 10px 14px",
    borderBottom: "1px solid #f1f5f9",
    position: "relative",
    animation: "hh-fade-up 0.35s ease forwards",
    opacity: 0,
    transition: "background 0.15s",
    userSelect: "none",
  },
  stripe: {
    width: 3, height: 32, borderRadius: 2, flexShrink: 0,
  },
  leftCol: {
    display: "flex", flexDirection: "column", gap: 2,
    width: 110, flexShrink: 0,
  },
  date:  { color: "#64748b", fontSize: 11 },
  tourn: { fontSize: 11, fontWeight: 700 },
  midCol: {
    display: "flex", alignItems: "center", gap: 6,
    flex: 1, minWidth: 0,
  },
  myTeam: {
    color: "#0f172a", fontSize: 12, fontWeight: 700,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  oppTeam: {
    color: "#64748b", fontSize: 12,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  vsText: { color: "#94a3b8", fontSize: 10, flexShrink: 0 },
  statsCol: {
    display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  minStat: { color: "#94a3b8", fontSize: 11, minWidth: 26, textAlign: "right" },
  statPill: {
    background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)",
    borderRadius: 5, color: "#38bdf8", fontSize: 10, fontWeight: 700, padding: "2px 7px",
    whiteSpace: "nowrap",
  },
  pillAssist: {
    background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)",
    color: "#34d399",
  },
  pillXg: {
    background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)",
    color: "#fbbf24",
  },
  pillShot: {
    background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)",
    color: "#a78bfa",
  },
  pillStad: {
    background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)",
    color: "#10b981", padding: "2px 6px",
  },
  stadPanel: {
    borderBottom: "1px solid #f1f5f9",
    background: "#fafafa",
  },
  showMore: {
    width: "100%", padding: "11px",
    background: "rgba(56,189,248,0.04)",
    border: "none", borderTop: "1px solid #f1f5f9",
    color: "#38bdf8", fontSize: 12, fontWeight: 600,
    cursor: "pointer", transition: "background 0.2s",
  },
  empty: { color: "#94a3b8", fontSize: 13, padding: "20px", textAlign: "center" },
};

// ─── Stadyum kartı stilleri ──────────────────────────────────────────────────
const sst = {
  wrap: {
    padding: "16px 18px",
  },
  noData: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "14px 18px",
    color: "#94a3b8", fontSize: 12,
  },
  header: {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
    marginBottom: 14,
  },
  stadName: {
    display: "flex", alignItems: "flex-start", gap: 10,
  },
  stadTitle: {
    fontSize: 14, fontWeight: 800, color: "#0f172a", lineHeight: 1.2, marginBottom: 3,
  },
  stadLocation: {
    fontSize: 11, color: "#64748b",
  },
  openYear: {
    textAlign: "center", flexShrink: 0,
  },
  openYearNum: {
    fontSize: 18, fontWeight: 900, color: "#0f172a",
  },
  openYearLbl: {
    fontSize: 9, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
    gap: 10,
    marginBottom: 12,
  },
  statBox: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: "10px 12px",
    textAlign: "center",
  },
  statIcon: { fontSize: 16, marginBottom: 4 },
  statVal:  { fontSize: 16, fontWeight: 900, color: "#0f172a", lineHeight: 1 },
  statLbl:  { fontSize: 9, color: "#94a3b8", fontWeight: 600, marginTop: 3, textTransform: "uppercase" },
  banner: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid",
    marginBottom: 8,
    flexWrap: "wrap",
  },
  mapLink: {
    display: "inline-flex", alignItems: "center", gap: 4,
    fontSize: 11, color: "#38bdf8", fontWeight: 600,
    textDecoration: "none",
    marginTop: 4,
    padding: "4px 10px",
    background: "rgba(56,189,248,0.07)",
    border: "1px solid rgba(56,189,248,0.2)",
    borderRadius: 6,
  },
};
