/**
 * GoalkeeperStats — Kaleciye özel sezonluk analiz kartı.
 * Kurtarış oranı, gol yememek, GA90, galibiyet/mağlubiyet dağılımı.
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// Renk: save% iyiyse yeşil, kötüyse kırmızı
function savePctColor(pct) {
  if (pct == null) return "#94a3b8";
  if (pct >= 74) return "#10b981";
  if (pct >= 69) return "#f59e0b";
  return "#ef4444";
}

// GA90 rengi: düşük = iyi (yeşil)
function ga90Color(v) {
  if (v == null) return "#94a3b8";
  if (v <= 0.9)  return "#10b981";
  if (v <= 1.2)  return "#f59e0b";
  return "#ef4444";
}

function Bar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width .5s" }} />
    </div>
  );
}

function WDLBar({ w, d, l }) {
  const total = (w ?? 0) + (d ?? 0) + (l ?? 0);
  if (!total) return null;
  const wp = (w / total) * 100, dp = (d / total) * 100, lp = (l / total) * 100;
  return (
    <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 1 }}>
      <div style={{ width: `${wp}%`, background: "#10b981" }} title={`Galibiyet: ${w}`} />
      <div style={{ width: `${dp}%`, background: "#f59e0b" }} title={`Beraberlik: ${d}`} />
      <div style={{ width: `${lp}%`, background: "#ef4444" }} title={`Mağlubiyet: ${l}`} />
    </div>
  );
}

export default function GoalkeeperStats({ playerId }) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(null); // açık sezon index

  useEffect(() => {
    if (!playerId) return;
    setLoading(true);
    fetch(`${API_BASE}/player/${playerId}/gk-stats`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setRows(d); setLoading(false); if (d.length) setOpen(0); })
      .catch(() => setLoading(false));
  }, [playerId]);

  if (loading) return <div style={st.empty}>Kaleci istatistikleri yükleniyor…</div>;
  if (!rows.length) return null; // Alan oyuncusu veya veri yok

  return (
    <div style={st.wrap}>
      <div style={st.header}>
        <span style={st.icon}>🧤</span>
        <h3 style={st.title}>Kaleci Analizi</h3>
        <span style={st.badge}>{rows.length} sezon</span>
      </div>

      <div style={st.list}>
        {rows.map((r, i) => {
          const isOpen = open === i;
          const svColor = savePctColor(r.kurtaris_pct);
          const gaColor = ga90Color(r.ga90);

          return (
            <div key={`${r.lig}-${r.sezon}`}>
              {/* Sezon başlık satırı */}
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                style={{ ...st.seasonRow, background: isOpen ? "#f8fafc" : "#fff" }}
              >
                <div style={st.seasonLeft}>
                  <span style={st.seasonLig}>{r.lig}</span>
                  <span style={st.seasonBadge}>{r.sezon}</span>
                  {r.takim && <span style={st.teamName}>{r.takim}</span>}
                </div>
                <div style={st.seasonMeta}>
                  <span style={{ ...st.metaVal, color: svColor }}>
                    {r.kurtaris_pct != null ? `${r.kurtaris_pct.toFixed(1)}%` : "—"}
                  </span>
                  <span style={st.metaLbl}>Sv%</span>
                  <span style={{ ...st.metaVal, color: gaColor }}>
                    {r.ga90 != null ? r.ga90.toFixed(2) : "—"}
                  </span>
                  <span style={st.metaLbl}>GA/90</span>
                  <span style={st.metaVal}>{r.gol_yenmeme ?? "—"}</span>
                  <span style={st.metaLbl}>CS</span>
                  <span style={st.chevron}>{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>

              {/* Detay paneli */}
              {isOpen && (
                <div style={st.detail}>
                  {/* Kurtarış oranı */}
                  <div style={st.statGroup}>
                    <div style={st.statHeader}>Kurtarış Oranı</div>
                    <div style={st.bigNum}>
                      <span style={{ color: svColor, fontSize: 28, fontWeight: 900 }}>
                        {r.kurtaris_pct != null ? `${r.kurtaris_pct.toFixed(1)}%` : "—"}
                      </span>
                      {r.kurtaris != null && r.isabetli_sut_karsi != null && (
                        <span style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>
                          {r.kurtaris} / {r.isabetli_sut_karsi} şut
                        </span>
                      )}
                    </div>
                    {r.kurtaris_pct != null && (
                      <Bar value={r.kurtaris_pct} max={100} color={svColor} />
                    )}
                  </div>

                  {/* İkili metrik satırı */}
                  <div style={st.twoCol}>
                    <div style={st.metricBox}>
                      <div style={st.metricLbl}>Gol Yenilen / 90</div>
                      <div style={{ ...st.metricVal, color: gaColor }}>
                        {r.ga90 != null ? r.ga90.toFixed(2) : "—"}
                      </div>
                      {r.yenilen_gol != null && (
                        <div style={st.metricSub}>{r.yenilen_gol} gol / {r.mac_sayisi ?? "?"} maç</div>
                      )}
                    </div>
                    <div style={st.metricBox}>
                      <div style={st.metricLbl}>Gol Yememe (CS)</div>
                      <div style={st.metricVal}>{r.gol_yenmeme ?? "—"}</div>
                      {r.gol_yenmeme_pct != null && (
                        <div style={st.metricSub}>{r.gol_yenmeme_pct.toFixed(0)}% maçlarda</div>
                      )}
                    </div>
                  </div>

                  {/* G/B/M dağılımı */}
                  {(r.galibiyet != null || r.beraberlik != null || r.maglubiyet != null) && (
                    <div style={st.statGroup}>
                      <div style={st.statHeader}>Maç Sonuçları</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                        <span style={{ ...st.wdlDot, background: "#10b981" }} />
                        <span style={st.wdlLbl}>G {r.galibiyet ?? 0}</span>
                        <span style={{ ...st.wdlDot, background: "#f59e0b" }} />
                        <span style={st.wdlLbl}>B {r.beraberlik ?? 0}</span>
                        <span style={{ ...st.wdlDot, background: "#ef4444" }} />
                        <span style={st.wdlLbl}>M {r.maglubiyet ?? 0}</span>
                        <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: "auto" }}>
                          {r.mac_sayisi ?? ((r.galibiyet ?? 0) + (r.beraberlik ?? 0) + (r.maglubiyet ?? 0))} maç
                        </span>
                      </div>
                      <WDLBar w={r.galibiyet} d={r.beraberlik} l={r.maglubiyet} />
                    </div>
                  )}

                  {/* Penaltı */}
                  {r.penalti_deneme > 0 && (
                    <div style={st.pkRow}>
                      <span style={st.pkIcon}>🥅</span>
                      <span style={st.pkText}>
                        Penaltı: <b>{r.penalti_kurtaris ?? 0}</b> kurtarış / {r.penalti_deneme} deneme
                      </span>
                    </div>
                  )}

                  {/* Dakika bilgisi */}
                  {r.dakika && (
                    <div style={st.footer}>
                      {r.dakika.toLocaleString()} dakika · {r.kaynak?.toUpperCase()}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const st = {
  wrap: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 28,
  },
  header: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "14px 18px 12px",
    borderBottom: "1px solid #f1f5f9",
  },
  icon:  { fontSize: 18 },
  title: { fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0, flex: 1 },
  badge: {
    background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.2)",
    borderRadius: 6, color: "#10b981", fontSize: 11, fontWeight: 700, padding: "2px 10px",
  },
  list:  { display: "flex", flexDirection: "column" },

  seasonRow: {
    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 18px",
    border: "none", borderBottom: "1px solid #f1f5f9",
    cursor: "pointer", textAlign: "left",
    transition: "background .15s",
  },
  seasonLeft: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 },
  seasonLig:  { fontSize: 12, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" },
  seasonBadge: {
    background: "#f1f5f9", borderRadius: 5, color: "#64748b",
    fontSize: 10, fontWeight: 700, padding: "1px 7px", whiteSpace: "nowrap",
  },
  teamName: {
    fontSize: 11, color: "#64748b",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120,
  },
  seasonMeta: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
  metaVal: { fontSize: 13, fontWeight: 800, color: "#0f172a" },
  metaLbl: { fontSize: 9, color: "#94a3b8", fontWeight: 600 },
  chevron: { fontSize: 9, color: "#94a3b8", marginLeft: 4 },

  detail: { padding: "14px 18px 16px", borderBottom: "1px solid #f1f5f9", background: "#fafafa" },

  statGroup: { marginBottom: 14 },
  statHeader: { fontSize: 9, fontWeight: 700, color: "#94a3b8", letterSpacing: ".08em", marginBottom: 6, textTransform: "uppercase" },

  bigNum: { display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 },

  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 },
  metricBox: {
    background: "#fff", border: "1px solid #e2e8f0",
    borderRadius: 10, padding: "10px 14px",
  },
  metricLbl: { fontSize: 10, color: "#64748b", fontWeight: 600, marginBottom: 4 },
  metricVal: { fontSize: 22, fontWeight: 900, color: "#0f172a", lineHeight: 1 },
  metricSub: { fontSize: 10, color: "#94a3b8", marginTop: 3 },

  wdlDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  wdlLbl: { fontSize: 11, fontWeight: 700, color: "#0f172a" },

  pkRow: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 12px", background: "#fff",
    border: "1px solid #e2e8f0", borderRadius: 8, marginTop: 10,
  },
  pkIcon: { fontSize: 14 },
  pkText: { fontSize: 12, color: "#475569" },

  footer: { fontSize: 10, color: "#94a3b8", marginTop: 10, textAlign: "right" },
  empty:  { color: "#94a3b8", fontSize: 13, padding: "20px", textAlign: "center" },
};
