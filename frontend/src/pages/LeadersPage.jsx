/**
 * LeadersPage — Metrik bazlı lider tablosu
 */
import { useState, useEffect } from "react";
import { api } from "../services/api.js";

const FLAGS = {
  Argentina:"🇦🇷",Australia:"🇦🇺",Belgium:"🇧🇪",Brazil:"🇧🇷",Cameroon:"🇨🇲",
  Canada:"🇨🇦","Costa Rica":"🇨🇷",Croatia:"🇭🇷",Denmark:"🇩🇰",Ecuador:"🇪🇨",
  England:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",France:"🇫🇷",Germany:"🇩🇪",Ghana:"🇬🇭",Iran:"🇮🇷",
  Japan:"🇯🇵",Mexico:"🇲🇽",Morocco:"🇲🇦",Netherlands:"🇳🇱",Poland:"🇵🇱",
  Portugal:"🇵🇹",Qatar:"🇶🇦","Saudi Arabia":"🇸🇦",Senegal:"🇸🇳",Serbia:"🇷🇸",
  "South Korea":"🇰🇷",Spain:"🇪🇸",Switzerland:"🇨🇭",Tunisia:"🇹🇳",
  "United States":"🇺🇸",Uruguay:"🇺🇾",Wales:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",Albania:"🇦🇱",
  Austria:"🇦🇹","Czech Republic":"🇨🇿",Finland:"🇫🇮",Hungary:"🇭🇺",
  Italy:"🇮🇹","North Macedonia":"🇲🇰",Russia:"🇷🇺",Scotland:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  Slovakia:"🇸🇰",Sweden:"🇸🇪",Turkey:"🇹🇷",Ukraine:"🇺🇦",
  Bolivia:"🇧🇴",Chile:"🇨🇱",Colombia:"🇨🇴",Paraguay:"🇵🇾",Peru:"🇵🇪",
  Venezuela:"🇻🇪",Georgia:"🇬🇪",Romania:"🇷🇴",Slovenia:"🇸🇮",
};
const flag = c => FLAGS[c] ?? "🏳️";

const TABS = [
  { key:"gol",     label:"⚽ Gol",      suffix:"",     desc:"Toplam gol sayısı" },
  { key:"asist",   label:"🅰️ Asist",    suffix:"",     desc:"Toplam asist sayısı" },
  { key:"xg",      label:"📐 xG",       suffix:"",     desc:"Beklenen gol toplamı" },
  { key:"sut",     label:"🎯 Şut",      suffix:"",     desc:"Toplam şut sayısı" },
  { key:"gol90",   label:"🏃 Gol/90",   suffix:"/90",  desc:"90 dakika başına gol (min. 270 dk)" },
  { key:"xg90",    label:"📈 xG/90",    suffix:"/90",  desc:"90 dakika başına beklenen gol (min. 270 dk)" },
  { key:"asist90", label:"🎯 Asist/90", suffix:"/90",  desc:"90 dakika başına asist (min. 270 dk)" },
];

const MEDAL = ["🥇","🥈","🥉"];

export default function LeadersPage({ onPlayerSelect }) {
  const [activeTab, setActiveTab] = useState("gol");
  const [data,      setData]      = useState([]);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    setLoading(true);
    setData([]);
    api.getStatsTop(activeTab, 20).then(d => {
      setData(d ?? []);
      setLoading(false);
    });
  }, [activeTab]);

  const tab = TABS.find(t => t.key === activeTab);

  return (
    <div style={st.page}>
      {/* ── Başlık ── */}
      <div style={st.header}>
        <h1 style={st.title}>🏆 Platform Liderleri</h1>
        <p style={st.sub}>
          StatsBomb verilerine dayalı; WC2022, Euro2020/2024, La Liga, Ligue 1, Bundesliga, Copa América
        </p>
      </div>

      {/* ── Sekme butonları ── */}
      <div style={st.tabs}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{ ...st.tab, ...(activeTab === t.key ? st.tabActive : {}) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Açıklama ── */}
      <p style={st.desc}>{tab?.desc}</p>

      {/* ── Tablo ── */}
      <div style={st.card}>
        {loading && (
          <div style={st.loading}>Yükleniyor…</div>
        )}
        {!loading && data.length === 0 && (
          <div style={st.loading}>Veri bulunamadı.</div>
        )}
        {!loading && data.map((row, idx) => {
          const isTop3 = idx < 3;
          const val = tab?.suffix === "/90"
            ? row.deger?.toFixed(3)
            : Number.isInteger(row.deger) ? row.deger : row.deger?.toFixed(2);

          return (
            <div
              key={row.oyuncu_id}
              style={{ ...st.row, ...(isTop3 ? st.rowTop : {}), cursor: onPlayerSelect ? "pointer" : "default" }}
              onClick={() => onPlayerSelect?.(row.oyuncu_id, row.isim)}
              className={onPlayerSelect ? "hh-match-row" : undefined}
            >
              {/* Rank */}
              <div style={st.rank}>
                {isTop3 ? (
                  <span style={st.medal}>{MEDAL[idx]}</span>
                ) : (
                  <span style={st.rankNum}>{idx + 1}</span>
                )}
              </div>

              {/* Oyuncu */}
              <div style={st.playerCol}>
                <span style={st.playerName}>{row.isim}</span>
                <div style={st.playerMeta}>
                  <span>{flag(row.milliyet)} {row.milliyet}</span>
                  {row.mevki && <span style={st.posBadge}>{row.mevki}</span>}
                  <span style={st.minBadge}>{row.mac_sayisi} maç</span>
                </div>
              </div>

              {/* Değer */}
              <div style={{ ...st.valueCol, ...(isTop3 ? st.valueColTop : {}) }}>
                {val}
                <span style={st.valueSuffix}>{tab?.suffix}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const st = {
  page: { maxWidth: 820, margin: "0 auto" },
  header: {
    textAlign: "center",
    marginBottom: 24,
    padding: "28px 24px 0",
  },
  title: {
    fontSize: "clamp(22px,4vw,32px)", fontWeight: 900,
    color: "#0f172a", letterSpacing: -0.5, marginBottom: 6,
  },
  sub: { color: "#64748b", fontSize: 12, lineHeight: 1.6 },

  tabs: {
    display: "flex", flexWrap: "wrap", gap: 8,
    justifyContent: "center", marginBottom: 12,
  },
  tab: {
    background: "#ffffff", border: "1px solid #e2e8f0",
    borderRadius: 20, color: "#64748b",
    cursor: "pointer", fontSize: 12, fontWeight: 600,
    padding: "7px 16px", transition: "all .15s",
    boxShadow: "0 1px 2px rgba(0,0,0,.04)",
  },
  tabActive: {
    background: "#fef3c7", border: "1px solid #fde68a",
    color: "#d97706",
    boxShadow: "0 2px 8px rgba(245,158,11,.15)",
  },

  desc: {
    textAlign: "center", color: "#94a3b8", fontSize: 11,
    marginBottom: 16,
  },

  card: {
    background: "#ffffff", border: "1px solid #e2e8f0",
    borderRadius: 16, overflow: "hidden",
    boxShadow: "0 1px 4px rgba(0,0,0,.06)",
  },
  loading: {
    textAlign: "center", padding: "48px 0",
    color: "#94a3b8", fontSize: 13,
  },

  row: {
    display: "flex", alignItems: "center", gap: 16,
    padding: "13px 20px",
    borderBottom: "1px solid #f1f5f9",
    transition: "background .15s",
  },
  rowTop: {
    background: "rgba(251,191,36,0.04)",
  },

  rank: { width: 36, flexShrink: 0, textAlign: "center" },
  medal: { fontSize: 22, lineHeight: 1 },
  rankNum: { color: "#94a3b8", fontSize: 14, fontWeight: 700 },

  playerCol: {
    flex: 1, minWidth: 0,
    display: "flex", flexDirection: "column", gap: 3,
  },
  playerName: {
    color: "#0f172a", fontSize: 14, fontWeight: 700,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  playerMeta: {
    display: "flex", alignItems: "center", gap: 6,
    color: "#64748b", fontSize: 11, flexWrap: "wrap",
  },
  posBadge: {
    background: "rgba(56,189,248,.1)", border: "1px solid rgba(56,189,248,.2)",
    borderRadius: 4, color: "#38bdf8", fontSize: 10, fontWeight: 700,
    padding: "1px 7px",
  },
  minBadge: {
    background: "#f1f5f9", borderRadius: 4, color: "#94a3b8",
    fontSize: 10, padding: "1px 7px",
  },

  valueCol: {
    flexShrink: 0, textAlign: "right",
    fontSize: 20, fontWeight: 900, color: "#94a3b8",
    minWidth: 70,
  },
  valueColTop: { color: "#d97706" },
  valueSuffix: { fontSize: 11, fontWeight: 400, marginLeft: 2, opacity: 0.6 },
};
